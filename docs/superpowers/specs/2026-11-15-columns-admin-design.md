# Columns in the admin panel — design

**Date:** 2026-11-15 · **Status:** approved approach, awaiting doc approval

## Why

The project is leaving the one machine that can run `pnpm columns`. Columns
are the last content type that still needs the terminal. The editor receives
each column as **Urdu text** plus the **columnist's logo** (the ready-made
banner), and reads the writer's name off the logo.

## Goals

- Add a column in one form, including a first-time columnist, from any browser.
- Paste the Urdu text; keep paragraph breaks; a few buttons for the formatting
  columns use (subheading, bold, quote).
- Edit, unpublish, delete columns; pick the 3 homepage columns.
- Fix a columnist's names or logo; retire a writer.

## Non-goals

- A rich-text (WYSIWYG) editor. Markdown in a plain textarea, with buttons.
- Columnist profile pages, comments, machine translation (as in the original
  columns design).

## Anti-goals

- Typing web addresses (slugs) by hand.
- Anything that lets raw HTML from a pasted column reach the page: the body
  stays Markdown, rendered with `html: false` (unchanged).

## Approaches considered

1. **One "New column" form with inline "new columnist"** — chosen. Matches how
   a column arrives (text + logo together).
2. Separate columnist and column pages, mirroring the CLI — works, but extra
   steps every time a new writer appears.
3. A WYSIWYG editor (e.g. TipTap) — heavy dependency, RTL quirks; pasted text
   plus a few buttons covers the Markdown subset columns use.

## Design

**Pages** (`/admin/columns`, nav entry replaces "Coming next → Columns"):

- `/admin/columns` — list, newest first: title, columnist, date, Draft/Live,
  homepage spot if any. Homepage spots 1–3 shown at the top, each a dropdown
  of published columns (or empty).
- `/admin/columns/new` and `/admin/columns/<slug>` — the column form:
  - **Columnist**: dropdown of active columnists (with their logo shown), or
    "New columnist…", which reveals: logo upload, Urdu name (required),
    English name (required — it makes the columnist's web address), column
    name in Urdu (required) and English (optional).
  - **Urdu title** (required), **body** (required; paste; toolbar inserts
    `## `, `**…**`, `> `), **excerpt** (required by the schema; pre-filled
    in the browser from the body's first ~200 characters, editable),
    **date** (default today, Pakistan time).
  - **English** (optional, folded): title, excerpt, body — all three or none.
  - **Publish** or **Save as draft**; **Show on homepage** → spot 1/2/3 (only
    when publishing).
  - Edit page adds **Unpublish** and **Delete** (confirm).
- `/admin/columns/columnists` — each columnist: logo, names, column name,
  number of columns; edit names, replace logo, **Active** on/off. No delete
  for writers with columns (the DB restricts it); inactive leaves the filter.

**Web addresses**: columnist slug from the English name (`iqbal-khokhar`,
`-2` on a clash). Column slug `<date>-<columnist-slug>` (`-2`, `-3` … on a
clash). Never changes after creation.

**Logo (banner)**: stored like the CLI: `orig` + `card` 480w + `view` 960w
WebP via the Images binding (`resizeSet`), keys from `columnistBannerKey`.
Checked by bytes (JPEG/PNG/WebP, ≤ 10 MB, `BANNER_MAX_BYTES`). The form posts
as plain multipart to the page (logo exceeds the 1 MB action cap); text-only
saves are the same POST.

**Writes** reuse `upsertColumnist`, `upsertColumn`, `setHomepageSlot`
(`src/lib/columns/write.ts`); add `deleteColumn(slug)` and
`setColumnistActive`. Unpublishing a column that holds a homepage spot clears
the spot. Every write audited (`column.*`, `columnist.*`).

**Public pages**: unchanged; the 5-minute edge cache applies.

## Left to the builder

Exact layout and wording; client-side excerpt trimming; tests for slug
generation, delete, unpublish-clears-spot, and banner checks.
