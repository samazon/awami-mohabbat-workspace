/**
 * Team-page content. Editorial data, so it lives here rather than in the i18n
 * catalogs — same split as src/content/about.ts. Moves to the database when
 * the admin ships.
 *
 * Names are shown in both scripts on the Urdu page (Urdu first, the English
 * spelling beneath, for foreign visitors who land there) and in English only
 * on /en/team. Roles and places translate through the two maps below, so a
 * new role or place is added once and a typo is a compile error.
 * Photos live in src/assets/team/, already sized: add one with
 * `pnpm optimize-image <photo> team/<name>.webp --width 660`. A member
 * without `photo` renders a placeholder.
 */
import type { ImageMetadata } from 'astro';
import type { Locale } from '@/i18n';
import iqbalDanialKhokhar from '@/assets/team/iqbal-danial-khokhar.webp';
import pervaizNadeemGill from '@/assets/team/pervaiz-nadeem-gill.webp';
import zohaibSami from '@/assets/team/zohaib-sami.webp';
import arshadKhokhar from '@/assets/team/arshad-khokhar.webp';
import sommerBareen from '@/assets/team/sommer-bareen.webp';
import abidNawab from '@/assets/team/abid-nawab.webp';
import azharYounas from '@/assets/team/azhar-younas.webp';
import ashrafMichael from '@/assets/team/ashraf-michael.webp';
import moazzamGill from '@/assets/team/moazzam-gill.webp';
import fiazAhmadBhatti from '@/assets/team/fiaz-ahmad-bhatti.webp';
import sohailHabel from '@/assets/team/sohail-habel.webp';
import mutbasamQamar from '@/assets/team/mutbasam-qamar.webp';
import sohailAlam from '@/assets/team/sohail-alam.webp';
import saleemShakir from '@/assets/team/saleem-shakir.webp';
import aftabBashir from '@/assets/team/aftab-bashir.webp';
import atifGill from '@/assets/team/atif-gill.webp';
import asifNazir from '@/assets/team/asif-nazir.webp';
import maharAttique from '@/assets/team/mahar-attique.webp';

export const ROLE_UR = {
  'Chief Editor': 'چیف ایڈیٹر',
  'Sub-editor': 'سب ایڈیٹر',
  'News Editor': 'نیوز ایڈیٹر',
  Chairman: 'چیئرمین',
  Member: 'رکن',
  'Bureau Chief': 'بیورو چیف',
  'In-charge': 'انچارج',
  'Staff Reporter': 'اسٹاف رپورٹر',
  Reporter: 'رپورٹر',
  'Director IT': 'ڈائریکٹر آئی ٹی',
  'Page Designer': 'پیج ڈیزائنر',
  Composer: 'کمپوزر',
  'Social Media': 'سوشل میڈیا',
  'Video Editor': 'ویڈیو ایڈیٹر',
  Cameraman: 'کیمرہ مین',
} as const;

export const PLACE_UR = {
  Kasur: 'قصور',
  Islamabad: 'اسلام آباد',
  Sialkot: 'سیالکوٹ',
  Karachi: 'کراچی',
  Quetta: 'کوئٹہ',
  'Pattoki & Chunian': 'پتوکی و چونیاں',
  'United States': 'امریکہ',
  Australia: 'آسٹریلیا',
  Germany: 'جرمنی',
  Spain: 'اسپین',
  Belgium: 'بیلجیم',
  Sweden: 'سویڈن',
  Norway: 'ناروے',
  UAE: 'متحدہ عرب امارات',
  Canada: 'کینیڈا',
} as const;

export type Role = keyof typeof ROLE_UR;
export type Place = keyof typeof PLACE_UR;

export interface TeamMember {
  /** English spelling, as the person writes it. */
  name: string;
  nameUr: string;
  role?: Role;
  place?: Place;
  /** ISO 3166-1 alpha-2, for the flag. International members only. */
  country?: string;
  photo?: ImageMetadata;
}

export interface TeamGroup {
  /** Stable key: the anchor id. */
  key: string;
  title: Record<Locale, string>;
  members: TeamMember[];
}

/** Shown large at the top of the executive board, and counted in it. */
export const chiefEditor: TeamMember = {
  name: 'Iqbal Danial Khokhar',
  nameUr: 'اقبال دانیال کھوکھر',
  role: 'Chief Editor',
  photo: iqbalDanialKhokhar,
};

