/** Phone formatting. Pure — shared by the DB service and the contact content. */

/**
 * Numbers are stored as printed ("0304-2198241"). Readers may be abroad, so we
 * show them in international form: "+92 304 2198241", tel:+923042198241.
 * Anything not recognisably Pakistani is passed through untouched.
 */
export function internationalPhone(printed: string): { display: string; tel: string } {
  const digits = printed.replace(/\D/g, '');
  let national: string | null = null;
  if (/^0\d{9,10}$/.test(digits)) national = digits.slice(1); // 0304… → 304…
  else if (/^92\d{9,10}$/.test(digits)) national = digits.slice(2); // already +92
  if (!national) return { display: printed, tel: printed.replace(/[^\d+]/g, '') };
  // mobiles: 3xx xxxxxxx · landlines: 2-digit area code for the big cities
  // (10 national digits, e.g. 42 Lahore), 3-digit elsewhere (9 digits, e.g. 49 Kasur)
  const split = national.startsWith('3') ? 3 : national.length === 10 ? 2 : 3;
  return {
    display: `+92 ${national.slice(0, split)} ${national.slice(split)}`,
    tel: `+92${national}`,
  };
}
