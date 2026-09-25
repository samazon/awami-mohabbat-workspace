/**
 * Static seed data: the nine ad slots from the design, emergency contacts and
 * the site-config singleton.
 */
import type { adSlots, emergencyContacts, siteConfig } from '../src/lib/db/schema';

type NewSlot = typeof adSlots.$inferInsert;
type NewContact = typeof emergencyContacts.$inferInsert;
type NewConfig = typeof siteConfig.$inferInsert;

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
  { labelUr: 'ایدھی', labelEn: 'Edhi', number: '115', area: 'both', displayOrder: 4 },
  { labelUr: 'موٹروے پولیس', labelEn: 'Motorway Police', number: '130', area: 'both', displayOrder: 5 },
  { labelUr: 'خواتین ہیلپ لائن', labelEn: "Women's Helpline", number: '1043', area: 'both', displayOrder: 6 },
  { labelUr: 'گیس ایمرجنسی', labelEn: 'Gas Emergency', number: '1199', area: 'both', displayOrder: 7 },
  { labelUr: 'سائبر کرائم', labelEn: 'Cyber Crime', number: '1991', area: 'both', displayOrder: 8 },
];

/** Contact details as printed in the 21 Sep 2026 edition (page 1 box, page 2 masthead). */
export const SITE_CONFIG = (now: number): NewConfig => ({
  id: 1,
  currentVolume: 20,
  currentIssue: 93,
  coverageUr: 'قصور / لاہور',
  coverageEn: 'Kasur / Lahore',
  editorUr: 'اقبال کھوکھر',
  editorEn: 'Iqbal Khokhar',
  // Newline-separated: one entry per printed line.
  officeUr: 'حمزہ ٹاؤن، 19 کلومیٹر فیروزپور روڈ، بالمقابل یوحنا آباد\nلاہور 54600، پاکستان',
  officeEn: 'Hamza Town, 19-km Ferozepur Road, opposite Youhanabad\nLahore 54600, Pakistan',
  bureauUr: 'کوٹ رادھا کشن، پی او بکس 08، قصور',
  bureauEn: 'Kot Radha Kishan, P.O. Box 08, Kasur',
  // Mobile numbers only — the printed landline is deliberately left out.
  phones: ['0304-2198241', '0322-8077033'],
  email: 'awami_mohabbat@yahoo.com',
  // The footer FOLLOW column renders only what exists here.
  facebookUrl: 'https://www.facebook.com/iqbal.d.khokhar', // the chief editor's profile, for now
  youtubeUrl: 'https://www.youtube.com/@awamimohabbat',
  linkedinUrl: null,
  updatedAt: now,
});
