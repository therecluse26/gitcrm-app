import { describe, expect, it } from 'vitest';
import { changeView, onePage, PAGE_SIZE } from './list-page.ts';

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('onePage (spec 08)', () => {
  it('shows 50 rows a page, and says which rows', () => {
    expect(PAGE_SIZE).toBe(50);
    const first = onePage(items(120), 0);
    expect(first).toMatchObject({ index: 0, count: 3, from: 1, to: 50, total: 120 });
    expect(first.rows).toEqual(items(50));
    const last = onePage(items(120), 2);
    expect(last).toMatchObject({ index: 2, count: 3, from: 101, to: 120 });
    expect(last.rows).toEqual(items(120).slice(100));
  });

  it('shows the last page when the list got shorter, and the first page for a negative number', () => {
    expect(onePage(items(51), 1).rows).toEqual([51]);
    expect(onePage(items(50), 1)).toMatchObject({ index: 0, count: 1, from: 1, to: 50 });
    expect(onePage(items(120), -1)).toMatchObject({ index: 0, from: 1 });
  });

  it('has one empty page for an empty list', () => {
    expect(onePage([], 3)).toEqual({ rows: [], index: 0, count: 1, from: 0, to: 0, total: 0 });
  });
});

describe('changeView', () => {
  const view = { query: 'ava', sort: 'name', page: 2 };

  it('starts at the first page after any other change', () => {
    expect(changeView(view, { query: 'ava b' })).toEqual({ query: 'ava b', sort: 'name', page: 0 });
  });

  it('keeps the rest of the view for a page change', () => {
    expect(changeView(view, { page: 3 })).toEqual({ query: 'ava', sort: 'name', page: 3 });
  });
});
