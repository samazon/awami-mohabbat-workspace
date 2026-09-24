/**
 * Length limits for the join form, shared by the server action (which
 * enforces them) and the form markup (which mirrors them as minlength /
 * maxlength so the browser can catch mistakes before a round trip).
 * The server check is the one that counts; the browser's is a convenience.
 */
export const JOIN_LIMITS = {
  name: { min: 2, max: 100 },
  profession: { min: 2, max: 120 },
  address: { min: 4, max: 300 },
  email: { min: 3, max: 254 },
  phone: { min: 7, max: 30 },
} as const;

/** Digits plus the usual separators, optional leading +. */
export const PHONE_CHARS = /^\+?[\d\s().-]+$/;
/** Same rule for the HTML `pattern` attribute, which is compiled with the `v` flag and anchored implicitly. */
export const PHONE_PATTERN_ATTR = String.raw`\+?[0-9\s\(\)\.\-]+`;
