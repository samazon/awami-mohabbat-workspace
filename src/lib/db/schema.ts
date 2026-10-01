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
// Columnists — the writer behind a column, with the ready-made banner the
// paper prints (photo, column name, byline). Profile pages don't exist yet;
// `slug` is reserved for them and used by the /columns filter.
// ---------------------------------------------------------------------------
export const columnists = sqliteTable('columnists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  nameUr: text('name_ur').notNull(),
  nameEn: text('name_en'),
  columnTitleUr: text('column_title_ur').notNull(),
  columnTitleEn: text('column_title_en'),
  /** Content hash; R2 keys derive from it (src/lib/media.ts). URLs are never stored. */
  bannerHash: text('banner_hash').notNull(),
  bannerWidth: integer('banner_width').notNull(),
  bannerHeight: integer('banner_height').notNull(),
  /** Inactive writers leave the list filter; their columns stay published. */
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Columnist = typeof columnists.$inferSelect;

// ---------------------------------------------------------------------------
// Gallery — photos shown on /gallery, newest first. Only derivatives are
// stored in R2 (keys derive from `hash`, src/lib/media.ts); no original, so no
// EXIF/GPS. `category` is reserved for filtering later; nothing sets it yet.
// ---------------------------------------------------------------------------
export const galleryPhotos = sqliteTable(
  'gallery_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Content hash of the uploaded file: the same photo can't be added twice. */
    hash: text('hash').notNull().unique(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    captionUr: text('caption_ur'),
    captionEn: text('caption_en'),
    category: text('category'),
    /** Hidden photos stay in the table and bucket but leave the page. */
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    /** Display order: higher first. Newer uploads get higher values. */
    sortKey: integer('sort_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('gallery_photos_visible_sort_idx').on(t.hidden, t.sortKey)],
);

export type GalleryPhoto = typeof galleryPhotos.$inferSelect;

// ---------------------------------------------------------------------------
// Special editions (اشاعتِ خاص) — single full-page features, shown on
// /special-editions newest first. Like the gallery, only WebP derivatives are
// stored (keys derive from `hash`). `publishedDate` is optional: some pages
// carry no date; those sort after the dated ones.
// ---------------------------------------------------------------------------
export const specialEditions = sqliteTable(
  'special_editions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    hash: text('hash').notNull().unique(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    titleUr: text('title_ur').notNull(),
    titleEn: text('title_en'),
    /** YYYY-MM-DD as printed on the page, or null. */
    publishedDate: text('published_date'),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('special_editions_visible_date_idx').on(t.hidden, t.publishedDate)],
);

export type SpecialEdition = typeof specialEditions.$inferSelect;

// ---------------------------------------------------------------------------
// Monthly magazine (ماہانہ اقلیتی میگزین) — one issue per month, its pages in
// order, and an optional PDF. Like editions, only hashes are stored; R2 keys
// derive from month + page + hash (src/lib/media.ts). Re-uploading a month
// replaces that issue's rows.
// ---------------------------------------------------------------------------
export const magazineIssues = sqliteTable('magazine_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** YYYY-MM: the issue's month, and its URL (/magazine/2019-12). */
  month: text('month').notNull().unique(),
  titleUr: text('title_ur').notNull(),
  titleEn: text('title_en'),
  pdfHash: text('pdf_hash'),
  pdfBytes: integer('pdf_bytes'),
  hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const magazinePages = sqliteTable(
  'magazine_pages',
  {
    issueId: integer('issue_id')
      .notNull()
      .references(() => magazineIssues.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    hash: text('hash').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.pageNumber] })],
);

export type MagazineIssue = typeof magazineIssues.$inferSelect;

// ---------------------------------------------------------------------------
// Articles — optional long-form text; the only indexable prose on the site
// ---------------------------------------------------------------------------
export const articles = sqliteTable(
  'articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    category: text('category', { enum: ['column', 'report', 'education', 'sports'] }).notNull(),
    /** Required for columns, forbidden otherwise (CHECK below). RESTRICT: retire a writer, don't delete them. */
    columnistId: integer('columnist_id').references(() => columnists.id, { onDelete: 'restrict' }),
    publishedDate: text('published_date').notNull(),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    imageHash: text('image_hash'),
    imageCredit: text('image_credit'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('articles_status_date_idx').on(t.status, t.publishedDate),
    index('articles_category_status_date_idx').on(t.category, t.status, t.publishedDate),
    check('articles_column_has_columnist', sql`(${t.category} = 'column') = (${t.columnistId} IS NOT NULL)`),
  ],
);

export const articleTranslations = sqliteTable(
  'article_translations',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: LOCALE_VALUES }).notNull(),
    title: text('title').notNull(),
    /** Columns take their byline from the columnist, so this is null for them; other categories require it (service rule). */
    author: text('author'),
    excerpt: text('excerpt').notNull(),
    body: text('body').notNull(),
    imageCaption: text('image_caption'),
    isMachineTranslated: integer('is_machine_translated', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.locale] })],
);

