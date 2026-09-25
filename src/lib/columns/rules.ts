import { z } from 'zod';
import type { Article } from '../db/schema';

/** Lowercase words joined by single hyphens. Same rule as assertSlug in media.ts. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slug = z.string().trim().max(80).regex(SLUG_RE, 'use lowercase letters, digits and single hyphens');
const text = (max: number) => z.string().trim().min(1).max(max);
/** A real calendar date: it must round-trip through Date unchanged. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'not a real date');

export const ColumnistInput = z.object({
  slug,
  nameUr: text(100),
  nameEn: text(100).optional(),
  columnTitleUr: text(100),
  columnTitleEn: text(100).optional(),
  banner: z.object({
    hash: z.string().regex(/^[a-f0-9]{8,64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  active: z.boolean().default(true),
});

const Translation = z.object({ title: text(300), excerpt: text(600), body: text(100_000) });

export const ColumnInput = z.object({
  slug,
  /** The columnist's slug. */
  columnist: slug,
  publishedDate: isoDate,
  status: z.enum(['draft', 'published']).default('draft'),
  ur: Translation,
  en: Translation.optional(),
});

export const Slot = z.number().int().min(1).max(3);

/** A rule about article shape was broken. Its message is safe to show an editor. */
export class ArticleRuleError extends Error {
  override name = 'ArticleRuleError';
}

/**
 * The rules the database can't express across two tables. The CHECK on
 * `articles` covers category ↔ columnist too; checking here gives the
 * editor a readable message instead of a constraint error.
 */
export function assertArticleInvariants(a: {
  category: Article['category'];
  columnistId: number | null;
  translations: { author: string | null }[];
}): void {
  if (a.category === 'column') {
    if (a.columnistId == null) throw new ArticleRuleError('A column needs a columnist.');
    return;
  }
  if (a.columnistId != null) throw new ArticleRuleError('Only columns have a columnist.');
  if (a.translations.some((t) => !t.author?.trim())) {
    throw new ArticleRuleError('Every translation of a non-column article needs an author.');
  }
}
