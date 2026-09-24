/**
 * D1 (SQLite) schema — the only place table shapes live.
 *
 * Conventions:
 *   dates       TEXT 'YYYY-MM-DD'  — sorts chronologically as text; prev/next is one indexed query
 *   timestamps  INTEGER epoch ms
 *   money       INTEGER minor units (paisa) — never floats near money
 *   media       content hash only; URLs are derived by src/lib/media.ts, never stored
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const LOCALE_VALUES = ['ur', 'en'] as const;

// ---------------------------------------------------------------------------
// Editions — one per day, always four pages (rule 04)
// ---------------------------------------------------------------------------
export const editions = sqliteTable(
  'editions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull().unique(),
    hijriDate: text('hijri_date').notNull(),
    volume: integer('volume_number').notNull(),
    issue: integer('issue_number').notNull(),
    pdfHash: text('pdf_hash'), // null → no PDF yet; "View PDF" hides
    pdfBytes: integer('pdf_bytes'),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('editions_status_date_idx').on(t.status, t.date),
    check('editions_date_iso', sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  ],
);

export const editionPages = sqliteTable(
  'edition_pages',
  {
    editionId: integer('edition_id')
      .notNull()
      .references(() => editions.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    hash: text('hash').notNull(), // sha256 prefix of the ORIGINAL; all derivatives share it
    width: integer('width').notNull(), // of the original
    height: integer('height').notNull(),
    origBytes: integer('orig_bytes').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.pageNumber] }),
    check('edition_pages_range', sql`${t.pageNumber} BETWEEN 1 AND 4`),
  ],
);

export const editionTranslations = sqliteTable(
  'edition_translations',
  {
    editionId: integer('edition_id')
      .notNull()
      .references(() => editions.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: LOCALE_VALUES }).notNull(),
    headline: text('headline').notNull(),
    summary: text('summary').notNull(),
    isMachineTranslated: integer('is_machine_translated', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.locale] })],
);

// ---------------------------------------------------------------------------
// Articles — optional long-form text; the only indexable prose on the site
// ---------------------------------------------------------------------------
export const articles = sqliteTable(
  'articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    category: text('category', { enum: ['column', 'report', 'education', 'sports'] }).notNull(),
    publishedDate: text('published_date').notNull(),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    imageHash: text('image_hash'),
    imageCredit: text('image_credit'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('articles_status_date_idx').on(t.status, t.publishedDate)],
);

export const articleTranslations = sqliteTable(
  'article_translations',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: LOCALE_VALUES }).notNull(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    excerpt: text('excerpt').notNull(),
    body: text('body').notNull(),
    imageCaption: text('image_caption'),
    isMachineTranslated: integer('is_machine_translated', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.locale] })],
);

// ---------------------------------------------------------------------------
// Utility content — one row per day. Rule 05: every rate carries its OWN
// timestamp and source, because fuel changes monthly and gold hourly.
// ---------------------------------------------------------------------------
const rateSource = () => text('source', { enum: ['auto', 'manual'] });

export const utilityContent = sqliteTable(
  'utility_content',
  {
    date: text('date').primaryKey(),
    fajr: text('fajr').notNull(),
    zuhr: text('zuhr').notNull(),
    asr: text('asr').notNull(),
    maghrib: text('maghrib').notNull(),
    isha: text('isha').notNull(),
    prayerSource: text('prayer_source', { enum: ['auto', 'manual'] }).notNull().default('auto'),

    goldMinor: integer('gold_minor').notNull(),
    goldUpdatedAt: integer('gold_updated_at').notNull(),
    goldSource: text('gold_source', { enum: ['auto', 'manual'] }).notNull(),

    silverMinor: integer('silver_minor').notNull(),
    silverUpdatedAt: integer('silver_updated_at').notNull(),
    silverSource: text('silver_source', { enum: ['auto', 'manual'] }).notNull(),

    petrolMinor: integer('petrol_minor').notNull(),
    petrolUpdatedAt: integer('petrol_updated_at').notNull(),
    petrolSource: text('petrol_source', { enum: ['auto', 'manual'] }).notNull(),

    dieselMinor: integer('diesel_minor').notNull(),
    dieselUpdatedAt: integer('diesel_updated_at').notNull(),
    dieselSource: text('diesel_source', { enum: ['auto', 'manual'] }).notNull(),
  },
);
void rateSource;

// ---------------------------------------------------------------------------
// Emergency contacts — static, tiny; labels carried in both scripts inline
// ---------------------------------------------------------------------------
export const emergencyContacts = sqliteTable('emergency_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  labelUr: text('label_ur').notNull(),
  labelEn: text('label_en').notNull(),
  number: text('number').notNull(), // as dialled, e.g. "15" or "049 9250051"
  area: text('area', { enum: ['qasur', 'islamabad', 'both'] }).notNull().default('both'),
  displayOrder: integer('display_order').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

// ---------------------------------------------------------------------------
// Ads — nine seeded slots; campaigns are booked against them
// ---------------------------------------------------------------------------
export const AD_KINDS = ['leaderboard', 'banner', 'rect', 'halfpage', 'square', 'mobile', 'strip'] as const;

export const adSlots = sqliteTable('ad_slots', {
  slotId: text('slot_id').primaryKey(),
  page: text('page').notNull(), // 'home' | 'archive' | 'edition' | 'article'
  kind: text('kind', { enum: AD_KINDS }).notNull(),
  fallbackMode: text('fallback_mode', { enum: ['google', 'hidden'] }).notNull(),
  googleUnitId: text('google_unit_id'),
  displayOrder: integer('display_order').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

export const adCampaigns = sqliteTable(
  'ad_campaigns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    client: text('client').notNull(),
    slotId: text('slot_id')
      .notNull()
      .references(() => adSlots.slotId),
    type: text('type', { enum: ['image', 'text'] }).notNull(),
    imageHash: text('image_hash'),
    title: text('title'),
    body: text('body'),
    cta: text('cta'),
    linkUrl: text('link_url').notNull(),
    altText: text('alt_text').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status', { enum: ['scheduled', 'live', 'paused', 'ended'] }).notNull().default('scheduled'),
    labelAs: text('label_as', { enum: ['sponsored', 'advertisement'] }).notNull().default('sponsored'),
    mobileOnly: integer('mobile_only', { mode: 'boolean' }).notNull().default(false),
    newTab: integer('new_tab', { mode: 'boolean' }).notNull().default(true),
    impressions: integer('impressions').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('ad_campaigns_slot_status_idx').on(t.slotId, t.status, t.startDate, t.endDate)],
);

// ---------------------------------------------------------------------------
// Site config — singleton (id is checked = 1). Translatable strings carry _ur/_en.
// ---------------------------------------------------------------------------
export const siteConfig = sqliteTable(
  'site_config',
  {
    id: integer('id').primaryKey(),
    currentVolume: integer('current_volume').notNull(),
    currentIssue: integer('current_issue').notNull(),
    coverageUr: text('coverage_ur').notNull(),
    coverageEn: text('coverage_en').notNull(),
    editorUr: text('editor_ur').notNull(),
    editorEn: text('editor_en').notNull(),
    officeUr: text('office_ur').notNull(),
    officeEn: text('office_en').notNull(),
    bureauUr: text('bureau_ur'),
    bureauEn: text('bureau_en'),
    /** Contact numbers as printed, e.g. ["0304-2198241", …]. Mobile only — no landline. */
    phones: text('phones', { mode: 'json' }).$type<string[]>().notNull(),
    email: text('email').notNull(),
    facebookUrl: text('facebook_url'),
    youtubeUrl: text('youtube_url'),
    linkedinUrl: text('linkedin_url'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('site_config_singleton', sql`${t.id} = 1`)],
);

