import { describe, expect, it } from 'vitest';
import { readCsv, readList, readValue } from '../test/csv-reader.ts';
import { csvCell, csvList, csvText } from './csv.ts';

describe('csvCell', () => {
  it('puts every cell in double quotes, and writes a double quote twice', () => {
    expect(csvCell('Ava')).toBe('"Ava"');
    expect(csvCell('')).toBe('""');
    expect(csvCell('say "hi", then go')).toBe('"say ""hi"", then go"');
  });

  it('puts a single quote in front of a cell that a spreadsheet could run as a formula', () => {
    for (const start of ['=', '+', '-', '@', '＝', '＋', '－', '＠', '\t', '\r', '\n', "'"]) {
      expect(csvCell(`${start}SUM(A1)`), JSON.stringify(start)).toBe(`"'${start}SUM(A1)"`);
    }
  });

  it('leaves other cells as they are, even with a formula character after the start', () => {
    for (const value of ['Ava', '2026-10-30', '1200000', 'a=b', 'Zoë', ' =x']) expect(csvCell(value)).toBe(`"${value}"`);
  });
});

describe('csvList', () => {
  it('joins the items with ";", and puts a "\\" in front of a "\\" or ";" in an item', () => {
    expect(csvList([])).toBe('');
    expect(csvList(['a@x.example', 'b@x.example'])).toBe('a@x.example;b@x.example');
    expect(csvList(['a;b', 'c\\d'])).toBe('a\\;b;c\\\\d');
  });
});

describe('csvText', () => {
  it('starts with a byte order mark, and ends every row with CRLF', () => {
    expect(csvText([['id', 'name'], ['1', 'Ava']])).toBe('﻿"id","name"\r\n"1","Ava"\r\n');
  });

  it('reads back every value: Unicode, quotes, commas, CRLF and LF in a cell, a formula, a list, and a long note', () => {
    const values = ['Zoë Ålund 日本 🙂', 'say "hi", then go', 'line 1\r\nline 2\nline 3', '=HYPERLINK("http://x.example")', "'quoted", '', 'x'.repeat(50_000)];
    const lists = [[], ['+1 555 0100', '+44 20 7946 0000'], ['a;b', 'c\\d', "'e"]];
    const rows = readCsv(csvText([values, lists.map(csvList)]));
    expect(rows[0].map(readValue)).toEqual(values);
    expect(rows[1].map(readList)).toEqual(lists);
  });
});
