# Changelog

All notable changes to datme are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Page layouts pick a fitting style by default: `cv` pages use the resume
  style, `gallery` pages the darkroom style and `links` pages the classic
  one, and a note's own `style:` still wins. A folder whose folder note has
  a layout takes that look too.
- Notes can set `style:` (`notebook`, `classic`, `garden`, `resume` or
  `darkroom`) and `chrome:` (`full` or `minimal`) in their properties; an
  unknown value is reported as a warning and the note keeps its usual look.
- A third look, `appearance.style: garden`, makes the site feel like a
  garden rather than a blog: warm cream paper (a deep green night in dark
  mode), moss and earth colours, Fraunces headings and Literata text. The
  home opens on the notes tended most recently, then the maps of content as
  paths in, then every note as a tile in a bed, larger and greener as it
  matures; folder and tag pages are beds too. `theme.accent` and
  `theme.fonts` still override its colours and fonts, and it prints like
  `classic`.
- Readers can filter a garden bed by stage (or folder) and by tag, and the
  home shows its first 60 tiles until they choose to walk the whole garden.
- In the garden style, a note says when it was planted and last tended, and
  its backlinks and related notes read as "paths from here" and "nearby",
  each marked with the stage of the note it leads to.
- `appearance.folders` gives a folder its own style, subfolders included,
  for example `Writing: classic` on a notebook site. The starter config of
  `datme init` lists the styles and has a place for it.
- Notes can take a page layout with `layout`. `cv` makes a printable résumé
  from the note, `gallery` turns its pictures into a grid, `timeline` puts
  its sections on a line down the page, `links` makes a link-in-bio page of
  buttons, `uses` a grid of the tools you use, `now` a now page that warns
  when it grows old, `faq` questions that open on their answers, and
  `quotes` a wall of quotes.
- Collection layouts list the notes of a folder or tag: `projects` as
  cards, `books`, `movies` and `shelf` as shelves of covers, `talks` by
  year, `recipes` by category and `places` on a map. When the note embeds
  a base, they list what the base finds, in its order and groups. `shelf`
  takes its own statuses and fields.
- A note listed by a collection, or with a `cover` property, shows its cover
  beside its title with its author or years, status, rating and links. A
  recipe's ingredients sit beside its steps, each one to tick off.
- Each note has a 📄 Markdown menu: copy the note as markdown, open its
  markdown copy, or ask ChatGPT or Claude to read it. `askAi` picks the
  assistants, or `[]` for none; they need `site.url`.
- `/llms-full.txt` holds the markdown of every public note in one file, each
  after the URL of its page, and `/llms.txt` links to it.
- `outdated: { after: <years> }` tells readers when a note has not been
  updated for that long. The browser checks again, so a site that is not
  rebuilt still warns. Home and daily notes never get it; `outdated: false`
  opts a note out.
- Notes not tended for `outdated.after` years carry a ⏳ on their cards and
  rows in lists, too.
- Search filters notes by when they were last tended (the last 30 days, the
  last year, or longer ago), and by stage when notes set their own `stage`.
  The graph filters by stage and colours notes by stage or freshness.
- `/stats` shows the garden's health: links per note and their trend,
  the share of orphan and dead-end notes, notes tended in the last 30, 90
  and 365 days, and the most linked notes. `stats.hide` leaves any of them
  out.
- `/practice` gathers the flashcards of every deck in one session, due
  cards first, filtered by deck or tag, and `practice` can go in `nav`. Once
  a reader has practised, a 🧠 badge in the header counts the cards due.
- The garden can be followed from Mastodon and the fediverse:
  `activitypub: bridgy` hands it to Bridgy Fed, and `activitypub: { username }`
  publishes a static WebFinger, actor and outbox. Notes and the home page
  carry microformats (`h-entry`, `h-card`).
- `neighbours` names other datme gardens, and `[[name:Note]]` links to a
  note of one of them, found in its public index and previewed on hover when
  that garden allows it. `datme check` warns of a note the garden lacks.
