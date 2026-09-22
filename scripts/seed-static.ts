/**
 * Static seed data: the nine ad slots from the design, emergency contacts,
 * the site-config singleton, and a demo utility row shape.
 *
 * Utility values here are the DESIGN'S demo figures, labelled `manual`. Replace
 * them per day with `--utility <file.json>` until the auto-feeds exist.
 */
import type { adSlots, emergencyContacts, siteConfig, utilityContent } from '../src/lib/db/schema';

type NewSlot = typeof adSlots.$inferInsert;
type NewContact = typeof emergencyContacts.$inferInsert;
type NewConfig = typeof siteConfig.$inferInsert;
export type NewUtility = typeof utilityContent.$inferInsert;

export const AD_SLOTS: NewSlot[] = [
  { slotId: 'home-leaderboard', page: 'home', kind: 'leaderboard', fallbackMode: 'google', displayOrder: 1 },
  { slotId: 'home-sponsor-strip', page: 'home', kind: 'strip', fallbackMode: 'hidden', displayOrder: 2 },
  { slotId: 'home-mid', page: 'home', kind: 'banner', fallbackMode: 'google', displayOrder: 3 },
  { slotId: 'home-footer', page: 'home', kind: 'leaderboard', fallbackMode: 'google', displayOrder: 4 },
  { slotId: 'archive-top', page: 'archive', kind: 'leaderboard', fallbackMode: 'google', displayOrder: 1 },
  { slotId: 'archive-footer', page: 'archive', kind: 'banner', fallbackMode: 'google', displayOrder: 2 },
  { slotId: 'edition-below-viewer', page: 'edition', kind: 'rect', fallbackMode: 'google', displayOrder: 1 },
  { slotId: 'article-inline', page: 'article', kind: 'rect', fallbackMode: 'google', displayOrder: 1 },
  { slotId: 'article-footer', page: 'article', kind: 'banner', fallbackMode: 'hidden', displayOrder: 2 },
];

export const EMERGENCY_CONTACTS: NewContact[] = [
  { labelUr: 'پولیس', labelEn: 'Police', number: '15', area: 'both', displayOrder: 1 },
  { labelUr: 'ریسکیو', labelEn: 'Rescue', number: '1122', area: 'both', displayOrder: 2 },
  { labelUr: 'فائر بریگیڈ', labelEn: 'Fire Brigade', number: '16', area: 'both', displayOrder: 3 },
  { labelUr: 'ڈی ایچ کیو ہسپتال', labelEn: 'DHQ Hospital', number: '049 9250051', area: 'qasur', displayOrder: 4 },
  { labelUr: 'ایدھی', labelEn: 'Edhi', number: '115', area: 'both', displayOrder: 5 },
];

export const SITE_CONFIG = (now: number): NewConfig => ({
  id: 1,
  currentVolume: 20,
  currentIssue: 89,
  coverageUr: 'قصور / اسلام آباد',
  coverageEn: 'Qasur / Islamabad',
  editorUr: 'اقبال کھوکھر',
  editorEn: 'Iqbal Khokhar',
  officeUr: 'کچہری روڈ، قصور، پنجاب',
  officeEn: 'Kutchery Road, Qasur, Punjab',
  bureauUr: 'بلیو ایریا، اسلام آباد',
  bureauEn: 'Blue Area, Islamabad',
  phone: '+92 49 272 4000',
  email: 'editor@awamimohabbat.com',
  // Real profile URLs go here; the footer FOLLOW column renders only what exists.
  facebookUrl: null,
  youtubeUrl: null,
  linkedinUrl: null,
  updatedAt: now,
});

/** The design's demo ticker values for `date`, marked manual with honest stamps. */
export const DEMO_UTILITY = (date: string, stampMs: number): NewUtility => ({
  date,
  fajr: '04:42',
  zuhr: '12:08',
  asr: '16:32',
  maghrib: '18:14',
  isha: '19:38',
  prayerSource: 'manual',
  goldMinor: 311_450_00,
  goldUpdatedAt: stampMs,
  goldSource: 'manual',
  silverMinor: 3_540_00,
  silverUpdatedAt: stampMs,
  silverSource: 'manual',
  petrolMinor: 264_61,
  petrolUpdatedAt: stampMs,
  petrolSource: 'manual',
  dieselMinor: 272_98,
  dieselUpdatedAt: stampMs,
  dieselSource: 'manual',
});
