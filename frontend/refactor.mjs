import fs from 'node:fs';
import path from 'node:path';
const root='src';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s)};
const move=(a,b)=>{write(b,read(a));fs.unlinkSync(path.join(root,a))};
// Preserve existing page markup; move screen implementations under their owner.
for(const [name,feature,type] of [['Employees','employees','employee'],['Customers','customers','customer']]) {
 let s=read(`pages/${name}Page.tsx`).replace(`export function ${name}Page()`,`export function ${name}Directory()`);
 s=s.replaceAll("'../components/","'../../../components/").replaceAll("'../utils/","'../../../utils/");
 s=s.replace("'../types/models'",`'../types/${type}'`).replace(`'../hooks/use${name}'`,`'../hooks/use${name}'`);
 write(`features/${feature}/components/${name}Directory.tsx`,s);
 write(`pages/${name}Page.tsx`,`import { ${name}Directory } from '../features/${feature}/components/${name}Directory'\n\nexport function ${name}Page() {\n  return <${name}Directory />\n}\n`);
}
for(const [name,feature,type,fetcher] of [['Employees','employees','employee','fetchEmployees'],['Customers','customers','customer','fetchCustomers']]) {
 let s=read(`hooks/use${name}.ts`).replace("'../types/models'",`'../types/${type}'`).replace("'../data/samples'",`'../data/sample${name}'`);
 s=s.replace("import { api } from '../services/api'",`import { ${fetcher} } from '../services/${feature}Service'`).replace("import { listFrom } from '../utils/listFrom'\n",'');
 s=s.replace('useState(false)','useState(true)').replace('    setLoading(true)\n','    let cancelled = false\n');
 s=s.replace(/    api.get\([^\n]+\)\n      .then\([^\n]+\)/,`    ${fetcher}()\n      .then((next) => { if (!cancelled) setRows(next) })`);
 s=s.replace(`.catch(() => setRows(sample${name}))`,`.catch(() => { if (!cancelled) setRows(sample${name}) })`).replace('.finally(() => setLoading(false))','.finally(() => { if (!cancelled) setLoading(false) })\n    return () => { cancelled = true }');
 write(`features/${feature}/hooks/use${name}.ts`,s);fs.unlinkSync(path.join(root,`hooks/use${name}.ts`));
}
let login=read('pages/LoginPage.tsx');
const start=login.indexOf('          <Form layout=');const end=login.indexOf('          </Form>',start)+'          </Form>'.length;
const form=login.slice(start,end);
write('features/auth/components/LoginForm.tsx',`import { UserOutlined } from '@ant-design/icons'\nimport { Button, Form, Input } from 'antd'\nimport type { LoginCredentials } from '../types/auth'\n\nexport function LoginForm({ onLogin }: { onLogin: (values: LoginCredentials) => Promise<void> }) {\n  return (\n${form}\n  )\n}\n`);
login=login.slice(0,start)+'          <LoginForm onLogin={onLogin} />'+login.slice(end);
login=login.replace("import { UserOutlined } from '@ant-design/icons'\n",'').replace('Button, Card, ConfigProvider, Form, Input, Statistic','Card, Statistic').replace("import { gram, money }", "import { LoginForm } from '../features/auth/components/LoginForm'\nimport { LoginProvider } from '../app/providers/ThemeProviders'\nimport type { LoginCredentials } from '../features/auth/types/auth'\nimport { gram, money }");
login=login.replace('(values: { username: string; password: string })','(values: LoginCredentials)').replace(/<ConfigProvider theme=\{\{ token:.*?\}\}>/,'<LoginProvider>').replace('</ConfigProvider>','</LoginProvider>');
write('pages/LoginPage.tsx',login);
let ledger=read('pages/LedgerPage.tsx');
const entryStart=ledger.indexOf('  const entryColumns:');const statsStart=ledger.indexOf('  const debtCustomers');
const entryColumns=ledger.slice(entryStart,statsStart);
const detailStart=ledger.indexOf('      <section className="ledger-detail">');const detailEnd=ledger.indexOf('      </section>',detailStart)+'      </section>'.length;
const detail=ledger.slice(detailStart,detailEnd);
const imports=`import { Button, Card, Space, Statistic, Tag, Typography } from 'antd'\nimport type { ColumnsType } from 'antd/es/table'\nimport type { LedgerSummary, LedgerEntry } from '../types/ledger'\nimport { DataTable } from '../../../components/common/DataTable'\nimport { dateText, gram, money } from '../../../utils/format'\n`;
write('features/customer-ledger/components/LedgerDetail.tsx',imports+`\nexport function LedgerDetail({ activeCustomer, entries }: { activeCustomer: LedgerSummary; entries: LedgerEntry[] }) {\n${entryColumns}  return (\n${detail}\n  )\n}\n`);
ledger=ledger.slice(0,detailStart)+'      <LedgerDetail activeCustomer={activeCustomer} entries={entries} />'+ledger.slice(detailEnd);
ledger=ledger.replace(entryColumns,'').replace('Space, Statistic, Tabs, Tag, Typography','Statistic, Tabs').replace('LedgerSummary, LedgerEntry','LedgerSummary');
ledger=ledger.replaceAll("'../components/","'../../../components/").replaceAll("'../utils/","'../../../utils/").replace("'../types/models'","'../types/ledger'");
ledger=ledger.replace('export function LedgerPage()', 'export function CustomerLedger()').replace("import { useLedger }", "import { LedgerDetail } from './LedgerDetail'\nimport { useLedger }");
write('features/customer-ledger/components/CustomerLedger.tsx',ledger);
write('pages/LedgerPage.tsx',`import { CustomerLedger } from '../features/customer-ledger/components/CustomerLedger'\n\nexport function LedgerPage() {\n  return <CustomerLedger />\n}\n`);
move('app/PageRouter.tsx','app/router/PageRouter.tsx');
write('app/router/PageRouter.tsx',read('app/router/PageRouter.tsx').replaceAll("'../pages/","'../../pages/").replace("'../types/models'","'./types'"));
write('app/router/types.ts',"export type PageKey = 'customers' | 'employees' | 'ledger'\n");
for(const file of ['components/layout/HeaderBar.tsx','components/layout/Sidebar.tsx']) {
 let s=read(file).replace("import type { PageKey, UserProfile } from '../../types/models'","import type { PageKey } from '../../app/router/types'\nimport type { UserProfile } from '../../features/auth/types/auth'").replace("'../../types/models'","'../../app/router/types'");write(file,s);
}
write('utils/roleText.ts',read('utils/roleText.ts').replace("'../types/models'","'../features/employees/types/employee'"));
for(const feature of ['customers','employees','customer-ledger']) {const service=feature==='customer-ledger'?'ledger':feature;const p=`features/${feature}/services/${service}Service.ts`;write(p,read(p).replace("'../../../types/api'","'../../../utils/listFrom'"));}
write('types/api.ts',read('types/api.ts').split('\nexport function listFrom')[0]+'\n');
write('utils/listFrom.ts',read('utils/listFrom.ts').replace("'../types/models'","'../types/api'"));
write('app/providers/ThemeProviders.tsx',`import type { ReactNode } from 'react'\nimport { ConfigProvider, theme } from 'antd'\nimport type { ThemeConfig } from 'antd'\n\nconst baseTheme: ThemeConfig = {\n  token: { colorPrimary: '#1946f2', borderRadius: 6, fontFamily: 'Inter, system-ui, Segoe UI, sans-serif' },\n}\n\nexport function LoginProvider({ children }: { children: ReactNode }) {\n  return <ConfigProvider theme={baseTheme}>{children}</ConfigProvider>\n}\n\nexport function WorkspaceProvider({ children }: { children: ReactNode }) {\n  return <ConfigProvider theme={{ ...baseTheme, algorithm: theme.defaultAlgorithm, components: { Table: { headerBg: '#f9f9f9', headerColor: '#737373', fontSize: 12, cellPaddingBlock: 12 } } }}>{children}</ConfigProvider>\n}\n`);
let app=read('App.tsx');const shellStart=app.indexOf('      <Layout className="app-shell">');const shellEnd=app.indexOf('    </ConfigProvider>');let shell=app.slice(shellStart,shellEnd).trim();
write('components/layout/WorkspaceLayout.tsx',`import { Layout } from 'antd'\nimport type { ReactNode } from 'react'\nimport type { PageKey } from '../../app/router/types'\nimport type { UserProfile } from '../../features/auth/types/auth'\nimport { Sidebar } from './Sidebar'\nimport { HeaderBar } from './HeaderBar'\n\ntype WorkspaceLayoutProps = {\n  page: PageKey\n  onPageChange: (page: PageKey) => void\n  profile: UserProfile | null\n  onLogout: () => void\n  children: ReactNode\n}\n\nexport function WorkspaceLayout({ page, onPageChange, profile, onLogout, children }: WorkspaceLayoutProps) {\n  return (\n${shell.replace('setPage','onPageChange').replace('handleLogout','onLogout').replace('<PageRouter page={page} />','{children}')}\n  )\n}\n`);
write('app/App.tsx',`import { useState } from 'react'\nimport type { PageKey } from './router/types'\nimport { useAuth } from '../features/auth/hooks/useAuth'\nimport { WorkspaceProvider } from './providers/ThemeProviders'\nimport { WorkspaceLayout } from '../components/layout/WorkspaceLayout'\nimport { LoginPage } from '../pages/LoginPage'\nimport { PageRouter } from './router/PageRouter'\nimport '../styles/application.css'\n\nexport default function App() {\n  const { token, profile, handleLogin, handleLogout } = useAuth()\n  const [page, setPage] = useState<PageKey>('employees')\n  if (!token) return <LoginPage onLogin={handleLogin} />\n  return (\n    <WorkspaceProvider>\n      <WorkspaceLayout page={page} onPageChange={setPage} profile={profile} onLogout={handleLogout}>\n        <PageRouter page={page} />\n      </WorkspaceLayout>\n    </WorkspaceProvider>\n  )\n}\n`);
move('App.css','styles/application.css');write('main.tsx',read('main.tsx').replace("'./App.tsx'","'./app/App.tsx'"));
for(const file of ['App.tsx','data/samples.ts','types/models.ts','services/api.ts'])fs.unlinkSync(path.join(root,file));
