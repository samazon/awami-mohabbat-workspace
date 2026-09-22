import { desc, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { utilityContent, type UtilityContent } from '@/lib/db/schema';

export type RateSource = 'auto' | 'manual';

export interface RateView {
  key: 'gold' | 'silver' | 'petrol' | 'diesel';
  /** PKR, in minor units (paisa). Format at the edge. */
  minor: number;
  updatedAt: number; // epoch ms — rule 05: each rate carries its real timestamp
  source: RateSource;
}

export interface UtilityView {
  date: string;
  prayers: { key: 'fajr' | 'zuhr' | 'asr' | 'maghrib' | 'isha'; time: string }[];
  rates: RateView[];
}

const toView = (u: UtilityContent): UtilityView => ({
  date: u.date,
  prayers: [
    { key: 'fajr', time: u.fajr },
    { key: 'zuhr', time: u.zuhr },
    { key: 'asr', time: u.asr },
    { key: 'maghrib', time: u.maghrib },
    { key: 'isha', time: u.isha },
  ],
  rates: [
    { key: 'gold', minor: u.goldMinor, updatedAt: u.goldUpdatedAt, source: u.goldSource },
    { key: 'silver', minor: u.silverMinor, updatedAt: u.silverUpdatedAt, source: u.silverSource },
    { key: 'petrol', minor: u.petrolMinor, updatedAt: u.petrolUpdatedAt, source: u.petrolSource },
    { key: 'diesel', minor: u.dieselMinor, updatedAt: u.dieselUpdatedAt, source: u.dieselSource },
  ],
});

/** The utility row for `date`, or the most recent one before it. */
export async function getUtilityContent(date: string): Promise<UtilityView | null> {
  const [row] = await db()
    .select()
    .from(utilityContent)
    .where(lte(utilityContent.date, date))
    .orderBy(desc(utilityContent.date))
    .limit(1);
  return row ? toView(row) : null;
}
