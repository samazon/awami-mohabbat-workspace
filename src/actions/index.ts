import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { JOIN_IP_SALT } from 'astro:env/server';
import { isLocale, DEFAULT_LOCALE } from '@/i18n';
import { createJoinRequest, hashIp, isRateLimited, type NewJoinRequest } from '@/lib/services/join';
import { notifyJoinRequest } from '@/lib/services/join-mail';
import { audit } from '@/lib/services/admin';
import { PhotoError, adminDeleteMember, adminMoveMember, adminSaveBusinessCard, adminSaveMember, adminSavePressCard } from '@/lib/services/team-admin';
import { TEAM_GROUPS } from '@/lib/db/schema';
import type { ActionAPIContext } from 'astro:actions';
import { JOIN_LIMITS, PHONE_CHARS } from '@/lib/join-rules';
import { adminDeleteDraft, adminPublishEdition } from '@/lib/services/editions-admin';
import { adminDeletePhoto, adminSetCaption, adminSetPhotoHidden } from '@/lib/services/gallery-admin';
import { SpecialTextForm, adminDeleteSpecial, adminSetSpecialHidden, adminUpdateSpecial } from '@/lib/services/special-admin';
import {
  IssueSave,
  MagazineUploadError,
  Month,
  adminDeleteIssue,
  adminSetIssueHidden,
  adminUpdateIssueTitles,
  saveIssue,
} from '@/lib/services/magazine-admin';
import {
  ArticleRuleError,
  adminDeleteColumn,
  adminSetColumnStatus,
  adminSetColumnistActive,
  adminSetHomeSlot,
} from '@/lib/services/columns-admin';
import { SLUG_RE } from '@/lib/columns/rules';

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
const columnSlug = z.string().max(120).regex(SLUG_RE, 'Invalid web address.');
const editionDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date.')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Invalid date.');

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
        profilePage: z.boolean().optional(),
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
              profilePage: input.profilePage ?? false,
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
    /** Press-card details. Identity data: validated here, stored in its own table, logged by member id only. */
    pressCardSave: defineAction({
      accept: 'form',
      input: z.object({
        id: memberId,
        cnic: z.string().max(40).optional(),
        station: z.string().max(200).optional(),
        address: z.string().max(400).optional(),
        cardNo: z.string().max(40).optional(),
        validUntil: z.string().max(20).optional(),
      }),
      handler: async ({ id, ...fields }, ctx) => {
        const admin = requireAdmin(ctx);
        try {
          if (!(await adminSavePressCard(id, fields))) throw new ActionError({ code: 'NOT_FOUND', message: 'That team member no longer exists.' });
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new ActionError({ code: 'BAD_REQUEST', message: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
          }
          throw err;
        }
        await audit(admin.id, 'team.card', `team_members:${id}`);
        return { id };
      },
    }),
    /** Business-card contacts. Personal data: validated here, stored in its own table, logged by member id only. */
    businessCardSave: defineAction({
      accept: 'form',
      input: z.object({
        id: memberId,
        mobile: z.string().max(40).optional(),
        phone2: z.string().max(40).optional(),
        email: z.string().max(200).optional(),
      }),
      handler: async ({ id, ...fields }, ctx) => {
        const admin = requireAdmin(ctx);
        try {
          if (!(await adminSaveBusinessCard(id, fields))) throw new ActionError({ code: 'NOT_FOUND', message: 'That team member no longer exists.' });
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new ActionError({ code: 'BAD_REQUEST', message: err.issues.map((i) => i.message).join('; ') });
          }
          throw err;
        }
        await audit(admin.id, 'team.business_card', `team_members:${id}`);
        return { id };
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
    // Uploading an edition is a plain POST to /admin/editions/new, not an action: actions cap
    // bodies at 1 MB, and raising that globally would also open the public join form.
    editionPublish: defineAction({
      accept: 'form',
      input: z.object({ date: editionDate }),
      handler: async ({ date }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminPublishEdition(date))) {
          throw new ActionError({ code: 'CONFLICT', message: 'There is no draft for that date. It may already be published.' });
        }
        await audit(admin.id, 'edition.publish', `editions:${date}`);
        return { date };
      },
    }),
    editionDelete: defineAction({
      accept: 'form',
      input: z.object({ date: editionDate }),
      handler: async ({ date }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeleteDraft(date))) {
          throw new ActionError({ code: 'CONFLICT', message: 'Only drafts can be deleted here, and there is no draft for that date.' });
        }
        await audit(admin.id, 'edition.delete_draft', `editions:${date}`);
        return { date };
      },
    }),
    /** Empty clears a caption. Uploads go to /admin/gallery/upload (one photo per request). */
    galleryCaption: defineAction({
      accept: 'form',
      input: z.object({
        id: memberId,
        captionUr: z.string().trim().max(300).default(''),
        captionEn: z.string().trim().max(300).default(''),
      }),
      handler: async ({ id, captionUr, captionEn }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetCaption(id, captionUr, captionEn))) throw new ActionError({ code: 'NOT_FOUND', message: 'That photo no longer exists.' });
        await audit(admin.id, 'gallery.caption', `gallery_photos:${id}`);
        return { id };
      },
    }),
    galleryVisibility: defineAction({
      accept: 'form',
      input: z.object({ id: memberId, hidden: z.enum(['1', '0']) }),
      handler: async ({ id, hidden }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetPhotoHidden(id, hidden === '1'))) throw new ActionError({ code: 'NOT_FOUND', message: 'That photo no longer exists.' });
        await audit(admin.id, hidden === '1' ? 'gallery.hide' : 'gallery.show', `gallery_photos:${id}`);
        return { id };
      },
    }),
    galleryDelete: defineAction({
      accept: 'form',
      input: z.object({ id: memberId }),
      handler: async ({ id }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeletePhoto(id))) throw new ActionError({ code: 'NOT_FOUND', message: 'That photo no longer exists.' });
        await audit(admin.id, 'gallery.delete', `gallery_photos:${id}`);
        return { id, deleted: true as const };
      },
    }),
    /** Edit a special edition's titles and date. Uploads are a POST to /admin/special (files exceed the 1 MB action cap). */
    specialSave: defineAction({
      accept: 'form',
      input: SpecialTextForm.extend({ id: memberId }),
      handler: async ({ id, ...text }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminUpdateSpecial(id, text))) throw new ActionError({ code: 'NOT_FOUND', message: 'That special edition no longer exists.' });
        await audit(admin.id, 'special.update', `special_editions:${id}`);
        return { id };
      },
    }),
    specialVisibility: defineAction({
      accept: 'form',
      input: z.object({ id: memberId, hidden: z.enum(['1', '0']) }),
      handler: async ({ id, hidden }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetSpecialHidden(id, hidden === '1'))) throw new ActionError({ code: 'NOT_FOUND', message: 'That special edition no longer exists.' });
        await audit(admin.id, hidden === '1' ? 'special.hide' : 'special.show', `special_editions:${id}`);
        return { id };
      },
    }),
    specialDelete: defineAction({
      accept: 'form',
      input: z.object({ id: memberId }),
      handler: async ({ id }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeleteSpecial(id))) throw new ActionError({ code: 'NOT_FOUND', message: 'That special edition no longer exists.' });
        await audit(admin.id, 'special.delete', `special_editions:${id}`);
        return { id, deleted: true as const };
      },
    }),
    /**
     * Last step of a magazine upload, called by the page's script once every page
     * and the PDF are in R2 (via /admin/magazine/page and /admin/magazine/pdf).
     */
    magazineSave: defineAction({
      accept: 'json',
      input: IssueSave,
      handler: async (input, ctx) => {
        const admin = requireAdmin(ctx);
        try {
          const res = await saveIssue(input);
          await audit(admin.id, res.created ? 'magazine.add' : 'magazine.replace', `magazine_issues:${input.month}`);
          return { month: input.month };
        } catch (err) {
          if (err instanceof MagazineUploadError) throw new ActionError({ code: 'BAD_REQUEST', message: err.message });
          throw err;
        }
      },
    }),
    magazineTitles: defineAction({
      accept: 'form',
      input: z.object({
        month: Month,
        titleUr: z.string().trim().min(1, 'The Urdu title is required.').max(300),
        titleEn: z.string().trim().max(300).default(''),
      }),
      handler: async ({ month, titleUr, titleEn }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminUpdateIssueTitles(month, titleUr, titleEn || null))) throw new ActionError({ code: 'NOT_FOUND', message: 'That issue no longer exists.' });
        await audit(admin.id, 'magazine.update', `magazine_issues:${month}`);
        return { month };
      },
    }),
    magazineVisibility: defineAction({
      accept: 'form',
      input: z.object({ month: Month, hidden: z.enum(['1', '0']) }),
      handler: async ({ month, hidden }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetIssueHidden(month, hidden === '1'))) throw new ActionError({ code: 'NOT_FOUND', message: 'That issue no longer exists.' });
        await audit(admin.id, hidden === '1' ? 'magazine.hide' : 'magazine.show', `magazine_issues:${month}`);
        return { month };
      },
    }),
    magazineDelete: defineAction({
      accept: 'form',
      input: z.object({ month: Month }),
      handler: async ({ month }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeleteIssue(month))) throw new ActionError({ code: 'NOT_FOUND', message: 'That issue no longer exists.' });
        await audit(admin.id, 'magazine.delete', `magazine_issues:${month}`);
        return { month, deleted: true as const };
      },
    }),
    /** Columns: the column form itself is a POST to /admin/columns/<slug> (a logo exceeds the 1 MB action cap). */
    columnHome: defineAction({
      accept: 'form',
      input: z.object({ slot: z.coerce.number().int().min(1).max(3), slug: z.union([z.literal(''), columnSlug]) }),
      handler: async ({ slot, slug }, ctx) => {
        const admin = requireAdmin(ctx);
        try {
          await adminSetHomeSlot(slot, slug || null);
        } catch (err) {
          if (err instanceof ArticleRuleError) throw new ActionError({ code: 'BAD_REQUEST', message: err.message });
          throw err;
        }
        await audit(admin.id, 'column.home', `homepage_columns:${slot}`);
        return { slot };
      },
    }),
    columnStatus: defineAction({
      accept: 'form',
      input: z.object({ slug: columnSlug, status: z.enum(['draft', 'published']) }),
      handler: async ({ slug, status }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetColumnStatus(slug, status))) throw new ActionError({ code: 'NOT_FOUND', message: 'That column no longer exists.' });
        await audit(admin.id, status === 'draft' ? 'column.unpublish' : 'column.publish', `articles:${slug}`);
        return { slug };
      },
    }),
    columnDelete: defineAction({
      accept: 'form',
      input: z.object({ slug: columnSlug }),
      handler: async ({ slug }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminDeleteColumn(slug))) throw new ActionError({ code: 'NOT_FOUND', message: 'That column no longer exists.' });
        await audit(admin.id, 'column.delete', `articles:${slug}`);
        return { slug, deleted: true as const };
      },
    }),
    columnistActive: defineAction({
      accept: 'form',
      input: z.object({ slug: columnSlug, active: z.enum(['1', '0']) }),
      handler: async ({ slug, active }, ctx) => {
        const admin = requireAdmin(ctx);
        if (!(await adminSetColumnistActive(slug, active === '1'))) throw new ActionError({ code: 'NOT_FOUND', message: 'That columnist no longer exists.' });
        await audit(admin.id, 'columnist.active', `columnists:${slug}`);
        return { slug };
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
