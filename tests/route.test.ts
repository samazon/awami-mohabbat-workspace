import { describe, expect, it } from 'vitest';
import { isPageInRange, parseColumnsQuery } from '../src/lib/columns/route';

const q = (s: string) => parseColumnsQuery(new URLSearchParams(s));

describe('parseColumnsQuery', () => {
  it('defaults to page 1, all columnists', () => {
    expect(q('')).toEqual({ ok: true, page: 1, columnist: null });
  });
  it('reads a valid page and columnist', () => {
    expect(q('page=3&columnist=iqbal-khokhar')).toEqual({ ok: true, page: 3, columnist: 'iqbal-khokhar' });
  });
  it.each(['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=01', 'page=', 'page=100000'])('rejects %s', (s) => {
    expect(q(s)).toEqual({ ok: false });
  });
  it.each(['columnist=../x', 'columnist=IQBAL', 'columnist='])('treats %s as all columnists', (s) => {
    expect(q(s)).toEqual({ ok: true, page: 1, columnist: null });
  });
});

describe('isPageInRange', () => {
  it('always allows page 1, even when empty', () => expect(isPageInRange(1, 0, 1)).toBe(true));
  it('allows pages up to the last', () => expect(isPageInRange(2, 13, 2)).toBe(true));
  it('rejects pages past the last', () => expect(isPageInRange(3, 13, 2)).toBe(false));
  it('rejects page 2 of nothing', () => expect(isPageInRange(2, 0, 1)).toBe(false));
});
