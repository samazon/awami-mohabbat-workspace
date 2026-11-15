# Columns Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add, edit, publish/unpublish, delete columns and manage columnists and homepage picks from `/admin/columns`, replacing `pnpm columns`.

**Architecture:** Pure data functions in `src/lib/columns/admin.ts` (testable in Node, reuse `write.ts`); a Worker service `src/lib/services/columns-admin.ts` that stores banners via `services/images.ts`; three Astro admin pages. The column form is a plain multipart POST to its own page (a logo exceeds the 1 MB action cap); small one-click changes are actions.

**Tech Stack:** Astro 7 on Cloudflare Workers, D1 + Drizzle, R2, Images binding, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-columns-admin-design.md`

## Global Constraints

- Body stays Markdown rendered with `html: false` (unchanged `markdown.ts`); no HTML editor.
- Slugs never typed: columnist slug from the English name; column slug `<date>-<columnist-slug>`, `-2`, `-3` … on a clash; never changed after creation.
- New columnist requires: logo, Urdu name, English name, Urdu column name. English column name optional.
- English translation optional, all three fields (title, excerpt, body) or none.
- Logo: JPEG or PNG (key `orig` ext is `jpg|png`), ≤ 10 MB, checked by bytes; stored `orig` + `card` 480w + `view` 960w WebP (`BANNER_VARIANTS`).
- Unpublishing a column that holds a homepage spot clears the spot.
- Columnists with columns are never deleted; `active` off instead.
- Every write audited: `column.save|publish|unpublish|delete|home`, `columnist.save|active`.
- Admin routes deny when `locals.admin` is missing; plain POSTs check `content-length` before reading.

## Review Focus

1. Two columns by the same writer on the same date → second gets `<date>-<slug>-2`, not an overwrite (Task 1 test).
2. English name with only non-Latin characters or punctuation (e.g. "—") → readable error, not an empty slug (Task 1 test).
3. Editing a column (existing slug) never changes its slug or creates a duplicate (Task 1 test).
4. Re-publishing an unpublished column does not silently re-take its old homepage spot (Task 1 test: spot stays cleared).
5. A form error after choosing a logo → the typed text is kept on re-render; the logo must be chosen again, and the message says so (Task 3, manual check).

---

### Task 1: Column admin data functions

**Files:**
- Create: `src/lib/columns/admin.ts`
- Test: `tests/columns-admin.test.ts`

**Interfaces:**
- Consumes: `upsertColumn`, `upsertColumnist`, `setHomepageSlot` (`src/lib/columns/write.ts`); `ArticleRuleError`, `SLUG_RE` (`rules.ts`); `testDb` (`tests/helpers/db.ts`).
- Produces:
  - `slugFromName(nameEn: string): string` — lowercase ASCII words joined by `-`, max 60 chars; throws `ArticleRuleError('The English name needs some Latin letters …')` if empty.
  - `uniqueColumnistSlug(db: AnyDb, nameEn: string): Promise<string>`
  - `uniqueColumnSlug(db: AnyDb, date: string, columnistSlug: string): Promise<string>`
  - `listColumnsForAdmin(db): Promise<{ slug; status; publishedDate; titleUr; columnistNameUr; homeSlot: number | null }[]>` newest date first, then id desc.
  - `getColumnForEdit(db, slug): Promise<{ slug; columnistSlug; publishedDate; status; ur: {title; excerpt; body}; en: {…} | null; homeSlot: number | null } | null>`
  - `listColumnistsForAdmin(db): Promise<{ slug; nameUr; nameEn; columnTitleUr; columnTitleEn; active; banner: { hash; width; height }; columnCount }[]>` Urdu name order.
  - `setColumnStatus(db, slug, status: 'draft' | 'published'): Promise<boolean>` — draft also deletes its `homepage_columns` row.
  - `deleteColumn(db, slug): Promise<boolean>` (translations and spot cascade).
  - `setColumnistActive(db, slug, active: boolean): Promise<boolean>`

- [ ] **Step 1: Write the failing tests** in `tests/columns-admin.test.ts`, seeding with `upsertColumnist` (banner `{ hash: 'a1b2c3d4e5f60718', width: 1200, height: 300 }`) and `upsertColumn`:
  - `slugFromName('Iqbal Khokhar') === 'iqbal-khokhar'`; `slugFromName('  Dr. M. Ali  ') === 'dr-m-ali'`; `slugFromName('اقبال')` and `slugFromName('—')` throw `ArticleRuleError`.
  - `uniqueColumnistSlug` returns `iqbal-khokhar`, then `iqbal-khokhar-2` once the first exists.
  - `uniqueColumnSlug(db, '2026-11-15', 'iqbal-khokhar')` → `2026-11-15-iqbal-khokhar`, then `…-2`, `…-3` as columns are added.
  - `listColumnsForAdmin` includes drafts, newest date first, with `homeSlot` from `setHomepageSlot`.
  - `getColumnForEdit` returns both translations; `en` null when absent; unknown slug → null.
  - `setColumnStatus(db, s, 'draft')` on a column in spot 2 → `listColumnsForAdmin` shows `homeSlot: null`; then `setColumnStatus(db, s, 'published')` → spot still null.
  - `deleteColumn` → gone from the list, its spot gone; second call → false.
  - `setColumnistActive(db, 'iqbal-khokhar', false)` → `listColumnistsForAdmin` shows `active: false`; `columnCount` counts drafts too.

- [ ] **Step 2: Run** `pnpm test tests/columns-admin.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the functions above in `src/lib/columns/admin.ts` (pure: no `astro:*`/`cloudflare:*` imports; Drizzle only).

