# Garden style

A third value of `appearance.style`, next to `notebook` and `classic`: a site
that reads as a digital garden rather than a blog. First of three new
site-wide styles (`garden`, then `library` and `vault`); the other two get
their own design later.

The same design adds per-note styles and navigation frames driven by page
layouts, and two styles made for layouts: `resume` for `cv` and `darkroom`
for `gallery`.

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
- Integrates with page layouts (branch `worktree-feat-note-layouts`): a note
  with a `layout` gets that layout's own style and navigation frame by
  default, and any note can override both.
- A CV and a gallery each get a look made for them (`resume`, `darkroom`)
  instead of borrowing a site-wide one.

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
- Styles for layouts other than `cv` and `gallery`; they use the site-wide
  styles until the owner asks for more.
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
- A note with a `layout` uses its own theme, and even its own navigation
  frame. A `cv` page looks like a standalone profile page, without sidebars
  or graph.
- Both a layout default and a per-note override: the layout gives a default
  style, the note can override it.
- Approved (in chat) the property names, precedence and per-layout defaults
  in "Page layouts" below, which Claude proposed.
- `cv` and `gallery` need themes of their own. Approved Claude's sketch of
  `resume` and `darkroom` (see "Layout styles" below) as proposed.

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

- Note pages: `lookOf(note)`, which now applies the four-tier precedence of
  "Page layouts" below.
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
   reading order for keyboard and screen readers). Order (revised after
   visual check): ranks dealt round-robin, one note from each rank per
   round, most mature rank first, newest `updated` first within a rank
   (notes without a stage form the lowest rank), so the bed opens on an
   evergreen rather than repeating the "recently tended" row, sizes mix in
   every column instead of forming bands, and it never reads as a
   timeline. Every note is in the HTML so filters and counts are
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

New UI strings in every `src/i18n/<lang>.json` (since `cdcc4a9` the seven
built-in languages must share the English keys): recently tended, tended {relative}, planted, last
tended, paths from here, nearby, walk the whole garden, all stages.

## Page layouts: style and chrome per note

Builds on branch `worktree-feat-note-layouts`, which another session
develops. State checked on 2026-10-17 17:21 (commits `ab0b062`, `9755916`,
`12eea4f`, rebased onto `main` at `cdcc4a9`):

- `LAYOUTS` (in `src/lib/vault.ts`) has all 15: `cv`, `gallery`,
  `timeline`, `links`, `uses`, `now`, `faq`, `quotes`, `projects`, `books`,
  `movies`, `talks`, `recipes`, `places`, `shelf` (commit `12eea4f`);
  `books` and `movies` are presets of `shelf`. An unknown `layout` value already warns and
  renders as a plain note.
- Transforms and collections live in `src/lib/note-layouts.ts`
  (`layoutHtml`, `collectionOf`, `isCollection`); components are
  `Collection.astro`, `CvHead.astro`, `LinksHead.astro`. Collections take
  their notes from an embedded base when there is one, else `from`, else
  the note's folder.
- Outside the body, a layout today only: adds class `layout-<name>` to the
  article; hides backlinks, related notes, unlinked mentions and the
  reading-progress bar; replaces the note head for `cv` (unless protected)
  and `links`; narrows `links` to 34rem. `Base.astro`, the rail (TOC,
  graph), the header and the colour scheme are untouched. `print.css` hides
  the CV print button and its breadcrumbs.
- A folder note with a layout lays out its folder page; a collection layout
  replaces the folder's note list.
- Properties introduced there: `layout`, `cover`, `from`, and per-layout
  ones (`role`, `status`, `rating`, …; planned `group`, `statuses`,
  `fields`). None is named `style` or `chrome`.

### Properties (approved by the owner)

- `style:` on a note: `notebook`, `classic`, `garden`, `resume` or
  `darkroom` (later `library`, `vault`). Validated against the same `STYLES` list; an unknown value is a
  build warning (through the existing problems/doctor channel) and is
  ignored.
