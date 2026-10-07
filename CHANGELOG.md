# Changelog

All notable changes to datme are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Code blocks of more than one line show a column of line numbers, left out
  when the code is copied. Blocks without a language get it too.
- `` ```base `` code blocks render the base written inside them, every view in
  turn, the way Obsidian shows a base in a note. In a block or an embed,
  `this` is the note holding it, so `file.hasLink(this.file)` lists the notes
  linking there.
- Coloured highlights from Obsidian 1.14: a colour emoji right after the
  opening `==` (🔴 🟠 🟡 🟢 🔵 🟣) paints the highlight in that colour, in both
  themes, the notebook look and print, and the emoji itself is not shown.

### Changed

- Sidenotes in the margin are tied to their line by a dashed leader, and
  pointing at a footnote number picks out its note. In the notebook look they
  stand clear of the page's frame instead of touching it.

### Fixed

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
