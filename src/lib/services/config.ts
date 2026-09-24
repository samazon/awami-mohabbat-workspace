import { eq } from 'drizzle-orm';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { internationalPhone } from '@/lib/phone';
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
