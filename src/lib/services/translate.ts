import { DEFAULT_LOCALE, type Locale } from '@/i18n';

export interface TranslationMeta {
  /** Locale actually shown. Equals the requested locale unless we fell back. */
  locale: Locale;
  /** Rule 02: machine-translated content must announce itself. */
  isMachineTranslated: boolean;
  /** Requested locale had no row; the Urdu source is shown and labelled. */
  isFallback: boolean;
}

/**
 * Pick the row for `locale`, or fall back to the Urdu source — and say so.
 * Returns null only when there is no Urdu row either, which is a data error.
 */
export function resolveTranslation<T extends { locale: string; isMachineTranslated: boolean }>(
  rows: readonly T[],
  locale: Locale,
): { row: T; meta: TranslationMeta } | null {
  const exact = rows.find((r) => r.locale === locale);
  if (exact) {
    return {
      row: exact,
      meta: { locale, isMachineTranslated: exact.isMachineTranslated, isFallback: false },
    };
  }
  const source = rows.find((r) => r.locale === DEFAULT_LOCALE);
  if (!source) return null;
  return {
    row: source,
    meta: { locale: DEFAULT_LOCALE, isMachineTranslated: false, isFallback: true },
  };
}
