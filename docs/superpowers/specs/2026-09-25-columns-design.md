# Columns (کالم): design

Date: 2026-09-25 · Status: approved in chat, pending review of this document

## Goal

Give columns their own section, separate from articles (مضامین):

- a **columns list** at `/columns` (and `/en/columns`);
- a **reading page** for one column at `/columns/<slug>`;
- **three columns on the homepage, picked by the editors**, not the latest three.

The picks will be made from the admin panel later. Until then, a CLI script sets them.

## Decisions made in discussion

| Question | Decision |
|---|---|
| Articles and columns on one page, or two? | Two sections. "کالم" is a new menu item next to "مضامین". `/articles` stays a placeholder. |
| How is a columnist represented? | A `columnists` record with the name, the column's name and a **banner image**, the ready-made picture Urdu papers use (photo, column name, byline, email). No profile pages yet. |
| Where does the banner appear? | On every column the writer publishes: on the reading page, on list cards and in homepage picks. It is always shown whole, never cropped. |
| Homepage when fewer than three are picked | Show only what is picked. With no picks, the section is hidden. It never falls back to the latest columns. |
| How picks are stored | A three-slot `homepage_columns` table (approach 1 of 3). |
| English pages | Use the English translation if there is one. Otherwise show the Urdu original, marked as Urdu, through the existing `resolveTranslation` fallback. |

## Data model

### New table `columnists`

| column | type | notes |
|---|---|---|
| `id` | integer PK | |
| `slug` | text, unique | e.g. `iqbal-khokhar`. Unused by any page today; reserved for future profile pages and used by the list filter. |
| `name_ur` | text, not null | اقبال کھوکھر |
| `name_en` | text, null | Falls back to `name_ur`. |
| `column_title_ur` | text, not null | قلم کا فرض |
| `column_title_en` | text, null | Falls back to `column_title_ur`. |
| `banner_hash` | text, not null | Content hash. R2 keys are derived from it (see Media); the URL is never stored. |
| `banner_width`, `banner_height` | integer, not null | Original pixel size, so the page can reserve the right space and avoid layout shift. |
| `active` | integer (bool), default true | An inactive columnist is hidden from the list filter. Their columns stay published. |
| `created_at`, `updated_at` | integer | |

### Changes to `articles`

- Add `columnist_id` integer, nullable, `REFERENCES columnists(id) ON DELETE RESTRICT`. A columnist who still has columns cannot be deleted; mark them inactive instead.
- A CHECK constraint enforces that a row is a column exactly when it has a columnist: `(category = 'column') = (columnist_id IS NOT NULL)`.
- Add an index on `(category, status, published_date)` for the list query.

### Changes to `article_translations`

- `author` becomes nullable. For columns, the byline comes from the columnist, so it is not retyped. For other categories, the service layer requires `author`. A CHECK constraint can't span the two tables, so this is enforced in the service and covered by a test.
- The articles table is empty in production, so rebuilding the table for this change carries no data risk.

### New table `homepage_columns`

| column | type | notes |
|---|---|---|
| `slot` | integer PK | CHECK `slot IN (1, 2, 3)`. |
| `article_id` | integer, unique, not null | `REFERENCES articles(id) ON DELETE CASCADE`. When the column is deleted, its slot empties. The unique constraint means one column fills at most one slot. |
| `updated_at` | integer | |

The service does not trust the slot table alone. It joins to `articles` and keeps only rows with `category = 'column'` and `status = 'published'`, in slot order. A picked column that is later unpublished drops off the homepage automatically.

## Media

The banner follows the pattern `src/lib/media.ts` uses for edition pages: immutable, content-hashed keys, cached forever.

```
columnists/<slug>/banner-card.<hash>.webp    480w  (list cards, homepage)
columnists/<slug>/banner-view.<hash>.webp    960w  (reading page, OG image)
columnists/<slug>/banner-orig.<hash>.<jpg|png>
```

- Pure key and URL helpers are added to `media.ts`, validating the slug and hash like the existing `assert*` helpers.
- The derivative code goes in `scripts/ingest.ts`, reusing `sharp` and `contentHash`. Images are never upscaled. Accepted inputs are JPEG and PNG up to 10 MB. Anything else is rejected before processing.
- Images are rendered with their stored `width`/`height` and `height: auto; max-width: 100%; object-fit: contain`, so any banner shape shows whole.

## Body format

