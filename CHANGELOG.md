# Changelog

All notable changes to datme are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `datme related <note>` lists the published notes related to a note, even a
  private one, and the places where its text names a published note without
  linking to it. The Obsidian plugin shows both in a *link suggestions* pane
  beside the note being written, where one click turns a mention into a link.

- `datme check --verbose` points at the shape of the garden: orphan notes no
  one links to, dead ends that link nowhere, and hubs with far more links than
  the rest, which a map of content could split. `check.structure: false` turns
  these notices off.

- With `related.semantic`, the search dialog opened on a note lists the notes
  closest to it in meaning, from vectors the build writes next to the search
  index. No model is downloaded for it.
- `search.meaning: true` lets readers search by meaning: a ✨ button downloads
  the model into their browser once, then results blend the words typed with
  closeness in meaning. Queries never leave the page.

- `privateLinks` chooses what a link to an unpublished note leaves on the page:
  its words as written (`text`, the default), a neutral "a private note"
  (`placeholder`), or nothing unless the link has an alias (`hide`). It covers
  links, embeds, backlink snippets, properties and Dataview fields, and
  `datme check --verbose` names every link that still shows a private note's
  name.
- `datme check --privacy` lists everything that leaves the vault: published
  notes and their URLs, pages of canvases, bases and drawings, copied files,
  the properties shown, the words of links to private notes, and the outside
  hosts the site loads from. `--json` prints it as JSON.

- Code blocks of more than one line show a column of line numbers, left out
  when the code is copied. Blocks without a language get it too.
- `` ```base `` code blocks render the base written inside them, every view in
  turn, the way Obsidian shows a base in a note. In a block or an embed,
  `this` is the note holding it, so `file.hasLink(this.file)` lists the notes
  linking there.
- Coloured highlights from Obsidian 1.14: a colour emoji right after the
  opening `==` (🔴 🟠 🟡 🟢 🔵 🟣) paints the highlight in that colour, in both
  themes, the notebook look and print, and the emoji itself is not shown.
- D2 diagrams and Typst documents are drawn into SVG at build time, in both
  themes, ABC sheet music is typeset with abcjs, and ```` ```markmap ```` or
  ```` ```mindmap ```` blocks become interactive mind maps. D2 and Typst are
  optional dependencies, installed only by vaults that use them.
- ```` ```tabs ```` blocks of the Tabs plugins show one tab at a time, with
  full markdown inside each tab, and Multi-Column Markdown regions and
  `> [!multi-column]` callouts lay their content out in columns.
- Audio and video embeds start at a time, as in `![[talk.mp4#t=1:30]]`, and a
  `.vtt` or `.srt` file of the same name becomes captions and a searchable
  transcript whose timestamps play from that line.
- Guided trails: a note with `trail: true` lists stops through the garden,
  each with the guide's words for it. Readers start the trail from its page, and
  every stop then shows the step they are on, with `n` and `p` to move along.
- `datme.config.mjs` can render fenced code blocks of its own with
  `codeBlocks`, add tags to the `<head>` of every page with `head`, and take
  `plugins` that bundle these with remark and rehype plugins, so a package can
  ship a whole feature.
- `theme.code`, `theme.comments`, `theme.mermaid` and `theme.d2` choose the
  themes of code blocks (any Shiki theme), giscus comments, Mermaid and D2
  diagrams, one for both colour schemes or a light and a dark one, and
  `map.darkTiles` gives maps their own dark tiles. Each follows the site's
  light/dark toggle.
- `theme.scheme: dark` (or `light`) opens the site in that colour scheme
  instead of the reader's system one; the toggle still switches it and
  remembers their choice.

### Changed

- Notes that embed others or run queries are cached between builds as well,
  and rendered again only when what they read changes: the embedded notes, or
  the pages a query can see (just its folders and tags, for a Dataview `FROM`
  that names only those). Queries reading `today` are rendered again each day.
  `datme build --verbose` reports how many notes came from the cache.
- Sidenotes in the margin are tied to their line by a dashed leader, and
  pointing at a footnote number picks out its note. In the notebook look they
  stand clear of the page's frame instead of touching it.

### Fixed

- Comments open in the theme the page is in, not the system's, when the
  reader has switched it with the toggle.
- Links inside headings are readable again: they keep the heading's colour
  and are marked by an underline, instead of a pill or highlighter that hid
  the text on the inked `##` strip of the notebook look.

## [2.0.0] - 2026-10-07

### Added

- An Obsidian companion plugin that toggles `publish` from the status bar,
  checks the garden and previews the current note.
- `datme url` prints the URL path of a published note, and
  `datme check --json` prints every problem as JSON for tools.
- Lock passwords shared by a `@group`, read from `DATME_LOCK_<GROUP>` so they
  can live in CI secrets; without the variable the locked content is left out
  rather than published in the clear. Files used only by encrypted content
  travel inside the ciphertext.
- Email subscriptions to new notes, per folder or tag.
- Dataview inline queries and inline fields.
- Iconize icons on folders and notes.
- Maps drawn from Leaflet plugin blocks.
- A journal: a calendar of daily notes, with links to the previous and next
  day.
- Contribution Graph plugin heatmaps.
- The history of each note, drawn from git, showing how the idea grew.
- Related notes by meaning, from embeddings computed locally at build time.
- The documentation is published as a datme garden, with a showcase of live
  examples of each feature.

### Changed

- Notes that run inline queries or draw maps from other notes are no longer
  cached, so they always follow the notes they read.

### Fixed

- Blur placeholders of images in cached notes are no longer pruned from the
  build.
