import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { JOIN_IP_SALT } from 'astro:env/server';
import { isLocale, DEFAULT_LOCALE } from '@/i18n';
import { createJoinRequest, hashIp, isRateLimited } from '@/lib/services/join';
import { JOIN_LIMITS, PHONE_CHARS } from '@/lib/join-rules';

/**
 * Typed RPC for writes. `accept: 'form'` means the form also works with
 * JavaScript disabled — the browser POSTs, Astro validates, the page
 * re-renders with the result.
 *
 * Everything here is untrusted input, so it is validated and length-capped at
 * the boundary before it reaches the database (CWE-20). Drizzle parameterises
 * the insert, and Astro escapes on output, so the stored text is inert.
 */
const nonEmpty = (min: number, max: number) => z.string().trim().min(min).max(max);

export const server = {
  join: defineAction({
    accept: 'form',
    input: z.object({
      name: nonEmpty(JOIN_LIMITS.name.min, JOIN_LIMITS.name.max),
      address: nonEmpty(JOIN_LIMITS.address.min, JOIN_LIMITS.address.max),
      profession: nonEmpty(JOIN_LIMITS.profession.min, JOIN_LIMITS.profession.max),
      email: nonEmpty(JOIN_LIMITS.email.min, JOIN_LIMITS.email.max).pipe(z.email({ message: 'Enter a valid email address.' })),
      /** Digits plus the usual separators; 7–15 digits covers local to full E.164. */
      phone: nonEmpty(JOIN_LIMITS.phone.min, JOIN_LIMITS.phone.max)
        .regex(PHONE_CHARS, { message: 'Enter a phone number using digits only.' })
        .refine((v) => { const n = v.replace(/\D/g, '').length; return n >= 7 && n <= 15; }, {
          message: 'Enter a phone number with 7 to 15 digits.',
        }),
      locale: z.string().optional(),
      /**
       * Honeypot: a real person never sees this field. It accepts anything on
       * purpose — rejecting it in the schema would hand the bot a field-level
       * error naming the trap. The handler discards these silently instead.
       */
      website: z.string().max(200).optional(),
    }),
    handler: async ({ name, address, profession, email, phone, locale, website }, ctx) => {
      // Silently accept and discard bot submissions: telling them why helps them.
      if (website) return { ok: true as const };

      const ipHash = await hashIp(ctx.clientAddress, JOIN_IP_SALT);
      if (await isRateLimited(ipHash)) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many submissions from this connection. Please try again later.',
        });
      }

      await createJoinRequest({
        name,
        address,
        profession,
        email,
        phone,
        locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
        ipHash,
      });
      // Never log the submitted details: they are personal data (rule 09).
      return { ok: true as const };
    },
  }),
};
