import { ur, type Catalog } from './ur';
import { en } from './en';

/** The two supported locales. Adding a third is a typed change: extend this
 *  union, add a catalog, and the compiler walks you through the rest. */
export const LOCALES = ['ur', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ur';

const catalogs: Record<Locale, Catalog> = { ur, en };

export const isLocale = (v: unknown): v is Locale =>
  typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

export const t = (locale: Locale): Catalog => catalogs[locale];

export const dirFor = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ur' ? 'rtl' : 'ltr');

/** Urdu is unprefixed; every other locale is prefixed. */
export const localePath = (locale: Locale, path: string): string => {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === DEFAULT_LOCALE ? clean : `/${locale}${clean === '/' ? '' : clean}` || `/${locale}`;
};

/** Strip a locale prefix from a pathname → the locale-neutral route. */
export const neutralPath = (pathname: string): string => {
  for (const l of LOCALES) {
    if (l === DEFAULT_LOCALE) continue;
    if (pathname === `/${l}`) return '/';
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname || '/';
};

/** hreflang alternates for the current route, for <link rel="alternate">. */
export const alternates = (pathname: string, site: URL) =>
  LOCALES.map((l) => ({
    hreflang: l,
    href: new URL(localePath(l, neutralPath(pathname)), site).toString(),
  }));
