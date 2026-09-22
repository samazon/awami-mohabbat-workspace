import { asc, eq } from 'drizzle-orm';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { emergencyContacts } from '@/lib/db/schema';

export interface ContactView {
  label: string;
  number: string; // as displayed
  tel: string; // for the tel: href — digits and leading + only
  area: 'qasur' | 'islamabad' | 'both';
}

export async function getEmergencyContacts(locale: Locale): Promise<ContactView[]> {
  const rows = await db()
    .select()
    .from(emergencyContacts)
    .where(eq(emergencyContacts.enabled, true))
    .orderBy(asc(emergencyContacts.displayOrder));
  return rows.map((r) => ({
    label: locale === 'ur' ? r.labelUr : r.labelEn,
    number: r.number,
    tel: r.number.replace(/[^\d+]/g, ''),
    area: r.area,
  }));
}