- [ ] **Step 4: Run** `pnpm test` — Expected: all pass.

- [ ] **Step 5: Commit** `feat(columns): admin data functions (slugs, list, status, delete)`.

### Task 2: Banner checks and the columns admin service

**Files:**
- Create: `src/lib/columns/banner.ts` (pure), `src/lib/services/columns-admin.ts`
- Modify: `src/lib/services/images.ts` only if needed (no change expected)
- Test: `tests/columns-admin.test.ts` (append)

**Interfaces:**
- Consumes: Task 1; `resizeSet`, `putMedia` (`services/images.ts`); `contentHash16` (`editions/upload.ts`); `readImageHeader`, `readPngHeader` (`image-header.ts`); `BANNER_VARIANTS`, `columnistBannerKey` (`media.ts`).
- Produces:
  - `BANNER_MAX_BYTES = 10 * 1024 * 1024`; `class BannerError extends Error`; `checkBanner(bytes: Uint8Array): { ext: 'jpg' | 'png'; contentType: 'image/jpeg' | 'image/png'; width: number; height: number }` in `banner.ts`.
  - `ColumnForm` (zod, in `columns-admin.ts`): `{ slug?: string; columnist: string /* slug or 'new' */; newNameUr, newNameEn, newColumnUr, newColumnEn (strings, default ''); titleUr; excerptUr; bodyUr; titleEn, excerptEn, bodyEn (default ''); date; intent: 'publish' | 'draft'; homeSlot: '' | '1' | '2' | '3' }`, refined: `columnist === 'new'` requires `newNameUr`, `newNameEn`, `newColumnUr`; English all-or-none.
  - `saveColumnFromForm(input: z.output<typeof ColumnForm>, logo: File | null): Promise<{ slug: string; createdColumnist: boolean }>` — new columnist: `checkBanner` → store `orig` + `resizeSet(…, BANNER_VARIANTS)` under `columnistBannerKey(slug, …)` → `upsertColumnist`; then `upsertColumn` (new slug via `uniqueColumnSlug`, existing slug kept); then `setHomepageSlot` when publishing with a spot. R2 before D1.
  - `saveColumnistFromForm(slug: string, fields: { nameUr; nameEn; columnTitleUr; columnTitleEn }, logo: File | null): Promise<void>` — keeps the current banner unless a logo is given.
  - Thin wrappers: `adminListColumns`, `adminGetColumn`, `adminListColumnists` (adds `cardUrl` via `mediaUrl(CDN_BASE, columnistBannerKey(slug, 'card', hash))`), `adminSetColumnStatus`, `adminDeleteColumn`, `adminSetHomeSlot(slot: number, slug: string | null)`, `adminSetColumnistActive`.

