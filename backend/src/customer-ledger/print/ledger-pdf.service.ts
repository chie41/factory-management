import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { ledgerPagination } from './ledger-pagination.js';

// Chromium's native PDF renderer; no browser download or PDF layout dependency.
// A private profile and pipe are used; never attach to the user's browser session.
@Injectable()
export class LedgerPdfService {
  private active = 0;

  private async executable() {
    const candidates = process.env['LEDGER_PDF_BROWSER_PATH']
      ? [process.env['LEDGER_PDF_BROWSER_PATH']]
      : process.platform === 'win32'
        ? [join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
           join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')]
        : process.platform === 'darwin'
          ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
          : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
    for (const candidate of candidates) {
      try { await access(candidate!); return candidate!; } catch { /* Try next installed browser. */ }
    }
    throw new ServiceUnavailableException('Chưa có Chromium để xuất PDF. Cấu hình LEDGER_PDF_BROWSER_PATH trỏ đến Chrome/Chromium trên máy backend.');
  }

  async render(markup: string): Promise<Buffer> {
    // The client sends only the static report, never an app URL or user session.
    // Reject navigable/active elements in addition to CSP, script and network blocking.
    const allowed = new Set(['style', 'article', 'header', 'section', 'h1', 'p', 'div', 'span', 'b', 'strong', 'small', 'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td', 'br']);
    for (const tag of markup.matchAll(/<\/?([a-z][a-z0-9:-]*)\b/gi)) {
      if (!allowed.has(tag[1]!.toLowerCase())) throw new BadRequestException('Bản in chứa thành phần không được hỗ trợ');
    }
    if (this.active >= 2) throw new ServiceUnavailableException('Đang tạo nhiều bản PDF. Vui lòng thử lại sau.');
    this.active++;
    let profile: string | undefined;
    let browser: ReturnType<typeof spawn> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closeBrowser: (() => void) | undefined;
    const pending = new Map<number, { resolve: (result: Record<string, any>) => void; reject: (error: Error) => void }>();
    const fail = () => {
      for (const request of pending.values()) request.reject(new Error('Chromium PDF stopped'));
      pending.clear();
    };
    try {
      const executable = await this.executable();
      profile = await mkdtemp(join(tmpdir(), 'factory-ledger-pdf-'));
      browser = spawn(executable, [
        '--headless', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--disable-background-networking', '--disable-sync', '--disable-component-update',
        '--disable-breakpad', '--disable-crash-reporter', 'about:blank',
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
      browser.on('error', fail);
      browser.on('exit', fail);
      timer = setTimeout(() => { fail(); browser?.kill(); }, 60_000);
      let sequence = 0;
      let received = '';
      const reader = browser.stdio[4] as Readable;
      const writer = browser.stdio[3] as Writable;
      reader.on('error', fail);
      writer.on('error', fail);
      reader.setEncoding('utf8');
      reader.on('data', (chunk: string) => {
        received += chunk;
        let separator: number;
        while ((separator = received.indexOf('\0')) >= 0) {
          const message = received.slice(0, separator);
          received = received.slice(separator + 1);
          try {
            const response = JSON.parse(message) as { id?: number; result?: Record<string, any>; error?: unknown };
            if (!response.id) continue;
            const request = pending.get(response.id);
            pending.delete(response.id);
            if (response.error) request?.reject(new Error('Chromium PDF command failed'));
            else request?.resolve(response.result ?? {});
          } catch { fail(); }
        }
      });
      const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<Record<string, any>>((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        writer.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0', error => {
          if (error) { pending.delete(id); reject(error); }
        });
      });
      closeBrowser = () => { void command('Browser.close').catch(() => undefined); };
      const target = await command('Target.createTarget', { url: 'about:blank' });
      const session = await command('Target.attachToTarget', { targetId: target['targetId'], flatten: true });
      const sessionId = session['sessionId'] as string;
      await command('Page.enable', {}, sessionId);
      await command('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
      await command('Network.enable', {}, sessionId);
      await command('Network.setBlockedURLs', { urls: ['*'] }, sessionId);
      await command('Emulation.setDeviceMetricsOverride', { width: 1047, height: 719, deviceScaleFactor: 1, mobile: false }, sessionId);
      await command('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
      const frame = await command('Page.getFrameTree', {}, sessionId);
      const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'none\'; base-uri \'none\'; form-action \'none\'">'
        + '<title>Sổ giao dịch</title></head><body>' + markup + '</body></html>';
      await command('Page.setDocumentContent', { frameId: frame['frameTree'].frame.id, html }, sessionId);
      // Measure the real print layout, not an estimated number of rows. Keep a
      // day together only when it can fit below the repeated table header.
      // This trusted expression runs in an isolated world; report scripts remain disabled.
      const world = await command('Page.createIsolatedWorld', { frameId: frame['frameTree'].frame.id, worldName: 'ledger-print-layout' }, sessionId);
      const layout = await command('Runtime.evaluate', {
        contextId: world['executionContextId'], returnByValue: true,
        expression: ledgerPagination,
      }, sessionId);
      if (layout['exceptionDetails'] || !layout['result']?.value) throw new Error('Cannot measure print layout: ' + JSON.stringify(layout['exceptionDetails']));
      const result = await command('Page.printToPDF', {
        landscape: true, paperWidth: 297 / 25.4, paperHeight: 210 / 25.4,
        marginTop: 10 / 25.4, marginBottom: 10 / 25.4, marginLeft: 10 / 25.4, marginRight: 10 / 25.4,
        printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;text-align:center;font-family:Arial,sans-serif;font-size:9pt;color:#222"><span class="pageNumber"></span>/<span class="totalPages"></span></div>',
      }, sessionId);
      const pdf = Buffer.from(result['data'] as string, 'base64');
      if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
      return pdf;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Không tạo được PDF. Kiểm tra Chrome/Chromium và LEDGER_PDF_BROWSER_PATH trên backend rồi thử lại.', { cause: error });
    } finally {
      if (timer) clearTimeout(timer);
      if (browser && browser.exitCode === null) {
        const exited = new Promise<void>(resolve => browser!.once('exit', () => resolve()));
        closeBrowser?.();
        await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 2_000))]);
        if (browser.exitCode === null) browser.kill();
      }
      fail();
      // Delete only the private directory created above, verified under the OS temp root.
      if (profile && resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith('factory-ledger-pdf-')) {
        await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      }
      this.active--;
    }
  }
}


