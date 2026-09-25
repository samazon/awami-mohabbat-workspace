import { describe, expect, it } from 'vitest';
import { readingMinutes, renderMarkdown, wordCount } from '../src/lib/columns/markdown';

describe('renderMarkdown: hostile input stays inert', () => {
  it.each([
    ['script tag', '<script>alert(1)</script>', /<script/i],
    ['img onerror', '<img src=x onerror=alert(1)>', /<img/i],
    ['javascript: link', '[x](javascript:alert(1))', /href=/],
    ['mixed-case javascript: link', '[x](JaVaScRiPt:alert(1))', /href=/],
    ['data: link', '[x](data:text/html;base64,PHNjcmlwdD4=)', /href=/],
    ['vbscript: link', '[x](vbscript:msgbox)', /href=/],
    ['markdown image', '![a](https://evil.example/x.png)', /<img/i],
    ['autolink javascript', '<javascript:alert(1)>', /href=/],
  ])('%s', (_name, input, forbidden) => {
    expect(renderMarkdown(input)).not.toMatch(forbidden);
  });

  it('escapes raw HTML instead of passing it through', () => {
    expect(renderMarkdown('<b>x</b>')).toContain('&lt;b&gt;');
  });
});

describe('renderMarkdown: the supported subset', () => {
  it('renders subheadings, clamping # to h2', () => {
    expect(renderMarkdown('## عنوان')).toBe('<h2>عنوان</h2>\n');
    expect(renderMarkdown('# بڑا عنوان')).toBe('<h2>بڑا عنوان</h2>\n');
    expect(renderMarkdown('#### چھوٹا')).toBe('<h3>چھوٹا</h3>\n');
  });

  it('renders emphasis, quotes and lists', () => {
    expect(renderMarkdown('**بولڈ** اور *ترچھا*')).toBe('<p><strong>بولڈ</strong> اور <em>ترچھا</em></p>\n');
    expect(renderMarkdown('> اقتباس')).toContain('<blockquote>');
    expect(renderMarkdown('- ایک\n- دو')).toContain('<ul>');
    expect(renderMarkdown('1. ایک\n2. دو')).toContain('<ol>');
  });

  it('marks external links noopener nofollow, leaves internal links alone', () => {
    expect(renderMarkdown('[سائٹ](https://example.com)')).toContain(
      '<a href="https://example.com" rel="noopener nofollow">سائٹ</a>',
    );
    expect(renderMarkdown('[آرکائیو](/archive)')).toContain('<a href="/archive">آرکائیو</a>');
  });

  it('keeps Urdu punctuation intact', () => {
    expect(renderMarkdown('یہ، وہ۔')).toBe('<p>یہ، وہ۔</p>\n');
  });

  it('does not render inline code spans', () => {
    expect(renderMarkdown('`x`')).not.toContain('<code');
  });
});

describe('reading time', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'لفظ').join(' ');
  it.each([[0, 1], [199, 1], [200, 1], [201, 2], [1000, 5]])('%i words → %i min', (n, min) => {
    expect(readingMinutes(words(n))).toBe(min);
  });
  it('counts Urdu words by whitespace', () => {
    expect(wordCount('  ایک   دو\nتین ')).toBe(3);
  });
});
