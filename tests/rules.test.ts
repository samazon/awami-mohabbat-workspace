import { describe, expect, it } from 'vitest';
import { ArticleRuleError, ColumnInput, ColumnistInput, assertArticleInvariants } from '../src/lib/columns/rules';

const column = {
  slug: 'maqami-sahafat',
  columnist: 'iqbal-khokhar',
  publishedDate: '2026-09-20',
  ur: { title: 'مقامی صحافت', excerpt: 'مختصر', body: 'متن' },
};

describe('ColumnInput', () => {
  it('accepts a valid column and defaults to draft', () => {
    expect(ColumnInput.parse(column).status).toBe('draft');
  });
  it.each(['../x', 'Maqami', 'a b', ''])('rejects slug %j', (slug) => {
    expect(() => ColumnInput.parse({ ...column, slug })).toThrow();
  });
  it.each(['2026-02-30', '20-09-2026', '2026-9-1'])('rejects date %j', (publishedDate) => {
    expect(() => ColumnInput.parse({ ...column, publishedDate })).toThrow();
  });
  it('rejects an empty Urdu title', () => {
    expect(() => ColumnInput.parse({ ...column, ur: { ...column.ur, title: '  ' } })).toThrow();
  });
});

describe('ColumnistInput', () => {
  it('requires a real content hash', () => {
    const base = { slug: 'iqbal-khokhar', nameUr: 'اقبال کھوکھر', columnTitleUr: 'قلم کا فرض', banner: { hash: 'a1b2c3d4e5f60718', width: 902, height: 625 } };
    expect(ColumnistInput.parse(base).active).toBe(true);
    expect(() => ColumnistInput.parse({ ...base, banner: { ...base.banner, hash: 'nope' } })).toThrow();
  });
});

describe('assertArticleInvariants', () => {
  it('requires a columnist on a column', () => {
    expect(() => assertArticleInvariants({ category: 'column', columnistId: null, translations: [] })).toThrow(ArticleRuleError);
  });
  it('forbids a columnist on other categories', () => {
    expect(() => assertArticleInvariants({ category: 'report', columnistId: 1, translations: [{ author: 'x' }] })).toThrow(ArticleRuleError);
  });
  it('requires an author on every translation of a non-column', () => {
    expect(() => assertArticleInvariants({ category: 'sports', columnistId: null, translations: [{ author: 'ثمینہ' }, { author: null }] })).toThrow(/author/);
  });
  it('passes valid articles', () => {
    expect(() => assertArticleInvariants({ category: 'column', columnistId: 1, translations: [{ author: null }] })).not.toThrow();
    expect(() => assertArticleInvariants({ category: 'report', columnistId: null, translations: [{ author: 'ثمینہ رشید' }] })).not.toThrow();
  });
});