- Markdown links to canvases and drawings open their pages.
- A deck's Marp directives no longer show up among its properties.

## [1.1.0] - 2026-10-07

### Added

- Excalidraw drawings are drawn from their scene at build time, hand-drawn
  lines and all, with no exported image needed.
- Excalidraw links, frames and embeds behave as in the plugin: element links
  lead to published notes, frames clip their content, `#^frame=`,
  `#^clippedframe=`, `#^group=` and `#^area=` embed parts, and nested
  drawings, notes and LaTeX show inside.
- Each drawing gets its own page, opens in the lightbox and uses the plugin's
  fonts.
- Marp slide decks: notes with `marp: true` render as decks with the vault's
  `@theme` stylesheets, and a ▶ Present button shows them full screen.
- Lock single passages of a note with a password instead of the whole note.
- The datme logo and a footer credit.

### Changed

- The README is rewritten, and the reference moves into `docs/`.

## [1.0.0] - 2026-10-07

### Added

- Notes that are not translated into a language show the original text with
  a notice; the `lang` frontmatter field marks the source language.
- Related notes and unlinked mentions under the backlinks, tuned with
  `related.count` and `related.mentions`.
- `theme.accent`, `theme.fonts` and a vault `datme.css` to restyle the site.
- A `permalink` frontmatter field, with old URLs and aliases redirected
  through a generated `_redirects` file.
- Problems found by `datme check` shown on the note page under `datme dev`.
- `datme check --external` to find dead external links.
- Dataview `GROUP BY` and `TASK` queries, and unquoted `date(today)`.
- RSS feeds per folder and tag, and a recent notes page.
- Links between the parts of a series.
- Footnotes as margin sidenotes, and BibTeX citations.
- A lightbox for note images.
- A timeline page and a map of notes.
- `datme export` to turn a folder into an EPUB or a single printable page.
- Flashcard clozes and a practice mode that remembers progress.
- Tasks plugin query blocks, and embedded search `query` blocks.
- Charts plugin blocks, drawn with Chart.js in the site's colours.
- Kanban plugin boards, with their lanes side by side.
- A glossary that links the first mention of each term note.
- Hover previews for footnotes and citations.
- A link to share an exact selected passage.
- Reading progress and time left.
- A reader menu for text size, a legible font and high contrast, and support
  for right-to-left languages.
- Graph colouring by folder or type, and a time slider that replays how the
  garden grew.
- A random note button, and `j`/`k` to move between notes.
- `llms.txt` and Markdown copies of every published note.
- A generated `_headers` file with caching rules and an opt-in CSP.
- Dead external links pointed at the Internet Archive.
- Preview cards for pasted URLs.
- Scheduled notes with `publish_date`.
- `--drafts` to preview unpublished notes.
- Pagefind as a search option for large vaults.
- A `/stats` page showing the garden in numbers.
- The vault's own remark and rehype plugins are loaded into the Markdown
  pipeline.

### Changed

- Images are served as resized WebP copies with `srcset` and explicit sizes,
  so pages no longer jump while they load.
- Images show a blurred placeholder while they load.

### Fixed

- Check problems no longer leak into builds run with a `NODE_ENV` other than
  `production`.
- Folder and series toggles no longer nest a link inside their control, which
  screen readers announced badly.
- Leaflet's stylesheet loads only on the map page instead of on every page.

## [0.1.1] - 2026-10-07

### Added

- Line breaks are kept in poems.

### Fixed

- CI configs written by `datme deploy` run the scoped `@dynamotn/datme`
  package.
- `bunx @dynamotn/datme` no longer fails with `EXDEV` when the package is
  unpacked on another filesystem.

### Changed

- The CLI ships as a small JavaScript bin that loads the installed
  dependencies instead of bundling them.

## [0.1.0] - 2026-10-07

### Added

- Turn an Obsidian vault into a static digital garden built with Astro, from
  notes marked `publish: true`.
- Obsidian syntax: wikilinks, embeds of notes, headings, blocks, images and
  PDFs, callouts, highlights, comments, tags, math, Mermaid and code blocks
  with titles and line marks.
- Videos, tweets and other media embeds, Excalidraw embeds, and Spaced
  Repetition flashcards.
- Dataview queries, canvases and Bases views, run at build time.
- Note pages with metadata, every frontmatter property, a table of contents
  and backlinks; icons and card styles per note type.
- A blog-style home page of index cards pinned on a notebook wall, folder and
  tag pages, an archive by year and a yearly activity calendar.
- Full-text search that ignores diacritics, with folder, type and tag
  filters; local and global graphs; link previews on hover; stacked pages.
- A warm paper design with a notebook look, a main menu, per-folder
  appearance and sidebars that fold away.
- Multilingual sites with Quartz-compatible slugs and any list of languages.
- Configuration in `datme.yaml`, including publishing rules, site logo,
  favicon and robots.
- Password-protected notes, published encrypted.
- RSS feeds per language, `robots.txt`, social preview cards, JSON-LD,
  webmentions, `rel=me` links, analytics, comments and `CNAME`.
- An installable app that reads notes offline, and a print stylesheet.
- Only assets referenced by published notes are copied.
- The `datme` CLI with `dev`, `build`, `preview`, `init`, `check` (broken
  links) and `deploy` (CI configs for GitHub, GitLab, Netlify and
  Cloudflare), running on Bun or Node 23.6+.
- Incremental builds that reuse rendered notes and social cards.
- Published on npm as `@dynamotn/datme`, under CC BY-SA 4.0.