- With `related.semantic`, notes are grouped into topics by what they are
  about: the graph colours them by topic and `/stats` lists each topic with
  its notes. `topics` sets how many, or turns them off.
- Readers can highlight passages of a note, add their own words, and export
  every highlight as Markdown for their vault, each with a link back to the
  passage. Highlights stay in their browser and find their words again after
  the author edits the note.
- `datme mcp` serves the published notes to AI assistants over the Model
  Context Protocol: search, read a note, its backlinks and related notes,
  each answer with the note's public URL to cite.
- Readers leave footprints in their own browser: the home page offers to
  continue the note they were reading, where they stopped, and the graph
  colours the notes they visited. "Forget where I've been" in the reader menu
  clears them.
- "Walk from here to…" finds the shortest chain of links from a note to
  another and guides the reader along it like a trail, with `n` and `p`,
  and a link to share the walk.
- Other sites can embed a card of a public note: each one announces an
  oEmbed description, and its card lives at `<note>/embed`. `oembed: false`
  turns it off; it needs `site.url`.
- `datme migrate publish|digital-garden|quartz` lists what switching from
  Obsidian Publish, the Digital Garden plugin or Quartz changes: frontmatter
  keys renamed in place, settings for `datme.yaml`. `--write` applies it.
- With `history: true`, `/changes` shows each change to a note, grouped by
  week, with the paragraphs that grew and were cut, leaving typo fixes out.
  `/changes.xml` and a `changes.xml` per folder and tag announce them.
- `appearance.stream` lists folders of short notes whose page shows each
  note in full, newest first, like a feed, instead of as cards.
- A note's stage can be set with a `stage` property naming a configured
  stage, for vaults that do not sort notes into a folder per stage. It
  wins over the folder, and the home page counts it under that stage.
- Inline footnotes, `^[text]`, render as footnotes and sidenotes.
- Tasks of any status (`- [?]`, `- [/]`, `- [-]`, …) render as tasks, their
  status in `data-task` for themes to style.
- A `^block-id` on a line of its own names the list, quote or table above
  it, so links to it and embeds of it work.
- PDF embeds open at `#page=N` and take their height from `#height=N`.
- Bases show `map` views like Obsidian's Maps plugin: a marker per note at
  its coordinates, coloured and with an icon from its properties, and a
  popup of the view's properties.
- Bases show the Notion-style views of the Extended Base plugin: table,
  list, board (a column per `groupBy` value) and feed (each note in full),
  with coloured pills and note icons.

### Changed

- datme's links (the footer credit, the starter `datme.yaml`, the docs and
  the package) point to its new home, gitlab.com/dynamo-brain/datme.
- A folder listed in `appearance.classic` now shows its own page in that style
  too, not only its notes.
- The browser's theme colour follows the page's style.
- A flashcard keeps its id, and the reader's progress, whatever scripts
  changed on its page (popovers, copy buttons, revealed clozes) and on any
  device. Progress saved under the former ids carries over.
- The interface speaks French, German, Spanish, Japanese and Chinese
  out of the box, besides English and Vietnamese. The built-in texts moved to
  one file per language in `src/i18n`, so adding a language is one file.
- Every section of the home note is shown on the home page: sections
  holding a plain table are no longer dropped.
- The classic home page lists the top-level folders when no stages are
  configured, as the notebook one does, instead of an empty garden.
- Stage presets fall back to their English label in languages other than
  English and Vietnamese, instead of the Vietnamese one.
- Stages follow the Zettelkasten: the only presets are `fleeting`,
  `literature` and `permanent`. Any other text is a stage of the vault's own
  with that label, so `atomic`, `structure`, `reference` and `project` now
  show as written, with a generic icon; give them `{ icon, label }` to keep
  the old look. A stage's icon and label can each be left out, the label
  then being the folder's name.
- A line that starts with an HTML comment is raw HTML, as in CommonMark:
  write the text after it on a line of its own to have it rendered as
  markdown.
