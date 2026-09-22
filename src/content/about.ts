/**
 * About-page content. This is editorial copy, not UI chrome, so it lives here
 * rather than in the i18n catalogs; when the admin ships it moves to the DB.
 *
 * Source of truth: the page-2 masthead of the 21 Sep 2026 print edition.
 * Nothing here is claimed that the masthead doesn't state.
 */
import type { Locale } from '@/i18n';

export interface StaffMember {
  role: string;
  name: string;
}

export interface AboutContent {
  mission: string[];
  editor: { name: string; role: string; bio: string };
  staff: StaffMember[];
  publication: { frequency: string; language: string; printedAt: string };
}

export const about: Record<Locale, AboutContent> = {
  ur: {
    mission: [
      'روزنامہ عوامی محبت قصور اور لاہور سے شائع ہونے والا اردو روزنامہ ہے۔ ادارے کا بنیادی مقصد مقامی سطح پر عوامی مسائل کی غیر جانبدار رپورٹنگ اور تعمیری اور مثبت صحافت ہے۔',
      'اخبار روزانہ چار صفحات پر مشتمل ہوتا ہے اور ہر اشاعت اسی روز ویب سائٹ پر بھی دستیاب ہوتی ہے تاکہ قاری کہیں سے بھی اسے پڑھ سکے۔',
    ],
    editor: {
      name: 'اقبال کھوکھر',
      role: 'ایڈیٹر و پبلشر',
      bio: 'اخبار کے ایڈیٹر اور پبلشر۔ ادارتی پالیسی اور روزمرہ اشاعت کے نگران۔',
    },
    staff: [
      { role: 'ایڈیٹر', name: 'اقبال کھوکھر' },
      { role: 'ڈپٹی ایڈیٹر', name: 'ڈاکٹر اظہر یونس' },
      { role: 'میگزین ایڈیٹر', name: 'ایس ایم صابر' },
      { role: 'انچارج کرائم سیل', name: 'ملک طاہر محمود' },
      { role: 'انچارج نمائندگان', name: 'رشید لالہ' },
      { role: 'سرکولیشن', name: 'اشرف آسی' },
    ],
    publication: {
      frequency: 'روزانہ، چار صفحات',
      language: 'اردو',
      printedAt: 'چتر پریس، ہسپتال روڈ، لاہور',
    },
  },
  en: {
    mission: [
      'Awami Mohabbat is an Urdu daily published from Kasur and Lahore. Its purpose is impartial reporting of public issues at the local level, and constructive, positive journalism.',
      'Each edition runs to four pages and is published on this website the same day, so readers can pick it up from anywhere.',
    ],
    editor: {
      name: 'Iqbal Khokhar',
      role: 'Editor & Publisher',
      bio: 'Editor and publisher of the newspaper, responsible for editorial policy and the daily edition.',
    },
    staff: [
      { role: 'Editor', name: 'Iqbal Khokhar' },
      { role: 'Deputy Editor', name: 'Dr Azhar Younus' },
      { role: 'Magazine Editor', name: 'S. M. Sabir' },
      { role: 'Crime Desk In-charge', name: 'Malik Tahir Mehmood' },
      { role: 'Correspondents In-charge', name: 'Rasheed Lala' },
      { role: 'Circulation', name: 'Ashraf Aasi' },
    ],
    publication: {
      frequency: 'Daily, four pages',
      language: 'Urdu',
      printedAt: 'Chitar Press, Hospital Road, Lahore',
    },
  },
};
