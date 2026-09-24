/**
 * Contact-page content. Editorial data, so it lives here rather than in the
 * i18n catalogs (which hold UI chrome) — same split as src/content/about.ts.
 * Moves to the database when the admin ships.
 *
 * Only what the paper actually gave us is here. Bureaus with no number on
 * record omit `phones` and the page says so, rather than printing a stub.
 */
import type { Locale } from '@/i18n';

export interface Office {
  /** Stable key: the anchor id and the bureau code suffix. */
  key: string;
  /** Short geographic tag shown above the name. */
  zone: string;
  name: string;
  lines: string[];
  /** As printed; formatted to +92 … at render time. */
  phones?: { label: string; number: string }[];
  emails?: string[];
}

export interface Country {
  /** ISO 3166-1 alpha-2, for the flag. */
  code: string;
  name: string;
}

export interface ContactContent {
  intro: string;
  hq: Office;
  bureaus: Office[];
  countries: Country[];
}

const COUNTRY_CODES = [
  'us', 'gb', 'ca', 'au', 'be', 'nl', 'no', 'lk',
  'de', 'es', 'fr', 'it', 'th', 'my', 'se', 'ru',
] as const;

const countryNames = {
  ur: ['امریکہ', 'برطانیہ', 'کینیڈا', 'آسٹریلیا', 'بیلجیم', 'ہالینڈ', 'ناروے', 'سری لنکا',
       'جرمنی', 'اسپین', 'فرانس', 'اٹلی', 'تھائی لینڈ', 'ملائیشیا', 'سویڈن', 'روس'],
  en: ['USA', 'United Kingdom', 'Canada', 'Australia', 'Belgium', 'Netherlands', 'Norway', 'Sri Lanka',
       'Germany', 'Spain', 'France', 'Italy', 'Thailand', 'Malaysia', 'Sweden', 'Russia'],
} as const;

const countries = (locale: Locale): Country[] =>
  COUNTRY_CODES.map((code, i) => ({ code, name: countryNames[locale][i]! }));

export const contact: Record<Locale, ContactContent> = {
  ur: {
    intro: 'ادارتی امور، اشتہارات، شکایات یا نمائندگی کے لیے ہم سے رابطہ کریں۔ دفتری اوقات میں فون اور ای میل دونوں پر جواب دیا جاتا ہے۔',
    hq: {
      key: 'lahore',
      zone: 'صدر دفتر',
      name: 'مرکزی سیکرٹریٹ — لاہور',
      lines: ['حمزہ ٹاؤن، 19 کلومیٹر فیروزپور روڈ، یوحنا آباد کے سامنے', 'لاہور 54600، پاکستان'],
      phones: [
        { label: 'لینڈ لائن ایکسچینج', number: '+92 42 35950333' },
        { label: 'نیوز ڈیسک', number: '+92 304 2198241' },
        { label: 'اشتہارات', number: '+92 322 8077033' },
        { label: 'سرکولیشن', number: '+92 337 3337158' },
      ],
      emails: ['awami_mohabbat@yahoo.com', 'info@awamimohabbat.com'],
    },
    bureaus: [
      {
        key: 'kasur',
        zone: 'ضلع قصور — اصل بنیاد',
        name: 'قصور بیورو',
        lines: ['کوٹ علی گڑھ، کوٹ رادھا کشن، ضلع قصور', 'پی او بکس 08'],
        phones: [{ label: 'رابطہ نمبر', number: '+92 321 6462430' }],
      },
      { key: 'islamabad', zone: 'وفاقی دارالحکومت', name: 'اسلام آباد / راولپنڈی بیورو', lines: ['103-NB، پنڈورہ، ناظم آباد 194', 'راولپنڈی / اسلام آباد'] },
      { key: 'sialkot', zone: 'صنعتی زون پنجاب', name: 'سیالکوٹ بیورو', lines: ['لال کرتی، سیالکوٹ کینٹ، سیالکوٹ'] },
      { key: 'karachi', zone: 'سندھ و جنوبی زون', name: 'کراچی بیورو', lines: ['ایف سی ایریا، کرسچن کالونی، کراچی'] },
      { key: 'quetta', zone: 'بلوچستان', name: 'کوئٹہ بیورو', lines: ['نواں کلی، زرغون آباد، کوئٹہ'] },
    ],
    countries: countries('ur'),
  },
  en: {
    intro: 'Write to us about editorial matters, advertising, complaints or representation. Both the phones and the email are answered during office hours.',
    hq: {
      key: 'lahore',
      zone: 'Head office',
      name: 'Central secretariat — Lahore',
      lines: ['Hamza Town, 19-km Ferozepur Road, opposite Youhanabad', 'Lahore 54600, Pakistan'],
      phones: [
        { label: 'Landline exchange', number: '+92 42 35950333' },
        { label: 'News desk', number: '+92 304 2198241' },
        { label: 'Advertising', number: '+92 322 8077033' },
        { label: 'Circulation', number: '+92 337 3337158' },
      ],
      emails: ['awami_mohabbat@yahoo.com', 'info@awamimohabbat.com'],
    },
    bureaus: [
      {
        key: 'kasur',
        zone: 'District Kasur — founding base',
        name: 'Kasur bureau',
        lines: ['Kot Aligarh, Kot Radha Kishan, District Kasur', 'P.O. Box 08'],
        phones: [{ label: 'Contact', number: '+92 321 6462430' }],
      },
      { key: 'islamabad', zone: 'Federal capital', name: 'Islamabad / Rawalpindi bureau', lines: ['103-NB, Pandora, Nazimabad 194', 'Rawalpindi / Islamabad'] },
      { key: 'sialkot', zone: 'Punjab industrial zone', name: 'Sialkot bureau', lines: ['Lal Kurti, Sialkot Cantt, Sialkot'] },
      { key: 'karachi', zone: 'Sindh & southern zone', name: 'Karachi bureau', lines: ['FC Area, Christian Colony, Karachi'] },
      { key: 'quetta', zone: 'Balochistan', name: 'Quetta bureau', lines: ['Nawan Killi, Zarghoonabad, Quetta'] },
    ],
    countries: countries('en'),
  },
};

/**
 * The join-us section is English in both locales, by request: applications are
 * read by the desk in English and the form posts to one place.
 */
export const join = {
  eyebrow: 'Join Daily Awami Mohabbat',
  title: 'Join us',
  blurb:
    'Want to represent Awami Mohabbat where you live? Tell us a little about yourself and a member of the editorial team will be in touch.',
  note: 'We read every application. Nothing you send here is published.',
  fields: {
    name: { label: 'Full name', placeholder: 'e.g. Asad Ullah Khan', autocomplete: 'name' },
    profession: { label: 'Profession', placeholder: 'e.g. Journalist, student, writer', autocomplete: 'organization-title' },
    address: { label: 'Current address', placeholder: 'e.g. London UK / Oslo Norway / Sydney Australia', autocomplete: 'street-address' },
    contact: { label: 'Email or phone', placeholder: 'you@example.com or +44 7911 123456', autocomplete: 'email' },
  },
  submit: 'Send application',
  success: 'Thank you — your application has reached us. We will be in touch.',
  imageAlt: 'Join the Awami Mohabbat team',
} as const;
