import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { JOIN_IP_SALT } from 'astro:env/server';
import { isLocale, DEFAULT_LOCALE } from '@/i18n';
import { createJoinRequest, hashIp, isRateLimited, type NewJoinRequest } from '@/lib/services/join';
import { notifyJoinRequest } from '@/lib/services/join-mail';
import { audit } from '@/lib/services/admin';
import { PhotoError, adminDeleteMember, adminMoveMember, adminSaveMember } from '@/lib/services/team-admin';
import { TEAM_GROUPS } from '@/lib/db/schema';
import type { ActionAPIContext } from 'astro:actions';
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

/**
 * Admin actions are reached only through the middleware's Access check, and
 * each one checks again here: no identity, no action (deny by default, CWE-862).
 */
const requireAdmin = (ctx: ActionAPIContext) => {
  const admin = ctx.locals.admin;
  if (!admin) throw new ActionError({ code: 'FORBIDDEN', message: 'Not authorised.' });
  return admin;
};
const memberId = z.coerce.number().int().positive();

export const server = {
  admin: {
    teamSave: defineAction({
      accept: 'form',
      input: z.object({
        id: z.string().optional(),
        groupKey: z.enum(TEAM_GROUPS),
        nameEn: z.string(),
        nameUr: z.string(),
        roleEn: z.string().optional(),
        roleUr: z.string().optional(),
        placeEn: z.string().optional(),
        placeUr: z.string().optional(),
        country: z.string().optional(),
        featured: z.boolean().optional(),
        hidden: z.boolean().optional(),
        photo: z.instanceof(File).optional(),
        removePhoto: z.boolean().optional(),
      }),
      handler: async (input, ctx) => {
        const admin = requireAdmin(ctx);
        const id = input.id ? memberId.parse(input.id) : null;
        try {
          const res = await adminSaveMember(
            id,
            {
              groupKey: input.groupKey,
              nameEn: input.nameEn,
              nameUr: input.nameUr,
              roleEn: input.roleEn ?? '',
              roleUr: input.roleUr ?? '',
              placeEn: input.placeEn ?? '',
              placeUr: input.placeUr ?? '',
              country: input.country ?? '',
              featured: input.featured ?? false,
              hidden: input.hidden ?? false,
            },
            { file: input.photo ?? null, remove: input.removePhoto ?? false },
          );
          if (!res) throw new ActionError({ code: 'NOT_FOUND', message: 'That team member no longer exists.' });
          await audit(admin.id, res.created ? 'team.create' : 'team.update', `team_members:${res.id}`);
          return res;
        } catch (err) {
          if (err instanceof PhotoError) throw new ActionError({ code: 'BAD_REQUEST', message: err.message });
          if (err instanceof z.ZodError) {
            throw new ActionError({ code: 'BAD_REQUEST', message: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
          }
          throw err;
        }
      },
    }),
    teamDelete: defineAction({
      accept: 'form',
      input: z.object({ id: memberId }),
      handler: async ({ id }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeleteMember(id))) throw new ActionError({ code: 'NOT_FOUND', message: 'That team member no longer exists.' });
        await audit(admin.id, 'team.delete', `team_members:${id}`);
        return { ok: true as const };
      },
    }),
    teamMove: defineAction({
      accept: 'form',
      input: z.object({ id: memberId, dir: z.enum(['up', 'down']) }),
      handler: async ({ id, dir }, ctx) => {
        const admin = requireAdmin(ctx);
        const moved = await adminMoveMember(id, dir);
        if (moved) await audit(admin.id, 'team.move', `team_members:${id}`);
        return { moved };
      },
    }),
  },
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

      const application: NewJoinRequest = {
        name,
        address,
        profession,
        email,
        phone,
        locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
        ipHash,
      };
      const id = await createJoinRequest(application);
      // Saved first; the email is best effort and never fails the submission.
      try {
        await notifyJoinRequest(application, id);
      } catch {
        console.error(`join-mail: #${id} threw while sending`);
      }
      // Never log the submitted details: they are personal data (rule 09).
      return { ok: true as const };
    },
  }),
};
