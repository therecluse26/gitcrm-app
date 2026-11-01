// Reads the CSV that core/csv.ts writes, by the rules in spec 05 ("CSV rules"), so tests can
// check a round trip. Strict on purpose: an unquoted cell or a missing CRLF is an error.

export function readCsv(text: string): string[][] {
  if (!text.startsWith('﻿')) throw new Error('No byte order mark');
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 1;
  while (i < text.length) {
    if (text[i] !== '"') throw new Error(`Unquoted cell at ${i}`);
    let cell = '';
    i++;
    for (;;) {
      const quote = text.indexOf('"', i);
      if (quote === -1) throw new Error('Unclosed quote');
      cell += text.slice(i, quote);
      i = quote + 1;
      if (text[i] !== '"') break;
      cell += '"';
      i++;
    }
    row.push(cell);
    if (text[i] === ',') i++;
    else if (text.startsWith('\r\n', i)) {
      rows.push(row);
      row = [];
      i += 2;
    } else throw new Error(`Expected a comma or CRLF at ${i}`);
  }
  if (row.length > 0) throw new Error('The last row has no CRLF');
  return rows;
}

// A cell's value, without the ' that spreadsheet safety puts in front.
export const readValue = (cell: string) => (cell.startsWith("'") ? cell.slice(1) : cell);

// The items of a list cell.
export function readList(cell: string): string[] {
  const value = readValue(cell);
  if (value === '') return [];
  const items: string[] = [];
  let item = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') item += value[++i];
    else if (value[i] === ';') {
      items.push(item);
      item = '';
    } else item += value[i];
  }
  items.push(item);
  return items;
}