- [ ] **Step 1: Write failing tests** for `checkBanner` (append to `tests/columns-admin.test.ts`): JPEG and PNG accepted with their sizes; WebP, SVG text, empty, and `BANNER_MAX_BYTES + 1` rejected with `BannerError`.
- [ ] **Step 2: Run** `pnpm test tests/columns-admin.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `banner.ts`, then `columns-admin.ts` per the interfaces.
- [ ] **Step 4: Run** `pnpm test && pnpm check` — Expected: pass, 0 errors.
- [ ] **Step 5: Commit** `feat(columns): banner checks and admin service`.

### Task 3: Admin pages, actions, navigation

**Files:**
- Create: `src/pages/admin/columns/index.astro` (list + homepage spots), `src/pages/admin/columns/[slug].astro` (form; `new` = create), `src/pages/admin/columns/columnists.astro`
- Modify: `src/actions/index.ts` (actions below), `src/layouts/AdminLayout.astro` (nav `columns`, drop "Coming next" list when empty), `src/pages/admin/index.astro` (tile)

**Interfaces:**
- Consumes: Task 2 service.
- Produces actions (all `accept: 'form'`, `requireAdmin`, audited): `columnHome { slot: 1|2|3, slug: '' | slug }`, `columnStatus { slug, status }`, `columnDelete { slug }`, `columnistActive { slug, active: '1'|'0' }`.

- [ ] **Step 1: Form page** `[slug].astro`: POST (not `?_action`) → `content-length` ≤ `BANNER_MAX_BYTES + 512 KB` (413 otherwise) → `ColumnForm.safeParse` → `saveColumnFromForm` → redirect `/admin/columns?saved=<slug>`; on `ArticleRuleError | BannerError | ZodError` re-render with typed values and "Choose the logo again" when a logo was sent. GET `new` defaults: date `todayIso()`, columnist = first active. Columnist dropdown shows each writer's `cardUrl`; "New columnist…" reveals the new-columnist fields (script toggles `hidden`/`required`). Toolbar buttons insert `## `, `**…**`, `> ` at the cursor in the Urdu/English body. Excerpt pre-fills from the body's first ~200 characters (cut at the last space or `۔`) while the excerpt is untouched. Two submit buttons: `intent=publish` / `intent=draft`. Edit page adds Unpublish (`columnStatus`) and Delete (`columnDelete`, confirm).
- [ ] **Step 2: List page** `index.astro`: three spot selects (published columns only) each posting `columnHome`; table of columns (title, writer, date, Draft/Live, spot) linking to `[slug]`; links "New column" and "Columnists".
- [ ] **Step 3: Columnists page**: per writer — logo, names, column names (editable, POST with optional new logo → `saveColumnistFromForm`), column count, Active toggle (`columnistActive`).
- [ ] **Step 4: Nav + dashboard tile** (`columns`, icon `pen-line`, "N columns · M drafts").
- [ ] **Step 5: Verify** `pnpm test && pnpm check && pnpm lint:css && pnpm run build` — Expected: all pass. If the user's dev server is running (`pnpm exec astro dev status`), test against it without stopping it: create a columnist + column with `samples/columns/iqbal-khokhar-banner.png`, set spot 1, unpublish (spot clears), delete; check `/columns` and the homepage. Remove only the test rows afterwards.
- [ ] **Step 6: Commit** `feat(admin): columns, columnists and homepage picks` (do not push).