export type Article = typeof articles.$inferSelect;
export type ArticleTranslation = typeof articleTranslations.$inferSelect;

// ---------------------------------------------------------------------------
// Homepage columns — the editors' three picks, in slot order. Not "latest":
// a slot is empty until someone fills it, and the homepage shows only what's
// filled (and still published).
// ---------------------------------------------------------------------------
export const homepageColumns = sqliteTable(
  'homepage_columns',
  {
    slot: integer('slot').primaryKey(),
    articleId: integer('article_id')
      .notNull()
      .unique()
      .references(() => articles.id, { onDelete: 'cascade' }),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('homepage_columns_slot_range', sql`${t.slot} IN (1, 2, 3)`)],
);

export type HomepageColumn = typeof homepageColumns.$inferSelect;

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
  area: text('area', { enum: ['kasur', 'islamabad', 'both'] }).notNull().default('both'),
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

// ---------------------------------------------------------------------------
// Admin panel. Sign-in is Cloudflare Access; this table is the second gate:
// an Access identity whose email isn't here (or is inactive) is refused.
// ---------------------------------------------------------------------------
export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Lower-case; matched against the verified Access token's email claim. */
  email: text('email').notNull().unique(),
  name: text('name'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at'),
});

/** Who changed what, when. Never holds field values or personal data beyond the admin's id. */
export const adminAudit = sqliteTable(
  'admin_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    adminId: integer('admin_id')
      .notNull()
      .references(() => adminUsers.id),
    action: text('action').notNull(),
    target: text('target'),
    at: integer('at').notNull(),
  },
  (t) => [index('admin_audit_at_idx').on(t.at)],
);

// ---------------------------------------------------------------------------
// Team — the /team page, edited in the admin panel. Names are always shown in
// both scripts on the Urdu page; roles and places carry an Urdu and an English
// form. Photos are pre-sized in the browser and stored in R2 under team/<hash>.
// ---------------------------------------------------------------------------
export const TEAM_GROUPS = ['executive', 'advisory', 'reporting', 'digital', 'international'] as const;
export type TeamGroupKey = (typeof TEAM_GROUPS)[number];

export const teamMembers = sqliteTable(
  'team_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupKey: text('group_key', { enum: TEAM_GROUPS }).notNull(),
    /** Position within the group, ascending. */
    sortOrder: integer('sort_order').notNull(),
    /** The large card at the top of the executive board (the chief editor). */
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    nameEn: text('name_en').notNull(),
    nameUr: text('name_ur').notNull(),
    roleEn: text('role_en'),
    roleUr: text('role_ur'),
    placeEn: text('place_en'),
    placeUr: text('place_ur'),
    /** ISO 3166-1 alpha-2, for the flag. International members. */
    country: text('country'),
    photoHash: text('photo_hash'),
    photoExt: text('photo_ext', { enum: ['webp', 'jpg'] }),
    photoWidth: integer('photo_width'),
    photoHeight: integer('photo_height'),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('team_members_group_order_idx').on(t.groupKey, t.sortOrder)],
);

export type TeamMemberRow = typeof teamMembers.$inferSelect;

