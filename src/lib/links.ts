import { localePath, type Locale } from '@/i18n';
import type { EditionView } from './services/editions';

/**
 * Where "read the edition" goes. Until /edition/[date] ships (phase 2) this is
 * the zoom-size page image itself — readable on day one. Swapping to the viewer
 * is a one-line change here and nowhere else.
 */
export const viewerHref = (_locale: Locale, edition: EditionView, page: 1 | 2 | 3 | 4 = 1): string =>
  edition.pages[page - 1]?.zoom ?? '#';

export const nav = (locale: Locale) => ({
  home: localePath(locale, '/'),
  archive: localePath(locale, '/archive'),
  articles: localePath(locale, '/articles'),
  about: localePath(locale, '/about'),
  search: localePath(locale, '/search'),
});