- `chrome:` on a note: the frame around it.
  - `full`: today's page: header with menu and search, explorer, TOC, graph.
  - `minimal`: one thin bar with the site name (and logo) linking home, plus
    the light/dark toggle. No main menu, no search trigger, no left or right
    rail, no local graph. Footer kept, reduced to one line.
  - Unknown values warn and fall back as if unset.

### Precedence (approved by the owner)

Style, highest first:

1. the note's `style` property
2. the default of its `layout`
3. `appearance.folders` / `appearance.classic` (longest match)
4. `appearance.style`

Chrome: the note's `chrome`, else the layout default, else `full`.

Implemented once, e.g. `src/lib/look.ts` exporting `lookOf(note)` and
`chromeOf(note)` (moving `lookOf` out of `nav.ts`), so every page asks the
same function.

### Layout defaults

The owner approved the model (layout default, note override) and the first
four rows as originally proposed (`cv`, `gallery`, `projects`, `books`).
Extending them to the layouts added since is **Claude's call**, grouped by
what the page is:

| group | layouts | style | chrome | scheme |
|---|---|---|---|---|
| résumé | `cv` | `resume` | `minimal` | site default (print always light) |
| standalone page | `links` | `classic` | `minimal` | site default |
| pictures | `gallery` | `darkroom` | `minimal` | dark by default |
| page of the site | `timeline`, `now`, `uses`, `quotes` | site's resolved style (tier 3/4) | `full` without TOC and graph | site default |
| reference page | `faq` | site's resolved style | `full` (the TOC helps) | site default |
| collection | `projects`, `talks`, `recipes`, `places` | site's resolved style | `full` without TOC and graph | site default |
| shelf | `shelf`, `books`, `movies` | site's resolved style; `library` once it exists | `full` without TOC and graph | site default |

- The table lives in code as `Partial<Record<Layout, LayoutLook>>`, next to
  the style resolution. A layout with no row gets no default (site style,
  `full` chrome), so layouts added on the other branch never break the
  build and only need a row when they want one.
- Notes *listed by* a collection (a book, a project) have no layout of their
  own and follow the usual precedence; the item detail header planned on
  the layouts branch is body markup and needs nothing from this design.
