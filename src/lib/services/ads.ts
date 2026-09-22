import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { CDN_BASE } from 'astro:env/server';
import { db } from '@/lib/db/client';
import { adCampaigns, adSlots, type AdSlot } from '@/lib/db/schema';
import { mediaUrl } from '@/lib/media';

export type AdKind = AdSlot['kind'];

export interface AdCreative {
  type: 'image' | 'text';
  client: string;
  linkUrl: string;
  altText: string;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  cta: string | null;
  labelAs: 'sponsored' | 'advertisement';
  newTab: boolean;
  mobileOnly: boolean;
}

export interface AdSlotView {
  slotId: string;
  kind: AdKind;
  /** `direct` when a campaign is live; otherwise the slot's fallback. */
  source: 'direct' | 'google' | 'hidden';
  googleUnitId: string | null;
  creative: AdCreative | null;
}

/** Every enabled slot on `page`, with its live campaign (if any) resolved for `date`. */
export async function getAdSlotsForPage(page: string, date: string): Promise<Record<string, AdSlotView>> {
  const slots = await db()
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.page, page), eq(adSlots.enabled, true)))
    .orderBy(asc(adSlots.displayOrder));
  if (slots.length === 0) return {};

  const live = await db()
    .select()
    .from(adCampaigns)
    .where(
      and(
        eq(adCampaigns.status, 'live'),
        lte(adCampaigns.startDate, date),
        gte(adCampaigns.endDate, date),
      ),
    );

  const out: Record<string, AdSlotView> = {};
  for (const s of slots) {
    const c = live.find((x) => x.slotId === s.slotId);
    out[s.slotId] = {
      slotId: s.slotId,
      kind: s.kind,
      source: c ? 'direct' : s.fallbackMode,
      googleUnitId: s.googleUnitId,
      creative: c
        ? {
            type: c.type,
            client: c.client,
            linkUrl: c.linkUrl,
            altText: c.altText,
            imageUrl: c.imageHash ? mediaUrl(CDN_BASE, `ads/${c.id}/creative.${c.imageHash}.webp`) : null,
            title: c.title,
            body: c.body,
            cta: c.cta,
            labelAs: c.labelAs,
            newTab: c.newTab,
            mobileOnly: c.mobileOnly,
          }
        : null,
    };
  }
  return out;
}
