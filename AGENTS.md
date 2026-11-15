# AGENTS.md — Awami Mohabbat (عوامی محبت)

Read this before changing anything. It describes what is built, how, and the traps already found.
Last updated: 2026-11-15.

## What this is

The website of **Daily Awami Mohabbat**, an Urdu daily newspaper (Kasur | Islamabad), at **awamimohabbat.com**.

- The site is **Urdu-first and right-to-left**. Urdu lives at `/`; English lives at `/en/…`.
- Readers get:
  - the daily e-paper: 4 page scans plus a PDF, and an archive;
  - columns;
  - a photo gallery;
  - special editions (اشاعتِ خاص);
  - a monthly magazine;
  - the team pages;
  - contact and "Join us".
- Editors work in **`/admin`**, behind Cloudflare Access.

## Stack

| | |
|---|---|
| Framework | Astro 7, `output: 'server'` (SSR), React islands where needed |
| Runtime | Cloudflare Workers (`@astrojs/cloudflare`), `nodejs_compat` |
| Database | Cloudflare **D1** (SQLite), binding `DB`, via **Drizzle** (`src/lib/db/schema.ts`) |
| Files | Cloudflare **R2**, binding `MEDIA`, served by `src/pages/media/[...key].ts` (`CDN_BASE=/media`) |
| Image resizing | Cloudflare **Images** binding `IMAGES` (sharp can't run in a Worker) |
| Email | Cloudflare Email Routing, binding `JOIN_MAIL` ("Join us" applications) |
| Auth | Cloudflare **Access** + `admin_users` table (`src/lib/admin/access.ts`) |
| Validation | zod at every boundary |
| Tests | vitest on in-memory SQLite with the real migrations (`tests/helpers/db.ts`) |
| PDF in browser | `pdfjs-dist` **6.4.299** (pinned), only on `/admin/magazine` |

The config files are `wrangler.jsonc` (bindings, vars, routes) and `astro.config.mjs` (the env schema, i18n, and `imageService: 'compile'`).

## Commands

```sh
pnpm install
pnpm db:migrate:local        # create/upgrade the local D1 (.wrangler/state)
pnpm dev                     # wrangler types && astro dev → http://localhost:4321
pnpm test                    # vitest
pnpm check                   # astro check + tsc for scripts
pnpm lint:css                # stylelint (font-size must use tokens)
pnpm run build
pnpm run deploy              # wrangler types && astro build && wrangler deploy  ← PRODUCTION
pnpm db:generate             # drizzle-kit: new migration from schema.ts
pnpm db:migrate:remote       # apply migrations to PRODUCTION D1
```

- **Use `pnpm run deploy`, not `pnpm deploy`.** `pnpm deploy` is pnpm's own command and fails with `ERR_PNPM_INVALID_DEPLOY_TARGET`.
- Node 22 or newer. Install pnpm with `corepack enable pnpm`.
- To deploy, run `wrangler login` first, or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- There are **no secrets in the repo**. `JOIN_IP_SALT` is set with `wrangler secret put`.

### Local development notes
- **Admin login locally:** with `astro dev` there is no Access. `DEV_ADMIN_EMAIL` (default in `astro.config.mjs`) stands in for the signed-in user and must be an active row in `admin_users`. Migration 0009 seeds the admins. Production builds compile this branch away.
- **Seed data:**
  - `pnpm seed --static-only` fills `site_config`, the ad slots and the emergency contacts.
  - Sample columns are in `samples/columns/` (README there). Load them locally only.
- **Stale Vite cache:** changing imports or dependencies while `pnpm dev` is running can break it with *"The file does not exist … in the optimize deps directory"*. Fix: `rm -rf node_modules/.vite && pnpm dev`.
- Astro allows **one dev server per project** (`astro dev status` / `astro dev stop`). If someone else's is running, don't stop it.

## Layout

```
src/
  pages/              routes (Urdu at /, English mirror under /en/)
    admin/            the admin panel (see below)
    api/v1/           read-only JSON API (editions)
    media/[...key].ts serves R2 objects
    verify/[token]    press-card QR verification (never cached)
  components/         page components (EditionHero, ColumnPage, GalleryPage, …)
  layouts/            BaseLayout (public), AdminLayout (admin shell + nav)
  lib/
    db/               Drizzle schema + client (only services/* may import client.ts)
    services/         Worker-side services (env, D1, R2); pages call these
    editions/ gallery/ special/ magazine/ columns/ team/   pure data + rules (no astro:*/cloudflare:* imports → testable in Node)
    media.ts          R2 key layout + URL helpers (pure)
    image-header.ts   read JPEG/WebP/PNG size + JPEG EXIF orientation from bytes
    admin/            Access verification, raw-upload guard
  actions/index.ts    Astro actions (admin writes + public join form)
  middleware.ts       auth for /admin, edge cache, security headers
  i18n/               ur.ts, en.ts strings
scripts/              Node CLIs (the pre-admin way to load content; still work)
drizzle/              SQL migrations (journal in drizzle/meta)
tests/                vitest
docs/superpowers/     design specs and implementation plans
```

**The layering rule:**
- Pages, components and actions call `src/lib/services/*`.
- Services call the pure modules in `src/lib/<area>/*`, which take a Drizzle `AnyDb`.
- Pure modules never import `astro:*` or `cloudflare:*`. That way the same code runs in the Worker, in the Node CLIs (`scripts/d1.ts` proxy driver) and in the tests.

## Data and media

Tables: `editions`, `edition_pages`, `edition_translations`, `columnists`, `articles` (+ `article_translations`, `homepage_columns`), `gallery_photos`, `special_editions`, `magazine_issues` (+ `magazine_pages`), `team_members`, `team_press_cards`, `team_business_cards`, `admin_users`, `admin_audit`, `site_config`, `ad_slots` + `ad_campaigns`, `emergency_contacts`, `utility_content` (the ticker, currently switched off), `join_requests`. The source of truth is `src/lib/db/schema.ts`.

- **R2 keys are content-addressed and immutable**, for example `editions/2026-11-14/page-1-view.<hash16>.webp`.
  - `<hash16>` is the first 16 hex characters of the original's SHA-256.
  - The builders live in `src/lib/media.ts`.
  - Objects are cached forever (`IMMUTABLE_CACHE_CONTROL`). Replacing a file means a new hash, so a new key.
  - **URLs are never stored**; only hashes are.
- **Uploads keep only resized WebPs** (gallery, special, magazine pages), never the original. A phone's GPS location therefore never reaches R2.
  - Exceptions: edition pages and columnist logos keep an `orig` copy, as the CLI did.
- Image sizes:

  | Content | Sizes |
  |---|---|
  | Edition pages | thumb 400, view 1200, zoom 2400 |
  | Gallery | thumb 640, view 2000 |
  | Special editions | thumb 480, view 2400 |
  | Magazine | thumb 360, view 1400, zoom 2400 |
  | Columnist logo | card 480, view 960 |

- **Vol/Issue and summaries are optional** for editions. They are stored as `0` and `''` because the columns are NOT NULL, and the site hides them.
  - Making those columns nullable would rebuild `editions`. On D1 that cascade-deletes every page and translation, so **don't**.
- Machine-translated text must say so (`isMachineTranslated`, "rule 02"). An edition is four pages or nothing ("rule 04").

## Caching

- In `src/middleware.ts`, public GET pages are stored in the Workers **edge cache for 5 minutes** (`s-maxage=300`).
  - Browsers get `max-age=0`.
  - **After any publish or edit, the public page can take up to 5 minutes to change.** This is expected; nothing purges the cache.
- `/admin`, `/media` and `/verify/*` are never put in that cache.

## The admin panel (`/admin`)

### Security model (applies to every admin route)
- **Authentication**, in `src/middleware.ts` and `src/lib/admin/access.ts`:
  - Every `/admin/*` and `/_actions/admin.*` request must carry a valid Cloudflare Access JWT (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`).
  - Its email must be an **active row in `admin_users`**.
  - It is deny-by-default: if anything is missing, the request is refused.
  - To add an editor, add them in the Access policy **and** insert an `admin_users` row with `wrangler d1 execute … --remote`.
- **Each action checks again** with `requireAdmin(ctx)` and writes `audit(adminId, 'area.verb', 'table:id')` to `admin_audit`.
- **CSRF:** Astro's origin check covers form content types.
  - The raw-body upload endpoints (`/admin/magazine/page|pdf`) check `Origin === url.origin` themselves, in `src/lib/admin/raw-upload.ts`.
- **Uploads are checked by their bytes, never the filename or browser MIME type** (CWE-434):
  - `readImageHeader` (JPEG/WebP), `readPngHeader`;
  - the `%PDF-` signature for PDFs;
  - a size cap per file;
  - `content-length` checked **before** the body is read.
- Everything typed is validated with zod. Drizzle parameterises the SQL. Column Markdown is rendered with `html: false`.

### Why some forms are plain POSTs, not actions
**Astro actions cap request bodies at 1 MB, globally**, and raising the cap would also raise it for the public join form. So:
- Anything carrying a file is a **plain multipart POST to the page itself**, or a small `/admin/.../*.ts` endpoint.
- Small one-click changes (publish, hide, delete, captions) are **actions**.

A page that handles both checks `Astro.request.method === 'POST' && !Astro.url.searchParams.has('_action')` for its own upload.

### Sections

| Section | Route | What it does | Key files |
|---|---|---|---|
| Dashboard | `/admin` | Tiles with counts per section | `pages/admin/index.astro` |
| **Editions** | `/admin/editions`, `/new`, `/<date>` | Upload 4 page images (JPEG/PNG, any width) + **required PDF** + **Urdu and English headline** (both required). Saves a **draft** → preview → **Publish**. Replace a live date needs a tick. | `lib/editions/{data,upload}.ts`, `services/editions-admin.ts` |
| **Gallery** | `/admin/gallery` | Multi-select upload, **one photo per request** (`/admin/gallery/upload`), newest batch first in file-name order; duplicate file = moved, not re-added. Optional Urdu/English captions, Hide/Show, Delete (row, then R2 files). | `lib/gallery/{data,upload}.ts`, `services/gallery-admin.ts` |
| **Special editions** | `/admin/special` | One page image per upload + Urdu title (required), English title and printed date (optional). Edit, Hide/Show, Delete. | `lib/special/data.ts`, `services/special-admin.ts` |
| **Magazine** | `/admin/magazine` | Pick month + titles + **PDF**. The **browser renders each PDF page to a JPEG with pdf.js** (2400 px wide), uploads them one per request (`/admin/magazine/page`), then the PDF (`/admin/magazine/pdf`, ≤ 40 MB, raw body), then the `magazineSave` action writes the issue **only after confirming every file is in R2**. Existing month needs "Replace". Titles, Hide/Show, Delete (all pages + PDF). | `lib/magazine/{data,upload}.ts`, `services/magazine-admin.ts` |
| **Columns** | `/admin/columns`, `/new`, `/<slug>`, `/columnists` | One form: pick a columnist by logo or **New columnist** (logo JPEG/PNG + Urdu name + **English name** + column name). Paste Urdu text (Markdown; buttons for `##`, bold, `>`), excerpt auto-filled from the opening lines, optional English (all three fields or none). Publish/draft, homepage spot 1–3, Unpublish (frees the spot), Delete. Columnists page: edit names, replace logo, Active on/off (writers with columns can't be deleted). | `lib/columns/{admin,save,banner,write,rules}.ts`, `services/columns-admin.ts` |
| **Team** | `/admin/team`, `/<id>`, `/<id>/card`, `/<id>/business-card` | Team members (photo cropped in the browser to 4:5), order, hidden, featured, opt-in public profile page; press card with QR → `/verify/<token>`; business card. | `lib/team/*`, `services/team-admin.ts` |

### How the shared upload pieces work (`src/lib/services/images.ts`)
- `webpSize(bytes, width, quality, rotate?)` makes one WebP with the Images binding (`fit: 'scale-down'`, never enlarges).
- `resizeSet(bytes, header, VARIANTS)` makes every size **upright**:
  - Phones store portrait photos sideways with EXIF orientation 6 or 8.
  - It makes the largest size, checks whether that came out sideways (`IMAGES.info`), and if so redoes it with an explicit `rotate`. It returns the displayed width and height.
  - This works whether or not the Images service applies EXIF itself. Wrangler's **local emulation does not.**
  - Not handled: orientation 3 (180°) and mirrored images.
- `putMedia` (immutable cache headers) and `deleteMedia(keys[])` (batches of up to 1000).
- Order on every upload: **R2 first, then D1**. A failure part-way leaves unused objects, never rows pointing at missing files.

### Behaviour decisions already made (don't "fix" these by accident)
- **Editions:**
  - The PDF is required in the admin. It is optional in the CLI.
  - Vol/Issue are not asked for. The masthead Vol/Issue follows the **newest published edition that has an issue number**, so a back-dated publish never rolls it back.
- **Web addresses for columns:**
  - A writer's address comes from the English name (`iqbal-khokhar`, then `-2`…).
  - A column's address is `<date>-<writer>` (`-2`, `-3` for more on the same day).
  - Neither is ever typed by hand or changed after creation.
- **Column saves:**
  - New rows are written insert-only (`createOnly`), with a retry on a taken slug, so two saves at the same moment never overwrite each other.
  - If the column fails to save, a writer created in the same save is removed, so a retry makes no duplicate `-2` writer.
- **Homepage spots:**
  - Saving a column as a draft, or unpublishing it, frees its spot. Re-publishing does not take the spot back.
  - Publishing an edit with "Show on homepage: No" removes it from the homepage.
- **Delete vs Hide:** Delete is permanent (row, then files). Hide keeps everything. Readers' browsers may still hold copies of deleted images.

### Known minor issues (from the 2026-11-15 review, not fixed yet)
- On the column form, after a form error, an excerpt typed by hand gets replaced if the text is edited again (`data-auto` stays `1`).
- An unexpected D1, R2 or Images error shows a bare 500 page, and the pasted column is lost unless the Back button restores it.
- The audit log names a new columnist by the typed English name, not the slug. Status and spot changes made from the form are logged only as `column.save`.
- If two people have the same column open, the one who saves later can take back a homepage spot the other just reassigned.
- The "choose the logo again" hint can appear when an existing writer is selected.
- The columnists page loses typed edits after an error.
- There is no pixel-size cap on logos, so a huge image becomes an Images error, which shows as a 500.
- The main column form has no explicit `action`.
- **Team photos:** the photo limit is 1.5 MB, but they go through the 1 MB action cap, so photos over 1 MB may fail. This hasn't been tested.

## CLIs (`scripts/`, run with `pnpm <name>`)

These still work and share the same pure modules. Pass `--remote` to write to production; otherwise they write to the local D1/R2.

| Command | Use |
|---|---|
| `seed` | One edition: `--date --pages p1 --pages p2 --pages p3 --pages p4 --pdf --headline-ur …` (`--pages` once per file). `--static-only` refreshes site config, ads and contacts. |
| `gallery`, `special`, `magazine`, `columns` | The pre-admin loaders. The admin pages replace them. |
| `ads` | Ad campaigns. There is **no admin section for ads yet**. |
| `team:import` | One-time import (already done). |
| `optimize-image` | Shrink an image before it goes into `src/assets`. |

## Conventions

- **Organisation secure-coding rules apply.** Validate input at the boundary; no string-built SQL or shell; no `innerHTML` with untrusted data; deny by default; no hardcoded secrets; check uploads by bytes and size; fail closed; audit security events without secrets or PII; pin dependencies.
- **Pin dependency versions exactly**, at least two weeks old.
- Use **CSS font sizes** only through tokens (`var(--fs-*)` / `var(--ui-*)`); stylelint enforces it. Admin colours and spacing come from `AdminLayout.astro` (`.a-card`, `.a-btn`, `.a-input`, `.a-alert`, …).
- Mark Urdu inputs with `lang="ur" dir="rtl"` and use `var(--font-naskh)`.
- Put type checks on DOM code in Astro `<script>`. Worker types (`worker-configuration.d.ts`, generated by `pnpm types`) can clash with DOM methods such as `append`, so use `appendChild`.
- Commits use conventional prefixes (`feat(admin): …`, `fix(columns): …`). Specs and plans for larger work live in `docs/superpowers/`.
- **Before deploying:** run `pnpm test && pnpm check && pnpm lint:css`. Migrations go remote **before** the code that needs them.

## Ideas not built yet

- An admin section for ads (today only `pnpm ads`).
- The fixes in "Known minor issues" above.
- A button to clear the cache on publish, so pages update immediately (today, up to 5 minutes).
- AI-filled headlines. The edition form is ready for it; this was decided against for cost.
