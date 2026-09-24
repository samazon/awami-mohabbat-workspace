import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { JOIN_IP_SALT } from 'astro:env/server';
import { isLocale, DEFAULT_LOCALE } from '@/i18n';
import { createJoinRequest, hashIp, isRateLimited } from '@/lib/services/join';

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
      name: nonEmpty(2, 100),
      address: nonEmpty(4, 300),
      profession: nonEmpty(2, 120),
      contact: nonEmpty(5, 120).refine((v) => /@/.test(v) || (v.match(/\d/g)?.length ?? 0) >= 7, {
        message: 'Enter an email address or a phone number.',
      }),
      locale: z.string().optional(),
      /**
       * Honeypot: a real person never sees this field. It accepts anything on
       * purpose — rejecting it in the schema would hand the bot a field-level
       * error naming the trap. The handler discards these silently instead.
       */
      website: z.string().max(200).optional(),
    }),
    handler: async ({ name, address, profession, contact, locale, website }, ctx) => {
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
        contact,
        locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
        ipHash,
      });
      // Never log the submitted details: they are personal data (rule 09).
      return { ok: true as const };
    },
  }),
};