export const groups: TeamGroup[] = [
  {
    key: 'executive',
    title: { ur: 'ایگزیکٹو بورڈ', en: 'Executive board' },
    members: [
      { name: 'Dr. Azhar Younas', nameUr: 'ڈاکٹر اظہر یونس', role: 'Sub-editor', place: 'Kasur', photo: azharYounas },
      { name: 'Ashraf Michael', nameUr: 'اشرف مائیکل', role: 'News Editor', place: 'Kasur', photo: ashrafMichael },
    ],
  },
  {
    key: 'advisory',
    title: { ur: 'مشاورتی بورڈ', en: 'Advisory board' },
    members: [
      { name: 'PS. Pervaiz Nadeem Gill', nameUr: 'پاسٹر پرویز ندیم گل', role: 'Chairman', photo: pervaizNadeemGill },
      { name: 'Moazzam Gill', nameUr: 'معظم گل', role: 'Member', photo: moazzamGill },
      { name: 'Fiaz Ahmad Bhatti', nameUr: 'فیاض احمد بھٹی', role: 'Member', photo: fiazAhmadBhatti },
      { name: 'Abid Nawab', nameUr: 'عابد نواب', role: 'Member', photo: abidNawab },
      { name: 'Sohail Habel', nameUr: 'سہیل ہابل', role: 'Member', photo: sohailHabel },
      { name: 'Mutbasam Qamar', nameUr: 'متبسم قمر', role: 'Member', photo: mutbasamQamar },
      { name: 'Sohail Alam', nameUr: 'سہیل عالم', role: 'Member', photo: sohailAlam },
      { name: 'Rasheed Masih', nameUr: 'رشید مسیح', role: 'Member' },
      { name: 'Saleem Shakir', nameUr: 'سلیم شاکر', role: 'Member', photo: saleemShakir },
      { name: 'Aftab Bashir', nameUr: 'آفتاب بشیر', role: 'Member', photo: aftabBashir },
    ],
  },
  {
    key: 'reporting',
    title: { ur: 'رپورٹنگ', en: 'Reporting' },
    members: [
      { name: 'Atif Gill', nameUr: 'عاطف گل', role: 'Bureau Chief', place: 'Islamabad', photo: atifGill },
      { name: 'Asif Nazir', nameUr: 'آصف نذیر', role: 'Bureau Chief', place: 'Sialkot', photo: asifNazir },
      { name: 'Dr. Mahar Attique', nameUr: 'ڈاکٹر مہر عتیق', role: 'Bureau Chief', place: 'Kasur', photo: maharAttique },
      { name: 'PS. Arshad Victor', nameUr: 'پاسٹر ارشد وکٹر', role: 'In-charge', place: 'Karachi' },
      { name: 'Aneel Ghouri', nameUr: 'انیل غوری', role: 'In-charge', place: 'Quetta' },
      { name: 'Asghar Chann', nameUr: 'اصغر چن', role: 'In-charge', place: 'Kasur' },
      { name: 'Nawaz Farhat', nameUr: 'نواز فرحت', role: 'In-charge', place: 'Pattoki & Chunian' },
      { name: 'Bilawal Khurshid', nameUr: 'بلاول خورشید', role: 'Staff Reporter' },
      { name: 'Teresa Hizkeal', nameUr: 'ٹریسا حزقیل', role: 'Reporter' },
    ],
  },
  {
    key: 'digital',
    title: { ur: 'آئی ٹی و ڈیجیٹل میڈیا', en: 'IT & Digital Media' },
    members: [
      { name: 'Sommer Bareen', nameUr: 'سومر برین', role: 'Director IT', photo: sommerBareen },
      { name: 'Rafyal Iqbal', nameUr: 'رافیل اقبال', role: 'Page Designer' },
      { name: 'Mathew Iqbal', nameUr: 'میتھیو اقبال', role: 'Composer' },
      { name: 'Zaki Mansha', nameUr: 'ذکی منشا', role: 'Social Media' },
      { name: 'Rozaim Elahi', nameUr: 'روزیم الٰہی', role: 'Social Media' },
      { name: 'Azar Daud', nameUr: 'آذر داؤد', role: 'Video Editor' },
      { name: 'Ayub Bobi', nameUr: 'ایوب بوبی', role: 'Cameraman' },
      { name: 'Dawood Saleem', nameUr: 'داؤد سلیم', role: 'Cameraman' },
    ],
  },
  {
    key: 'international',
    title: { ur: 'بین الاقوامی نمائندے', en: 'International representatives' },
    members: [
      { name: 'Zeva James Gill', nameUr: 'زیوا جیمز گل', place: 'United States', country: 'us' },
      { name: 'Bashir A. Sami', nameUr: 'بشیر اے سامی', place: 'Australia', country: 'au' },
      { name: 'Zohaib Sami', nameUr: 'زوہیب سامی', place: 'Germany', country: 'de', photo: zohaibSami },
      { name: 'Javed Iqbal Gill', nameUr: 'جاوید اقبال گل', place: 'Spain', country: 'es' },
      { name: 'Bishop Arshad Khokhar', nameUr: 'بشپ ارشد کھوکھر', place: 'Belgium', country: 'be', photo: arshadKhokhar },
      { name: 'Lateef Bhatti', nameUr: 'لطیف بھٹی', place: 'Belgium', country: 'be' },
      { name: 'PS. Lakhan Sardar', nameUr: 'پاسٹر لکھن سردار', place: 'Sweden', country: 'se' },
      { name: 'Sheikh Khalil Ahmad', nameUr: 'شیخ خلیل احمد', place: 'Norway', country: 'no' },
      { name: 'PS. Amar Masih', nameUr: 'پاسٹر امر مسیح', place: 'UAE', country: 'ae' },
      { name: 'Khalid Gill', nameUr: 'خالد گل', place: 'Canada', country: 'ca' },
    ],
  },
];
