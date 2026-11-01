// CSV for spreadsheets (spec 05, "CSV rules"): every cell quoted, and a ' in front of a cell that
// a spreadsheet could run as a formula (OWASP, "CSV Injection"). The JSON snapshot keeps the original.

// A ' also gets a ' in front, so removing one leading ' always gives the value back.
const FORMULA_START = /^[=+\-@＝＋－＠\t\r\n']/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

// A list in one cell: ";" between items, and a "\" in front of a "\" or ";" in an item.
export function csvList(items: readonly string[]): string {
  return items.map((item) => item.replaceAll('\\', '\\\\').replaceAll(';', '\\;')).join(';');
}

// UTF-8 with a byte order mark, so spreadsheet apps read accents correctly. CRLF ends each row.
export function csvText(rows: readonly (readonly string[])[]): string {
  return `﻿${rows.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('')}`;
}
