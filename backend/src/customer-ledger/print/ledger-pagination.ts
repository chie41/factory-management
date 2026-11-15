// Trusted isolated-world code. Input rows are a measurement staging format;
// only the page-local, structurally merged tables below are sent to printToPDF.
export const ledgerPagination = String.raw`(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:277mm;height:190mm';
  document.body.appendChild(probe);
  const paper = probe.getBoundingClientRect();
  document.body.style.width = paper.width + 'px';
  const source = document.querySelector('.ledger-print-table');
  if (!source) throw new Error('Missing ledger table');
  const headerHeight = source.tHead.getBoundingClientRect().height;
  // Allow for collapsed outer borders and Chromium's subpixel rounding.
  const capacity = paper.height - headerHeight - 4;
  const firstCapacity = capacity - source.getBoundingClientRect().top;
  const groups = [...source.querySelectorAll('.ledger-print-day')].map(body => ({
    body, rows: [...body.rows],
  }));
  const pages = [];
  let remaining = firstCapacity;
  function nextPage() {
    const table = source.cloneNode(false);
    table.append(source.querySelector('colgroup').cloneNode(true), source.tHead.cloneNode(true));
    if (pages.length) table.style.breakBefore = 'page';
    source.before(table);
    pages.push(table);
    remaining = pages.length === 1 ? firstCapacity : capacity;
    return table;
  }
  nextPage();
  const opening = source.tBodies[0].cloneNode(true);
  pages[0].append(opening);
  remaining -= source.tBodies[0].getBoundingClientRect().height;
  for (const { body, rows } of groups) {
    const heights = rows.map(row => row.getBoundingClientRect().height);
    const total = heights.reduce((a, b) => a + b, 0);
    if (total <= capacity && total > remaining) nextPage();
    const dateTemplate = rows[0].querySelector('.ledger-print-date');
    let offset = 0;
    while (offset < rows.length) {
      // A continuation adds the full date/count label and transaction context.
      // Reserve their measured first-row height before choosing a boundary.
      const firstEntry = rows.findIndex(row => row.dataset.ledgerEntry === rows[offset].dataset.ledgerEntry);
      const continuationReserve = offset && rows[offset].dataset.ledgerEntry
        ? Math.max(0, heights[0] - heights[offset], heights[firstEntry] - heights[offset])
          + dateTemplate.querySelector('b').getBoundingClientRect().height : 0;
      let end = offset, used = continuationReserve;
      while (end < rows.length) {
        // Prefer whole transactions, including the final summary when possible.
        let stop = end + 1;
        const id = rows[end].dataset.ledgerEntry;
        if (id) while (stop < rows.length && rows[stop].dataset.ledgerEntry === id) stop++;
        if (stop === rows.length - 1) stop++;
        let height = heights.slice(end, stop).reduce((a, b) => a + b, 0);
        if (height + continuationReserve > capacity) {
          stop = end + 1;
          height = heights[end];
          // Keep the final detail and summary together if they fit a page.
          if (stop === rows.length - 1 && height + heights[stop] <= capacity) {
            height += heights[stop++];
          }
        }
        if (used + height > remaining) break;
        used += height;
        end = stop;
      }
      if (end === offset) {
        if (remaining < capacity) { nextPage(); continue; }
        throw new Error('A ledger detail row exceeds the printable page height');
      }
      const fragment = document.createElement('tbody');
      fragment.className = 'ledger-print-day ledger-print-day-keep';
      fragment.dataset.ledgerDay = body.dataset.ledgerDay;
      const originals = rows.slice(offset, end);
      const copies = originals.map(row => row.cloneNode(true));
      const details = copies.filter(row => row.dataset.ledgerEntry);
      if (details.length) {
        const date = dateTemplate.cloneNode(true);
        date.rowSpan = details.length;
        if (offset) date.querySelector('b').append(' (tiếp)');
        details.forEach(row => row.querySelector('.ledger-print-date').remove());
        const hasStatus = source.tHead.rows[0].cells[0].textContent === 'TRẠNG THÁI';
        details[0].insertBefore(date, details[0].cells[hasStatus ? 1 : 0]);
        // Merge transaction-wide cells on this page; product cells stay independent.
        for (let i = 0; i < details.length;) {
          let j = i + 1;
          while (j < details.length && details[j].dataset.ledgerEntry === details[i].dataset.ledgerEntry) j++;
          const shared = row => [...row.cells].filter(cell => !cell.classList.contains('ledger-print-product') && !cell.classList.contains('ledger-print-date'));
          const cells = shared(details[i]);
          cells.forEach(cell => cell.rowSpan = j - i);
          // Continuations retain actor/type context, but never repeat financial values.
          if (originals[i].dataset.ledgerProduct !== '0') {
            const first = rows.find(row => row.dataset.ledgerEntry === details[i].dataset.ledgerEntry);
            const context = shared(first);
            const actor = hasStatus ? 1 : 0;
            cells[actor].innerHTML = context[actor].innerHTML;
            cells[actor + 1].innerHTML = context[actor + 1].innerHTML;
          }
          for (let k = i + 1; k < j; k++) shared(details[k]).forEach(cell => cell.remove());
          i = j;
        }
      }
      copies.forEach(row => fragment.append(row));
      pages[pages.length - 1].append(fragment);
      remaining -= used;
      offset = end;
      if (offset < rows.length) nextPage();
    }
  }
  source.remove();
  probe.remove();
  const expected = groups.flatMap(group => group.rows).filter(row => row.dataset.ledgerEntry);
  const printed = pages.flatMap(table => [...table.querySelectorAll('tr[data-ledger-entry]')]);
  if (expected.length !== printed.length || expected.some((row, i) =>
    row.dataset.ledgerEntry !== printed[i].dataset.ledgerEntry ||
    row.dataset.ledgerProduct !== printed[i].dataset.ledgerProduct)) {
    throw new Error('Ledger detail order or count changed');
  }
  for (const table of pages) for (const body of table.querySelectorAll('.ledger-print-day')) {
    const rows = [...body.rows];
    const details = rows.filter(row => row.dataset.ledgerEntry);
    const dates = body.querySelectorAll('.ledger-print-date');
    if (details.length && (dates.length !== 1 || dates[0].rowSpan !== details.length)) {
      throw new Error('Invalid page-local date merge');
    }
    rows.forEach((row, i) => {
      for (const cell of row.cells) if (i + cell.rowSpan > rows.length) {
        throw new Error('Ledger rowSpan crosses a page');
      }
    });
  }
  // Fail closed rather than silently letting a merged cell cross a page.
  pages.forEach((table, index) => {
    const limit = index ? paper.height : paper.height - table.getBoundingClientRect().top;
    if (table.getBoundingClientRect().height > limit + 1) throw new Error('Ledger page overflow');
  });
  return { pages: pages.length };
})()`;
