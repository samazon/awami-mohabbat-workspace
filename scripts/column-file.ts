import { parse as parseYaml, YAMLParseError } from 'yaml';
import { z } from 'zod';
import type { ColumnInput } from '../src/lib/columns/rules';

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// YAML 1.2 core schema: `date: 2026-09-15` stays a string. Unknown keys are an error, not ignored.
const FrontMatter = z
  .object({
    slug: z.string(),
    columnist: z.string(),
    title: z.string(),
    excerpt: z.string(),
    date: z.string(),
    status: z.enum(['draft', 'published']).default('draft'),
    title_en: z.string().optional(),
    excerpt_en: z.string().optional(),
    body_en: z.string().optional(),
  })
  .strict();

/** A column file: YAML front matter, then the Urdu body in Markdown. Validated fully by ColumnInput later. */
export function parseColumnFile(text: string): z.input<typeof ColumnInput> {
  const m = FRONT.exec(text);
  if (!m) throw new Error('A column file must start with a --- front-matter block.');
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]!, { schema: 'core' });
  } catch (e) {
    if (e instanceof YAMLParseError) {
      throw new Error(`Front matter is not valid YAML (line ${e.linePos?.[0]?.line ?? '?'}, column ${e.linePos?.[0]?.col ?? '?'}).`);
    }
    throw e;
  }
  const fm = FrontMatter.parse(parsed);
  const hasEn = fm.title_en !== undefined || fm.excerpt_en !== undefined || fm.body_en !== undefined;
  return {
    slug: fm.slug,
    columnist: fm.columnist,
    publishedDate: fm.date,
    status: fm.status,
    ur: { title: fm.title, excerpt: fm.excerpt, body: m[2]!.trim() },
    en: hasEn ? { title: fm.title_en ?? '', excerpt: fm.excerpt_en ?? '', body: fm.body_en ?? '' } : undefined,
  };
}
