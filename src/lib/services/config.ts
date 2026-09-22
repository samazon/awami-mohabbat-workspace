import { eq } from 'drizzle-orm';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { siteConfig } from '@/lib/db/schema';

export interface SiteConfigView {
  currentVolume: number;
  currentIssue: number;
  coverage: string;
  editor: string;
  office: string;
  bureau: string | null;
  phones: { display: string; tel: string }[];
  email: string;
  social: { label: 'Facebook' | 'YouTube' | 'LinkedIn'; url: string }[];
}

/**
 * Numbers are stored as printed ("0304-2198241"). Readers may be abroad, so we
 * show them in international form: "+92 304 2198241", tel:+923042198241.
 * Anything not recognisably Pakistani is passed through untouched.
 */
export function internationalPhone(printed: string): { display: string; tel: string } {
  const digits = printed.replace(/\D/g, '');
  let national: string | null = null;
  if (/^0\d{9,10}$/.test(digits)) national = digits.slice(1); // 0304… → 304…
  else if (/^92\d{9,10}$/.test(digits)) national = digits.slice(2); // already +92
  if (!national) return { display: printed, tel: printed.replace(/[^\d+]/g, '') };
  // mobiles: 3xx xxxxxxx · landlines: 2-digit area code for the big cities
  // (10 national digits, e.g. 42 Lahore), 3-digit elsewhere (9 digits, e.g. 49 Kasur)
  const split = national.startsWith('3') ? 3 : national.length === 10 ? 2 : 3;
  return {
    display: `+92 ${national.slice(0, split)} ${national.slice(split)}`,
    tel: `+92${national}`,
  };
}

export async function getSiteConfig(locale: Locale): Promise<SiteConfigView | null> {
  const [c] = await db().select().from(siteConfig).where(eq(siteConfig.id, 1)).limit(1);
  if (!c) return null;
  const ur = locale === 'ur';
  const social: SiteConfigView['social'] = [];
  if (c.facebookUrl) social.push({ label: 'Facebook', url: c.facebookUrl });
  if (c.youtubeUrl) social.push({ label: 'YouTube', url: c.youtubeUrl });
  if (c.linkedinUrl) social.push({ label: 'LinkedIn', url: c.linkedinUrl });
  return {
    currentVolume: c.currentVolume,
    currentIssue: c.currentIssue,
    coverage: ur ? c.coverageUr : c.coverageEn,
    editor: ur ? c.editorUr : c.editorEn,
    office: ur ? c.officeUr : c.officeEn,
    bureau: (ur ? c.bureauUr : c.bureauEn) ?? null,
    phones: c.phones.map(internationalPhone),
    email: c.email,
    social,
  };
}
