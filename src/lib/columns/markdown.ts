import MarkdownIt from 'markdown-it';

/**
 * Column bodies are Markdown. They are rendered here and nowhere else, and
 * this output is the only thing the reading page passes to `set:html`
 * (secure-coding rule 3).
 *
 *   html: false        raw HTML in the source is escaped, never passed through
 *   validateLink       only http(s), mailto, tel, same-site paths and #anchors
 *   no images/tables/code  not part of the column format; images would load
 *                      third-party URLs on our pages
 */
const SAFE_URL = /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i;

const md = new MarkdownIt('default', { html: false, linkify: false, typographer: false, breaks: false });
md.disable(['image', 'table', 'code', 'fence', 'backticks']);
md.validateLink = (url) => SAFE_URL.test(url.trim());

// The page's <h1> is the column title, so body headings are h2 or h3.
md.core.ruler.push('clamp_headings', (state) => {
  for (const t of state.tokens) {
    if (t.type === 'heading_open' || t.type === 'heading_close') {
      t.tag = `h${Math.min(Math.max(Number(t.tag.slice(1)), 2), 3)}`;
    }
  }
});

// Outbound links don't pass authority or a window handle.
md.core.ruler.push('external_link_rel', (state) => {
  for (const block of state.tokens) {
    for (const t of block.children ?? []) {
      if (t.type === 'link_open' && /^https?:/i.test(t.attrGet('href') ?? '')) t.attrSet('rel', 'noopener nofollow');
    }
  }
});

export const renderMarkdown = (source: string): string => md.render(source);

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** 200 words a minute, rounded up, never below one. */
export const readingMinutes = (text: string): number => Math.max(1, Math.ceil(wordCount(text) / 200));