- `article_translations.body` holds **Markdown**. The supported subset matches the admin mockup's toolbar: paragraphs, `##` subheadings, bold and italic, block quotes (pull quotes), bulleted and numbered lists, and links.
- It is rendered on the server by `markdown-it` (pinned) with `html: false`, so raw HTML is escaped, not passed through. The default `validateLink` is kept, which rejects `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs. External links get `rel="noopener nofollow"`.
- The rendered HTML is inserted with Astro's `set:html` only from this renderer's output, never from raw input (secure-coding rule 3).
- Reading time is estimated at 200 words per minute, rounded up, minimum 1.

## Pages

### Menu and footer

`AMHeader` items become: Home, Archive, **Columns**, Articles, About, Contact. The same link is added to the footer's sections list. New i18n keys: `nav.columns` ("کالم" / "Columns"), plus the `columns.*` strings below. `links.ts` gains `columns` and a `column(slug)` helper.

### `/columns` (ur) and `/en/columns`

- A heading "کالم" with a one-line description.
- Filter buttons: "سب" (All), then each active columnist who has at least one published column. The filter is a query parameter (`?columnist=<slug>`), so it works without JavaScript. An unknown slug is treated as "all" and does not error.
- A grid of cards, 3 / 2 / 1 across on desktop, tablet and phone. Each card shows the banner (`card` size), column name, title, a two-line excerpt, the columnist's name and the date. Newest first.
- 12 per page. `?page=N` uses the pagination style from the articles mockup. A page number that isn't a positive integer, or is out of range, gives a 404. So does a filtered list with no results beyond page 1.
- Empty state (no published columns): a short note, not a broken grid.

### `/columns/<slug>` and `/en/columns/<slug>`

- Layout from the article-detail mockup (`screens/05-article-detail.png`): the label "کالم · <column name>", the title, then the byline (columnist's name · date · reading time).
- The **banner** comes directly under the byline, full width of the reading column, `view` size, whole and never cropped. Its alt text is `<columnist name> — <column name>`.
- Then the rendered body.
- "More from this columnist": up to three of their other latest published columns. The block is omitted when there are none.
- `<head>`: the title, a meta description from the excerpt, a canonical URL, and `og:image` set to the banner (`view`). JSON-LD `OpinionNewsArticle` with `author.name`, `datePublished` and `image`.
- Draft, unknown slug, or a slug that belongs to a non-column article: 404.
- English page with no English row: the Urdu content, marked with `lang="ur" dir="rtl"`, plus the existing fallback note.

### Homepage section

- Placed after the "آج کا اخبار" section and before the `home-sponsor-strip` ad.
- A heading "کالم" plus a "تمام کالم ←" link to `/columns`. Up to three cards in slot order: banner, title, two-line excerpt, columnist's name.
- No valid picks: the section is not rendered, and no empty heading is left behind.

## Services (`src/lib/services/columns.ts`)

The pages, and the admin panel later, go through these functions and never query the tables directly:

- `listColumns({ locale, columnistSlug?, page })` → `{ items, total, page, pageCount }`
- `getColumn(slug, locale)` → the column plus its columnist, rendered HTML, reading time and translation meta, or `null`
- `moreFromColumnist(columnistId, excludeArticleId, locale, limit = 3)`
- `listFilterColumnists(locale)`
- `getHomepageColumns(locale)` → 0–3 cards in slot order, published columns only
- Write side (used by the CLI now, the admin later): `upsertColumnist`, `upsertColumn`, `setHomepageSlot(slot, articleSlug | null)`. Every input is validated with zod at this boundary.

## Content entry before the admin: `pnpm columns`

`scripts/columns.ts`, modelled on the existing seed and ingest scripts and using the same `d1.ts` and `r2.ts` helpers:

```
pnpm columns columnist add --slug iqbal-khokhar --name "اقبال کھوکھر" --column "قلم کا فرض" --banner ./banner.png
pnpm columns column upsert ./columns/maqami-sahafat.md
pnpm columns home set 2 maqami-sahafat
pnpm columns home clear 2
pnpm columns home list
```

- The column file is Markdown, with front matter giving `slug`, `columnist`, `title`, `excerpt`, `date`, `status` and optionally `title_en` / `excerpt_en` / `body_en`. Re-running it with the same slug updates the column.
- The target is the **local** database and local R2 by default. Writing to production requires `--remote`, and the script prints the target before writing.
- It never logs file contents or credentials.

## Error handling

- Invalid CLI input (a missing columnist, bad slug, wrong image type or size, slot outside 1–3, picking a non-column or draft): the script exits non-zero with a clear message and writes nothing.
- A page request with a bad query parameter gives a 404 or falls back to "all", as specified above. Never a 500.
- A missing banner object in R2 is logged server-side with the columnist's slug only. The page still renders, with the image's reserved space empty.

## Testing

A new dev dependency, `vitest` (pinned), with a `pnpm test` script. The unit tests cover:

1. Markdown safety: `<script>`, `<img onerror>`, `javascript:` and `data:text/html` links all come out inert. The allowed subset renders correctly, with `dir` and quotes intact for Urdu.
2. Homepage picks: slot order is respected, unpublished and non-column rows are dropped, and 0–3 results come back.
3. The category/columnist rule: a column without a columnist is rejected, as is a non-column with one. A non-column without `author` is rejected by the service.
4. Reading time: 0, 199, 200 and 201 words; Urdu text is counted by whitespace.
5. Media key helpers: valid keys are built, and path-traversal slugs or bad hashes are rejected.

Manual checks against the local database, with two sample columnists (one using the supplied Iqbal Khokhar banner) and about 15 sample columns: `/columns`, the filter, pagination, a reading page, the homepage with 0, 2 and 3 picks, the English fallback, and phone (390px) and desktop widths. Also `pnpm check` and `pnpm lint:css`.

Release: commit, push, run `pnpm db:migrate:remote`, then `pnpm run deploy`. Sample content goes only into the local database, so production shows no columns until real ones are added.

## Out of scope

Admin screens, columnist profile pages, search, the articles (مضامین) list, comments, and machine translation of columns.
