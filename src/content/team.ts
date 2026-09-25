/**
 * Team-page content. Editorial data, so it lives here rather than in the i18n
 * catalogs — same split as src/content/about.ts. Moves to the database when
 * the admin ships.
 *
 * Member details (name, role, place, country) are always shown in English,
 * whatever the page locale; only the page chrome and group titles translate.
 * No photos yet: every card renders a placeholder until `photo` is set.
 */
import type { Locale } from '@/i18n';

export interface TeamMember {
  name: string;
  role?: string;
  place?: string;
  /** ISO 3166-1 alpha-2, for the flag. International members only. */
  country?: string;
  /** Image URL, once we have one. */
  photo?: string;
}

export interface TeamGroup {
  /** Stable key: the anchor id. */
  key: string;
  title: Record<Locale, string>;
  members: TeamMember[];
}

/** Shown large at the top of the page, then again as part of the executive board count. */
export const chiefEditor: TeamMember = {
  name: 'Iqbal Danial Khokhar',
  role: 'Chief Editor',
};

export const groups: TeamGroup[] = [
  {
    key: 'executive',
    title: { ur: 'ایگزیکٹو بورڈ', en: 'Executive board' },
    members: [
      { name: 'Dr. Azhar Younas', role: 'Sub-editor', place: 'Kasur' },
      { name: 'Ashraf Michael', role: 'News Editor', place: 'Kasur' },
    ],
  },
  {
    key: 'advisory',
    title: { ur: 'مشاورتی بورڈ', en: 'Advisory board' },
    members: [
      { name: 'PS. Pervaiz Nadeem Gill', role: 'Chairman' },
      { name: 'Moazzam Gill', role: 'Member' },
      { name: 'Fiaz Ahmad Bhatti', role: 'Member' },
      { name: 'Abid Nawab', role: 'Member' },
      { name: 'Sohail Habel', role: 'Member' },
      { name: 'Mutbasam Qamar', role: 'Member' },
      { name: 'Sohail Alam', role: 'Member' },
      { name: 'Rashid Masih', role: 'Member' },
      { name: 'Saleem Shakir', role: 'Member' },
      { name: 'Aftab Bashir', role: 'Member' },
    ],
  },
  {
    key: 'reporting',
    title: { ur: 'رپورٹنگ', en: 'Reporting' },
    members: [
      { name: 'Atif Gill', role: 'Bureau Chief', place: 'Islamabad' },
      { name: 'Asif Nazir', role: 'Bureau Chief', place: 'Sialkot' },
      { name: 'Dr. Mahar Attique', role: 'Bureau Chief', place: 'Kasur' },
      { name: 'PS. Arshad Victor', role: 'In-charge', place: 'Karachi' },
      { name: 'Aneel Ghouri', role: 'In-charge', place: 'Quetta' },
      { name: 'Asghar Chann', role: 'In-charge', place: 'Kasur' },
      { name: 'Nawaz Farhat', role: 'In-charge', place: 'Pattoki & Chunian' },
      { name: 'Bilawal Khurshid', role: 'Staff Reporter' },
      { name: 'Teresa Hizkeal', role: 'Reporter' },
    ],
  },
  {
    key: 'digital',
    title: { ur: 'آئی ٹی و ڈیجیٹل میڈیا', en: 'IT & Digital Media' },
    members: [
      { name: 'Sommer Bareen', role: 'Director IT' },
      { name: 'Rafyal Iqbal', role: 'Page Designer' },
      { name: 'Mathew Iqbal', role: 'Composer' },
      { name: 'Zaki Mansha', role: 'Social Media' },
      { name: 'Rozaim Elahi', role: 'Social Media' },
      { name: 'Azar Daud', role: 'Video Editor' },
      { name: 'Ayub Bobi', role: 'Cameraman' },
      { name: 'Dawood Saleem', role: 'Cameraman' },
    ],
  },
  {
    key: 'international',
    title: { ur: 'بین الاقوامی نمائندے', en: 'International representatives' },
    members: [
      { name: 'Zeva James Gill', place: 'United States', country: 'us' },
      { name: 'Bashir A. Sami', place: 'Australia', country: 'au' },
      { name: 'Zohaib Sami', place: 'Germany', country: 'de' },
      { name: 'Javed Iqbal Gill', place: 'Spain', country: 'es' },
      { name: 'Bishop Arshad Khokhar', place: 'Belgium', country: 'be' },
      { name: 'Lateef Bhatti', place: 'Belgium', country: 'be' },
      { name: 'PS. Lakhan Sardar', place: 'Sweden', country: 'se' },
      { name: 'Sheikh Khalil Ahmad', place: 'Norway', country: 'no' },
      { name: 'PS. Amar Masih', place: 'UAE', country: 'ae' },
      { name: 'Khalid Gill', place: 'Canada', country: 'ca' },
    ],
  },
];