export type Edition = typeof editions.$inferSelect;
export type EditionPage = typeof editionPages.$inferSelect;
export type EditionTranslation = typeof editionTranslations.$inferSelect;
export type UtilityContent = typeof utilityContent.$inferSelect;
export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type AdSlot = typeof adSlots.$inferSelect;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type SiteConfig = typeof siteConfig.$inferSelect;

// ---------------------------------------------------------------------------
// Join requests — public form submissions from /contact
// ---------------------------------------------------------------------------
export const joinRequests = sqliteTable(
  'join_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    address: text('address').notNull(),
    profession: text('profession').notNull(),
    /**
     * The form requires both. Nullable only because rows from before the split
     * had a single "email or phone" field, so one of the two is missing there.
     */
    email: text('email'),
    phone: text('phone'),
    /** Which language the form was filled in from. */
    locale: text('locale', { enum: LOCALE_VALUES }).notNull(),
    status: text('status', { enum: ['new', 'contacted', 'archived'] }).notNull().default('new'),
    /**
     * A salted hash of the sender's IP, never the address itself: enough to
     * rate-limit a flood, not enough to identify a person (rule 09 / CWE-778).
     */
    ipHash: text('ip_hash'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('join_requests_created_idx').on(t.createdAt),
    index('join_requests_ip_idx').on(t.ipHash, t.createdAt),
  ],
);

export type JoinRequest = typeof joinRequests.$inferSelect;
