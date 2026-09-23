/**
 * Tier-1 localization: UI chrome strings. Urdu is the source shape;
 * every other catalog is typed against it so a missing key fails `astro check`.
 *
 * Content (headlines, summaries, article bodies) is NOT here — it lives in the
 * database as translation rows. See src/lib/services/translate.ts.
 */
export const ur = {
  meta: {
    siteName: 'عوامی محبت',
    siteNameLatin: 'Awami Mohabbat',
    description: 'روزنامہ عوامی محبت — قصور اور لاہور سے شائع ہونے والا اردو روزنامہ۔ آج کا اخبار، آرکائیو اور مضامین۔',
  },
  strip: {
    group: 'عوامی محبت گروپ آف پبلیکیشنز',
    tagline: 'تعمیری اور مثبت صحافت کا علمبردار',
    abc: 'ABC CERTIFIED',
  },
  nav: {
    home: 'صفحۂ اول',
    archive: 'آرکائیو',
    articles: 'مضامین',
    about: 'تعارف',
    menu: 'مینو',
    close: 'بند کریں',
  },
  search: {
    label: 'تلاش',
    placeholder: 'تلاش کریں',
  },
  reader: {
    group: 'متن کا سائز',
    smaller: 'چھوٹا متن',
    normal: 'معمول کا متن',
    larger: 'بڑا متن',
    largest: 'سب سے بڑا متن',
  },
  lang: {
    group: 'زبان',
    ur: 'اردو',
    en: 'English',
  },
  masthead: {
    daily: 'روزنامہ',
    chiefEditor: 'چیف ایڈیٹر',
  },
  ticker: {
    prayers: 'اوقاتِ نماز',
    rates: 'نرخ',
    fajr: 'فجر',
    zuhr: 'ظہر',
    asr: 'عصر',
    maghrib: 'مغرب',
    isha: 'عشاء',
    gold: 'سونا، 10 گرام',
    silver: 'چاندی',
    petrol: 'پٹرول',
    diesel: 'ڈیزل',
    updated: 'تازہ کاری',
  },
  ad: {
    label: 'اشتہار',
    sponsored: 'بشکریہ',
    google: 'GOOGLE ADS',
    client: 'CLIENT',
    placeholder: 'اشتہار کی جگہ',
  },
  today: {
    title: 'آج کا اخبار',
    pages: 'صفحات',
    /** Eyebrows are Latin in every locale (design: "16 SEP 2026 · 4 PAGES"). */
    pagesEyebrow: 'PAGES',
    frontPage: 'آج کا صفحۂ اول',
    pageOf: (n: number, total: number) => `صفحہ ${n} از ${total}`,
    openViewer: 'OPEN VIEWER →',
    fourPages: 'آج کے چار صفحات',
    readFull: 'مکمل اخبار پڑھیں',
    viewPdf: 'View PDF',
    pdfNote: 'پی ڈی ایف ایڈیشن ہمیشہ اردو میں ہوتا ہے۔',
    page: 'صفحہ',
    noEdition: 'آج کا اخبار ابھی شائع نہیں ہوا۔',
  },
  viewer: {
    zoom: 'زوم',
    prev: 'پچھلا صفحہ',
    next: 'اگلا صفحہ',
    error: 'صفحہ لوڈ نہیں ہو سکا۔',
  },
  mt: {
    badge: 'AI TRANSLATION',
    notice: 'یہ صفحہ اردو پرنٹ ایڈیشن سے مشینی ترجمہ ہے۔ پی ڈی ایف ایڈیشن اردو میں ہی رہتا ہے۔',
    fallback: 'اس زبان میں ترجمہ دستیاب نہیں؛ اصل اردو متن دکھایا جا رہا ہے۔',
  },
  archive: {
    title: 'حالیہ اشاعتیں',
    viewAll: 'مکمل آرکائیو دیکھیں',
    pagesMeta: (n: number) => `${n} صفحات`,
  },
  articles: {
    title: 'مضامین و کالم',
  },
  emergency: {
    title: 'ہنگامی نمبر',
    call: (label: string) => `${label} کو کال کریں`,
  },
  footer: {
    tagline: 'عوام سے حقیقی محبت کا ترجمان',
    contact: 'رابطہ',
    sections: 'صفحات',
    follow: 'فالو کریں',
    office: 'لاہور آفس',
    bureau: 'قصور آفس',
    phone: 'فون',
    email: 'ای میل',
    archive: 'آرکائیو',
    articles: 'مضامین و کالم',
    aboutContact: 'تعارف و رابطہ',
    copyright: (year: number) => `© ${year} Awami Mohabbat Group of Publications`,
    chiefEditor: 'چیف ایڈیٹر',
  },
  about: {
    title: 'تعارف',
    description: 'روزنامہ عوامی محبت کا تعارف: ادارے کا مقصد، ادارتی عملہ، اشاعت کی تفصیل اور رابطہ۔',
    mission: 'ادارے کا مقصد',
    staff: 'ادارتی عملہ',
    publication: 'اشاعت کی تفصیل',
    contact: 'رابطہ',
    photo: 'تصویر',
    frequency: 'اشاعت',
    area: 'علاقہ',
    language: 'زبان',
    printedAt: 'طباعت',
    certification: 'تصدیق',
  },
  mobileBar: {
    read: 'مکمل اخبار پڑھیں',
  },
  a11y: {
    skip: 'مرکزی مواد پر جائیں',
    mainNav: 'مرکزی نیویگیشن',
    footerNav: 'فوٹر نیویگیشن',
    edition: (date: string) => `اخبار ${date}`,
    pageThumb: (n: number, date: string) => `${date} کا صفحہ ${n}`,
  },
};

/** The shape every catalog must satisfy (strings widened, functions kept). */
export type Catalog = typeof ur;