- `minimal` chrome also drops the breadcrumbs, which generalises what
  `print.css` already does for `.layout-cv .crumbs`. **(Claude's call)**
- "`full` without TOC and graph" is a third internal frame value
  (`full-norail`, say), reachable only through a layout default; the
  property only accepts `full` and `minimal`. **(Claude's call)**
- Dark by default belongs to the `darkroom` style, not to the `gallery`
  layout, so `style: darkroom` on any note starts dark too. It means: when the reader has no stored choice,
  the page starts dark; a stored reader choice still wins, and the toggle
  still works. Implemented as a per-page hint (e.g.
  `data-scheme-default="dark"`) read by the inline theme script in
  `Base.astro`. A site with `theme.scheme: light` still gets a dark
  darkroom page. **(Claude's call)**

### Layout styles: `resume` and `darkroom` (approved by the owner)

Both join the one `STYLES` list, so any note can ask for them with `style:`
and `appearance.style`/`folders` accept them. They are designed for a
single page, so the docs recommend them only per note; nothing blocks a
site-wide use, and home/folder/tag pages under them fall back to classic
markup with their colours. **(Claude's call, as proposed)** Each lives in
its own stylesheet (`src/styles/resume.css`, `src/styles/darkroom.css`),
every rule scoped to its `[data-look=…]`, and gets a `THEME_COLOR` entry.

**`resume`**, default of `cv`:

- On screen the page is an A4 sheet (210mm wide, scaled down on narrow
  screens) centred on a light grey desk, with a soft shadow, so it reads as
  "a CV" at a glance.
- Two columns: a narrow left column for the CV head (photo, name, role,
  contacts, links), and the summary and `##` sections on the right, each
  section heading set in the margin. On phones it becomes one column.
- Sans-serif type, restrained, one accent colour for section headings and
  links.
- Print gives exactly that sheet: no grey desk, no shadow, always white
  paper and dark ink even when the reader is in dark mode; the print button
  stays hidden as today.
- Dark mode only changes the screen: the sheet turns dark grey on a darker
  desk and still reads as one sheet.
- Builds on `CvHead.astro` markup from the layouts branch (`.cv-head`,
  `.cv-photo`, `.cv-id`, `.cv-role`, `.cv-contact`). The left column holds
  only that head: moving a `## Skills` section into it would need markup
  changes on the layouts branch, so it stays on the right. **(Claude's call)**
- A `cv` note that is protected keeps the normal note head (layouts-branch
  behaviour); `resume` must still look right with it.

**`darkroom`**, default of `gallery`:

- Near-black background, text and rules in neutral greys only, no accent
  colour, so nothing tints the pictures. Links still need a visible,
  non-colour cue (underline).
- Pictures in rows of equal height filling almost the full width
  (justified rows), with thin gaps. Captions small: under each picture on
  phones, on hover/focus on larger screens (always reachable by keyboard).
- The lightbox (`src/scripts/lightbox.ts`) on pure black.
- Light mode is a "gallery wall": off-white background, same neutral
  greys. Dark is the default (see the scheme hint above); the toggle
  works.
- Builds on the layouts branch's `galleryHtml` markup
  (`.gallery-grid > figure.gallery-item > img + figcaption`). Justified rows
  need each picture's aspect ratio; if the `img` tags do not carry
  `width`/`height`, the builder either adds them on the layouts side
  (coordinated with that branch) or falls back to a uniform-height masonry
  without cropping. **(Claude's call)**
- Headings in a gallery note still start albums, set as quiet small-caps
  labels above each grid.

### Folder pages with a layout

A folder note with a `layout` already lays out its folder's page on that
branch. The folder page then takes its look and chrome from that folder note
(same precedence), not from `lookOfDir`. **(Claude's call)**

### `Base.astro`

- Gains a `chrome` prop next to `look`; the `rail` prop of note pages is
  dropped when chrome is `minimal` or `full-norail`.
- `data-chrome` on `<html>` so CSS can tune spacing; markup for left/right
  rails, main nav and search trigger is not rendered at all under
  `minimal` (not merely hidden), keeping the page light and printing clean.
- Search, command palette and keyboard shortcuts that depend on the header
  must not throw when it is absent.

### Order of work (Claude's call; revised after the owner agreed to "rebase first", because the layouts session will not rebase yet)

1. Build the garden style on `main`, with the style resolution in one place
   (`src/lib/look.ts`) already taking a note, so the layout tier is a later
   addition, not a rewrite. This does not wait for the layouts branch.
2. Once the layouts branch has landed on `main` (its session owns that;
   as of 2026-10-17 17:21 it is rebased onto `main` at `cdcc4a9`, with all
   15 layouts committed, but not merged), add the layout tier, `chrome`,
   `full-norail`, the scheme hint and the defaults table, on a branch from
   `main`.
3. Then `resume` and `darkroom`, which style markup that only exists on the
   layouts branch.
4. Until then, nothing in this design edits files owned by the layouts
   branch (`note-layouts.ts`, `Collection.astro`, `CvHead.astro`,
   `LinksHead.astro`); the shared hot spots are `NotePage.astro`,
   `FolderPage.astro`, `vault.ts` and `global.css`/`print.css`, so step 1
   keeps its edits there small.

### Tests for this part

- look: each tier wins over the ones below it; unknown `style`/`chrome`
  values warn and are ignored.
- build (`tests/fixtures/layouts`): `cv` renders `data-look="resume"`,
  `links` renders `data-look="classic"`, both with `data-chrome="minimal"`
  and no explorer, TOC, graph, main nav or breadcrumbs; a `cv` with
  `style: garden` renders `data-look="garden"`; `gallery` renders
  `data-look="darkroom"` with the dark scheme hint; `projects`
  renders no TOC or graph but keeps the header; a note with a layout that
  has no row renders as today.

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
  - styles: every selector in `garden.css`, `resume.css` and `darkroom.css`
    starts with its own `[data-look=…]`; `print.css` forces light paper for
    `resume`.
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