- An HTML comment loses its words but keeps its place, as an empty
  comment, so it still separates two lists or ends a block, as in
  CommonMark. Text right after a comment on the same line now stays raw
  HTML, as CommonMark reads it.
- Wikilinks read as Obsidian shows them: `[[Note.md]]` as "Note",
  `[[Note#Part]]` as "Note > Part", and `[[Note|]]` as "Note" instead of an
  empty link.

### Fixed

- In the notebook look, two headings in a row with no text between them
  stay on separate lines instead of running into one line.
- Markdown links with the target in angle brackets, `[text](<My note.md>)`,
  resolve to the note or file instead of breaking the rest of the page.
- An encoded heading in a markdown link (`Note.md#My%20part`) links to that
  heading.
- `\==text\==` and `\[[text]]` stay as written instead of turning into a
  highlight or a link, and a highlight may hold a single `=`.
- An embed on a line next to other text no longer puts a block inside a
  paragraph.
- An image, PDF or player with a transcript embedded alone on its line no
  longer turns the line right after it into raw text.
- `$$x$$` within a line renders as display math, as in Obsidian.
- Dollars read as Obsidian reads them: "$5 and $10" stays text, and
  `^[`, `==` or `#` inside `$…$` math no longer turn into a footnote, a
  highlight or a tag.
- A link to a heading, `[text](#part)`, no longer turns `#part` into a tag.
- Indented code blocks keep wikilinks, tags and highlights as written.
- A `$` inside raw HTML, such as a `<pre>` block, shows as a dollar instead
  of `\$`.
- A footnote keeps its space before the link back to its reference.
- A note embedded twice, or embedding a heading the page also has, no longer
  repeats an id on the page: links, footnotes and block ids of each embed
  point inside that embed.
- Plain CommonMark and GFM render as the specs say, checked against every
  example of both:
  - indented code blocks stay as written, without links, tags or
    highlights made inside them;
  - `[text](#heading)` links to the heading instead of turning `#heading`
    into a tag;
  - a `$` in raw HTML no longer shows as `\$`;
  - an HTML comment keeps its place without its words, so `<!-- -->`
    still separates two lists, and `<!-->` counts as a whole comment.
- The space before a footnote's ↩ link is kept.

## [2.2.2] - 2026-10-16

### Fixed

- CI & tests suite

## [2.2.1] - 2026-10-16

### Fixed

- On a phone the header fits on one line: the logo no longer covers the
  search button, and the language switch no longer sticks out past the
  screen and makes every page scroll sideways.
- On a phone or a narrow window the footer ends the page, after the related
  notes and the graph, instead of sitting between the note and them.
- In Safari before iOS 18 and macOS Sequoia, the header and the backdrop of
  dialogs are blurred again, instead of letting the page show through, and
  text that should not be selectable is not.
- On iPhone and iPad, the menu drawer, the search and graph dialogs and
  other full-height panels fit the visible screen, instead of running under
  Safari's toolbar where their last items could not be reached.
- On iPhone and iPad, tapping a filter or another field no longer zooms the
  page in: fields are at least 16px on touch screens.
- On a phone the global graph's title, filters and close button fit the
  dialog, on two lines, instead of being squeezed and cut off at the edge.
- A long property value, such as a URL in a book note, wraps inside the
  properties box instead of making the whole page scroll sideways on a
  phone.
- On iPhones with iOS older than 16.2, the header, highlights and other
  tinted backgrounds keep a colour instead of losing it and letting the page
  show through: each mixed colour has a plain one to fall back on.
- On iPhone, iPad and in Safari, slides of a Marp deck stay inside their
  frame instead of spilling past it and off the right edge of the screen:
  Marp's WebKit polyfill now runs on every deck.
- On a touch screen a tapped button, card or link no longer stays
  highlighted as if the pointer were still on it, and the copy button of a
  code block is always shown instead of hidden yet still tappable.

## [2.2.0] - 2026-10-16

