/**
 * Date, time and money formatting. Pure — shared by the Worker and the seed
 * scripts. The design keeps datelines, timestamps and figures in Latin digits
 * in both locales (always inside an LtrRun), so formatting is locale-stable.
 */

export const TIMEZONE = 'Asia/Karachi';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → a Date at local midnight in Pakistan (as a UTC instant). */
export const isoToDate = (iso: string): Date => {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date: ${iso}`);
  // Karachi is UTC+5 with no DST: midnight PKT == 19:00 UTC the previous day.
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), -5, 0, 0));
};

/** Today's date in Pakistan as 'YYYY-MM-DD'. */
export const todayIso = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** "16 September 2026" */
export const formatLong = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(isoToDate(iso));

/** Three-letter month, always — en-GB gives "Sept", the design uses "Sep". */
const monthShort = (d: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, month: 'short' }).format(d);
const dayOf = (d: Date): string => new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric' }).format(d);
const yearOf = (d: Date): string => new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric' }).format(d);

/** "16 Sep 2026" */
export const formatShort = (iso: string): string => {
  const d = isoToDate(iso);
  return `${dayOf(d)} ${monthShort(d)} ${yearOf(d)}`;
};

/** "16 SEP 2026" — for eyebrows. */
export const formatEyebrow = (iso: string): string => formatShort(iso).toUpperCase();

/** "Wednesday, 16 September 2026" */
export const formatWeekdayLong = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(isoToDate(iso));

/** epoch ms → "17 Sep, 10:30" — the honest freshness stamp beside each rate (rule 05). */
export const formatStamp = (epochMs: number): string => {
  const d = new Date(epochMs);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${dayOf(d)} ${monthShort(d)}, ${time}`;
};

/** "HH:MM" 24h → "4:42" / "12:08" as the ticker shows them. */
export const formatPrayerTime = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h > 12 ? h - 12 : h}:${m[2]}`;
};

/** paisa → "311,450" or "264.61". Whole rupees drop the decimals. */
export const formatMoney = (minor: number): string => {
  const rupees = minor / 100;
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(rupees);
};

const HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Awwal',
  'Jumada al-Thani',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
] as const;

/**
 * Umm al-Qura Hijri date as "3 Rabi al-Thani 1448". Used by the seed script as
 * a default; the edition row stores whatever the editor confirms, since local
 * moon-sighting can differ by a day from the tabular calendar.
 */
export const hijriFor = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(isoToDate(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const month = Number(get('month'));
  const name = HIJRI_MONTHS[month - 1] ?? get('month');
  return `${Number(get('day'))} ${name} ${get('year').replace(/\D/g, '')}`;
};
