# Garden style

A third value of `appearance.style`, next to `notebook` and `classic`: a site
that reads as a digital garden rather than a blog. First of three new styles
(`garden`, then `library` and `vault`); the other two get their own design
later.

## Intent

datme already grows an Obsidian vault into a "digital garden", and already
knows each note's maturity (`stages`, from the top-level folder or a `stage`
property). Neither existing look puts that at the centre: `notebook` is index
cards on dotted paper, `classic` is a quiet serif blog. The owner wants a look
that *feels* like a garden the moment a reader opens it.

Prior art named by the owner: **maggieappleton.com**, where notes sit
"scattered like plants in a garden".

## Goals

- Opening the home page, a reader first sees **notes that were tended
  recently** (owner's words), then the rest of the garden.
- Notes appear scattered like plants: tiles of different sizes, sized by
  maturity, so a glance tells evergreen ideas from seedlings.
- Note pages say how grown a note is and when it was planted and last
  tended, and invite the reader down paths to other notes.
- Readers can wander: filter the garden by stage and by tag without leaving
  the page.
- Selectable per site (`appearance.style: garden`) and per folder.

## Anti-goals

- **It must not look like an ordinary blog** (owner's words). Concretely,
  avoid: a reverse-chronological post list as the main view, cards with cover
  images and long excerpts, a single column of entries. Even "recently
  tended" must not read as a timeline of posts.
- Must not change how `notebook` or `classic` look.

## Non-goals

- The `library` and `vault` styles (separate designs).
- Free-form placement (notes at arbitrary positions, physics, drag). See the
  layout decision below.
- Hand-drawn illustrations or per-note artwork.
- Restyling bases (`base-render.ts` keeps emitting notebook card markup in
  every look today; that stays out of scope).

## Decisions

Everything above the line came from the owner. Items marked **(Claude's
call)** were decided by Claude after the owner asked it to carry on the
brainstorm alone; check them while reading.

Owner:

- Each direction is its own style that changes layout, not just colours.
- `garden` ships first.
- The home leads with recently tended notes.
- Feel modelled on maggieappleton.com; failure mode is "looks like a normal
  blog".

### Configuration (Claude's call)

```yaml
appearance:
  style: garden               # notebook | classic | garden
  folders:                    # new: a style per folder, subfolders included
    Writing: classic
    Garden: garden
  classic: [Writing]          # kept for compatibility, see below
  stream: [Thoughts]
```

- `appearance.style` becomes `z.enum(["notebook", "classic", "garden"])`.
  Define the list once (e.g. `export const STYLES = [...] as const` and
  `type Style`) and use it in the schema, `Base.astro`'s `look` prop,
  `lookOf`, and `THEME_COLOR`, so adding `library`/`vault` later is one
  edit to the list plus the new CSS.
- New `appearance.folders: Record<string, Style>`, default `{}`. Folder keys
  are trimmed of slashes like `classic`. The longest matching folder wins
  (`Garden/Old` beats `Garden`).
- `appearance.classic` keeps its exact current meaning (flip between
  notebook and classic; with `style: garden` it makes those folders
  `classic`, since there is no "other" of garden). Both lists take part in
  one longest-match: `classic: [A/B]` with `folders: { A: garden }` makes
  `A/B` classic and the rest of `A` garden; when the same folder is in both,
  `folders` wins. `classic` is documented as the older
  spelling of `folders: { X: classic }`; no deprecation warning yet.
- `lookOf(note)` becomes `lookOfDir(dir)` + `lookOf(note)` wrapping it,
  returning `Style`.

### Which pages use which look (Claude's call)

- Note pages: `lookOf(note)`, as today.
- **Folder pages now use the folder's look** (`lookOfDir(folder.dir)`):
  both the `data-look` passed to `Base` and the body markup (a three-way
  branch: `IndexCard` wall, `NoteRow` list, garden bed). Today they always use the site style, even for folders
  listed in `classic`; this is a visible change for notebook/classic sites
  too, and goes in the CHANGELOG as such.
- Home, tag pages and all other pages use the site style, as today.
- Stream folders keep winning over style on folder pages (their markup is
  shared); garden only restyles `.stream-item`.

### Home page (Claude's call)

Built in `HomePage.astro` as a third branch, beside notebook and classic.
Data comes from what the page already computes (`listed`, `byRecent`,
`isMoc`, stage counts).

Order on the page: gate, recently tended, paths in, garden bed, beds from
the home note.

1. **Gate**: title, tagline, the home note's intro prose. Short; no stats
   block, no gradient title.
2. **Recently tended**: one horizontal row of up to 6 notes,
   `byRecent(notes, "updated")`, each a small tile with stage icon, title and
   a relative date ("tended 3 days ago"). Scrolls sideways on narrow
   screens. Not a vertical list, not cards with excerpts.
3. **The garden bed**: the main view. Every listed note except the home and
   folder notes, as tiles in a masonry layout (CSS `columns`, so DOM order =
   reading order for keyboard and screen readers). Order: by maturity rank,
   most mature first, then by `updated` within a rank, so the bed opens on
   evergreens rather than repeating the "recently tended" row, and never
   reads as a timeline. Every note is in the HTML so filters and counts are
   complete; the script hides tiles past the first 60 until the reader
   presses "walk the whole garden" or applies a filter. Without JavaScript
   all tiles show. The archive page is not linked and stays as it is.
4. **Paths in**: MOCs (`isMoc`) as a short row of wider "trailhead" tiles,
   placed between "recently tended" and the bed. MOCs also stay in the bed,
   so filters stay complete. Blog posts get no section of their own; they
   are plants like any other.
5. **Beds from the home note**: the H2 sections of the home note (today's
   "shelves") render below, as prose in garden typography.

### Tiles (Claude's call)

One new component, `GardenTile.astro`, used on home, folder and tag pages.

- Size comes from the stage's maturity rank. Rank = position in the
  `stages` config, first = least mature (the presets already run fleeting →
  literature → permanent). With three or more stages: last stage = large,
  first = small, the rest = medium. With two: small and large. Notes
  without a stage = medium.
- Small: icon + title. Medium: icon + title + relative tended date. Large:
  larger title, a description clamped to two lines, tended date, up to 3
  tags.
- No banner images, no reading time, no tape/rotation (that is notebook's
  language). Soft, slightly irregular corners and a faint growth colour per
  rank: pale for seedlings, deeper green for evergreens.
- `data-stage` and `data-tags` attributes carry what the filter needs.
- **No stages configured**: every tile is medium, and the stage filter is
  replaced by a top-level-folder filter.

### Filters (Claude's call)

Above the garden bed: a row of stage chips (all / each stage with its icon
and count) and a tag select listing the 12 most used tags. Client-side,
hiding tiles by `data-stage`/`data-tags`. Without JavaScript every tile
shows and the controls are hidden. Reuse the existing `Filters.astro` and its
client script if they can take a new scope (`"garden"`); otherwise a small
new script in `src/scripts/`.

### Note page (Claude's call)

Same structure as today (no new sections), restyled under
`[data-look="garden"]`, plus wording and placement changes:

- `NoteMeta`: in garden, the stage chip is prominent (icon + label, growth
  colour), and dates read "Planted {created} · Last tended {updated}"
  (relative for the last 30 days, absolute after) instead of the
  calendar/edit icons.
- Backlinks and related notes: section heading "Paths from here" (backlinks)
  and "Nearby" (related); each item shows the linked note's stage icon.
  Unlinked mentions unchanged.
- TOC, local graph, comments, series, trails: unchanged markup, garden
  colours.

### Folder and tag pages (Claude's call)

Garden bed of `GardenTile`s (no cap), ordered as on the home, with the same
filters. Tag pages keep following the site style, as today. Folder cards for subfolders keep their markup, garden styling.

### Visual language (Claude's call)

- Light: warm cream paper (around `#f7f3e8`), ink in dark green-brown, moss
  accent (around `#4f7a3a`), earth secondary (around `#a0703c`).
- Dark: "the garden at night": deep green-black background (around
  `#121a14`), cream text, lighter moss accent. Not neutral grey.
- Type: Fraunces for headings and titles, Literata for reading, Inter for
  UI. Loaded from Google Fonts the way `notebook.css` loads Bricolage.
  `theme.fonts` and `theme.accent` keep overriding them via `themeCss()`.
- Little chrome: few borders, generous space, rounded soft shapes. Stage
  emoji are the only icons on tiles.
- `THEME_COLOR.garden` = the light background; `Base.astro`'s `theme-color`
  meta should follow the look (today it is hard-coded to classic's colours).
- Print: garden prints like classic (add the garden selectors to
  `print.css` where notebook has its own).

### Strings

New UI strings in `src/lib/i18n.ts`, Vietnamese and English (other languages
fall back as usual): recently tended, tended {relative}, planted, last
tended, paths from here, nearby, walk the whole garden, all stages.

## Constraints

- All garden CSS lives in `src/styles/garden.css`, every rule scoped to
  `[data-look="garden"]`, imported in `Base.astro` next to `notebook.css`.
  It must not change `notebook` or `classic` rendering.
- Tokens use the same custom property names as `global.css`/`notebook.css`
  (`--bg`, `--ink`, `--accent`, …) so `themeCss()` overrides keep working.
- Static output stays usable without JavaScript.
- Accessible: tile order = DOM order, filters are real buttons/selects,
  colour is never the only signal of stage (the icon is always there),
  contrast passes AA in both schemes.
- Repo conventions: Conventional Commits, CHANGELOG entry under
  `## [Unreleased]` in the same commit as user-visible changes.

## Done means

- `bun test` passes, including new tests:
  - config: `style: garden` and `folders` resolve.
  - nav: `lookOf`/`lookOfDir` with folders, classic and garden: longest
    match across both lists, `folders` wins a tie.
  - build: a `classic` folder on a notebook site renders its folder page with
    `data-look="classic"` and `NoteRow` markup.
  - build (fixture vault): a folder mapped to `garden` renders notes and its
    folder page with `data-look="garden"` and `garden-tile` markup; a fixture
    build with `style: garden` renders the recently-tended row and the
    garden bed on the home, with every listed note present as a tile.
  - styles: every selector in `garden.css` starts with `[data-look="garden"]`.
- Updated docs: `docs/configuration.md` (style values, `folders`),
  `README.md` feature line, the `datme init` config template in
  `src/cli.ts`, and the CHANGELOG.
- A screenshot of the garden home (light and dark) via `tools/screenshots.ts`
  or by hand, for the owner to judge the "not a blog" test by eye.

## Left to the builder

- Exact colours, spacing, tile proportions and corner shapes, within the
  visual language above.
- Whether to extend `Filters.astro` or write a dedicated garden filter.
- How to render relative dates (build time vs. client update).
- Whether the docs site itself switches to `garden` (nice dogfooding, but
  only after the owner has seen it).
