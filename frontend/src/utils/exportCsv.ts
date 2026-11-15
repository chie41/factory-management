export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    const text = String(value ?? '')
    const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text
    return '"' + safe.replaceAll('"', '""') + '"'
  }
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

