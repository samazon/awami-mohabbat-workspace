import { describe, expect, it } from 'vitest';
import { parseColumnFile } from '../scripts/column-file';

const file = `---
slug: maqami-sahafat
columnist: iqbal-khokhar
title: مقامی صحافت کی ذمہ داری
excerpt: خبر کی سچائی اور عوامی مفاد
date: 2026-09-15
status: published
---

## سرخی

متن۔
`;

describe('parseColumnFile', () => {
  it('reads front matter and the Markdown body', () => {
    expect(parseColumnFile(file)).toEqual({
      slug: 'maqami-sahafat',
      columnist: 'iqbal-khokhar',
      publishedDate: '2026-09-15',
      status: 'published',
      ur: { title: 'مقامی صحافت کی ذمہ داری', excerpt: 'خبر کی سچائی اور عوامی مفاد', body: '## سرخی\n\nمتن۔' },
      en: undefined,
    });
  });

  it('keeps the date a string, never a Date', () => {
    expect(typeof parseColumnFile(file).publishedDate).toBe('string');
  });

  it('collects English fields when present', () => {
    const withEn = file.replace('status: published', 'status: published\ntitle_en: Duty\nexcerpt_en: Short\nbody_en: Text');
    expect(parseColumnFile(withEn).en).toEqual({ title: 'Duty', excerpt: 'Short', body: 'Text' });
  });

  it('rejects a file without front matter, and unknown keys', () => {
    expect(() => parseColumnFile('no front matter')).toThrow(/front-matter/);
    expect(() => parseColumnFile(file.replace('status: published', 'status: published\nauthor: x'))).toThrow();
  });
});