### Added

- The global graph has a 3D view: notes are laid out in space, which turns
  slowly by itself until dragged (and stays still for readers who prefer less
  motion); scroll zooms, and nearer notes are drawn larger and brighter.
  Readers' choice is remembered, and `graph: { view: 3d }` opens it that way.

- The local graph of a note can show its own links or, one click away, the
  links of those notes too; notes two links away are drawn fainter. Readers'
  choice is remembered, and `graph: { depth: 1 | 2 }` sets the default. The
  local graph no longer switches between one and two links by itself.
- An untranslated note falls back to another language instead of showing only
  its shared text: its page in that language shows the blocks of the note's
  original language, or of the one named by `fallback_lang` in its
  frontmatter, with the untranslated notice; `fallback_lang: none` keeps only
  the shared text. The `.md` copy for language models, Dataview fields and the
  note's history fall back the same way.

### Changed

- A language counts as translated only when its block holds real text, not
  just a `<!--lang:xx-->` marker: a block a template filled with headings or
  empty list items is untranslated, so the page falls back and the language is
  left out of `hreflang`.
- The Obsidian companion plugin lives in its own repository,
  [obsidian-datme](https://github.com/dynamotn/obsidian-datme), with its own
  releases.
- Links written with part of a path, such as `[[folder/Note]]`, are
  resolved without scanning every note, which made large vaults with many
  such links to unpublished notes slow to load.
- The local graph fetches its data only when it scrolls into view, so
  opening a note no longer downloads the whole search index up front.
- Dataview and Bases queries look links up through an index and parse each
  expression once, so their cost grows with the number of notes rather than
  with its square.
- Finding unlinked mentions skips notes that lack a word of the name, about
  five times faster on a vault of 2,000 notes.
- A note's history reads each version from git once, not once per language.
- Building a large vault spends less time looking up the Iconize icons of
  the explorer, which every page shows.

### Fixed

- Esc closes the search dialog, even with text typed in the search
  field, instead of only clearing it.
- A build no longer hangs when two notes embed each other and both are
  embedded elsewhere.
- A link or embed whose name holds a `%`, such as `[[The 50% rule]]`, no
  longer stops `build`, `check` and `dev` with a URIError.
- A note whose name ends in "index", such as `z-index` or `reindex`, keeps
  its whole URL instead of losing that ending.
- A lone backtick, as in "press the ` key", no longer turns the links and
  tags of the following paragraphs into plain text.
- Language and lock markers inside a `~~~` code block are left alone, and
  ```` ``` ```` in the middle of a line no longer counts as a code block, so
  neither hides or shows the wrong language's text.
- Two spaces at the end of a line break the line again, as in Obsidian;
  they were being trimmed away.
- The line shown with a backlink is the one holding the link, with its
  inline code, instead of an empty or neighbouring line for markdown links.
- Bases understand `filter()`, `map()` and `replace()`, so formulas such as
  `file.tags.filter(value.startsWith("x/")).map(value.replace("x/", ""))`
  render instead of failing with an unknown method.
- A `<!--lang:xx-->` marker quoted inside a line, as in inline code or a
  table, is shown as text instead of starting a language block, which hid
  the rest of the note, footnotes included. A marker now has to sit alone on
  its line; one inside a quote or a callout no longer counts.
- A drawing whose text holds markdown such as `` `code` ``, `*stars*` or
  `$` signs is drawn whole, instead of falling apart into loose text on the
  page. Formulas in a drawing keep their TeX, and web or email addresses in
  its text no longer become links the drawing never had.
- An image that cannot be decoded, such as a half-synced photo, no longer
  stops the build: it is served as it is, with a warning.
- Search results always match what is typed: a slower answer to an earlier
  query or filter no longer replaces them.
- Screen readers announce the search result chosen with the arrow keys.
- A damaged list of open folders in the browser's storage no longer stops
  the rest of the page's scripts, such as the table of contents, popovers
  and the graph.
- A canvas with an odd card, such as a link without a scheme or a text card
  holding no text, no longer stops the build.
- A damaged encrypted part reads as a wrong password instead of leaving the
  unlock button stuck.
- The j, k and r shortcuts work on pages whose address holds a stray %.
- Dataview reads `date(2024-01-05)` written without quotes as that date, not
  as 2024 minus 1 minus 5.
- Dates without a time keep their own day whatever the time zone of the
  build: `date(today)` matches a note due today, and a date no longer shows
  as the day before west of UTC.
- A `.base` file with a mistake, such as `order` given without a list, shows
  an error instead of stopping the build.
- Dataview `GROUP BY` followed by `FLATTEN rows` or by a second `GROUP BY`
  works instead of stopping the build.
- Dataview `FROM #tag` and Bases `hasTag()` match tags whatever their case,
  as Obsidian does.
- Bases read a property whose name holds a space with `note["due date"]`.
- `--site` (or `DATME_SITE_URL`) without its `https://` is reported as a
  config error instead of crashing the build later on.
- `unlisted: "true"`, quoted, unlists a note, as a quoted `publish` or
  `draft` already counted; it was ignored, leaving the note listed
  everywhere.

### Security

- A canvas or base linked only from a password-protected note is no longer
  published as a page of its own, where its text was readable without the
  password.
- A page embedding a note with locked parts is rendered afresh on every
  build, so a changed locked part or a rotated password reaches it instead of
  the old ciphertext staying in the build cache.
- With stacked columns turned on, a `?stack=` address only opens pages of
  the site itself: a crafted link could run a script or pull in another
  site's page.
- Unlisted notes, drafts, alias redirects and history pages are left out of
  the sitemap, and unlisted notes ask search engines not to index them.
- The `.md` copies of notes follow `privateLinks`: a link to a private note
  shows what the page shows, not the private note's name.
- A note's history no longer shows the versions written before its
  `publish_date`.
- `DATME_CACHE` pointing at a directory datme did not fill, such as the
  vault or `~/.cache`, stops the build instead of having its files deleted
  by the cache pruning or by `--fresh`.
- Encrypted content only takes in files of the vault: an `/assets/` address
  leading above the vault or into a hidden folder such as `.git` is left as
  it is.

## [2.1.0] - 2026-10-10

- `datme doctor` checks the machine and the vault before a build: the Bun or
  Node version, the optional packages the published notes need, git, the
  `DATME_LOCK_…` variables of group passwords (names only, never values) and
  `site.url`, each with the command that fixes it.

- The Obsidian plugin has a garden dashboard: counts of published, unlisted,
  private, draft and scheduled notes (with the dates of the scheduled ones),
  the problems of the last check and how old it is, and links to the site and
  to the current note on it. It works on phones too.

- The Obsidian plugin runs on phones and tablets. There it shows and flips
  whether a note is published, from the note's menu as well, and shows the
  last check report, which each check on a computer (or CI) saves in
  `.datme/check.json`.

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

- datme and its Obsidian plugin are now licensed under the Mozilla Public
  License 2.0 instead of CC BY-SA 4.0: a license written for software, with a
  patent grant, that asks only for changes to datme's own files to be shared
  back and leaves a garden's notes and other files free. Releases up to 2.0.1
  keep CC BY-SA 4.0.
- Notes that embed others or run queries are cached between builds as well,
  and rendered again only when what they read changes: the embedded notes, or
  the pages a query can see (just its folders and tags, for a Dataview `FROM`
  that names only those). Queries reading `today` are rendered again each day.
  `datme build --verbose` reports how many notes came from the cache.
- Sidenotes in the margin are tied to their line by a dashed leader, and
  pointing at a footnote number picks out its note. In the notebook look they
  stand clear of the page's frame instead of touching it.

### Fixed

- Note counts of stages on the home page, and of folders in the explorer,
  filters, folder pages and stats, no longer count the folder note that
  introduces a folder as one of its notes.
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
