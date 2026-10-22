# Changelog

All notable changes to datme are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A `terminal` style (`style: terminal` on a note, or `appearance.style` / `appearance.folders`) draws pages as a TTY: monospace throughout, the title after a `$` prompt with a cursor that blinks unless the reader prefers less motion, section headings after their `##` marks, square dashed boxes. It opens dark, green phosphor on black with faint scanlines, and its light mode is a teletype printout on ruled paper; `theme.accent` changes the phosphor (amber, say) while the text stays readable. The reader's legible-font and high-contrast choices still apply, and it prints on plain white paper.
- A `blueprint` style draws pages as engineering drawings: blue grid paper with white and cyan line work (it opens dark), or white paper ruled in pale blue with blue ink in light mode; titles and headings in Space Mono capitals, numbered sections, square outlined boxes, and every Mermaid, D2, Typst or Excalidraw diagram framed as a drawing sheet with a numbered title block. It prints on white without the grid.
- A `wiki` style makes a garden read like an encyclopedia: dense sans-serif text, serif titles over thin rules, blue links, an infobox floated beside the text with the note's cover (or banner) and its properties, a numbered contents box at the top, and related notes listed under "See also". On a phone the infobox comes first, full width.
- A `broadsheet` style makes a garden read like a newspaper: the home is a front page with a masthead, a date line and the newest note as the lead story, then a section for each top folder; a folder page leads with its newest note; a note names its section above a heavy serif headline, opens on a drop cap and runs in two columns on wide screens. A `stream` folder becomes a page of the paper, its newest note across the top and the others in columns.
- A `herbarium` style, for the whole site (`appearance.style`), a folder or one note (`style: herbarium`): the garden pressed and kept. Each note is a sheet of cream paper held by linen tape, with a label card in its bottom-right corner giving its name, the date it was collected, its stage and the note it was found near (the first that links to it); home, folder and tag pages show the notes as a cabinet of sheets with the garden's stage and tag filters.
- A `manuscript` style for long reading: a narrow text column with a wide right margin where footnotes stand as sidenotes whenever there is room, old-style figures, a drop cap on the first paragraph, each H2 opened like a chapter with a roman numeral, and the parts of a `series` as an open list of chapters.
- A `lacquer` style after Vietnamese lacquer painting (sơn mài): black lacquer with vermilion and gold leaf, a gold rule under each title and a vermilion lozenge before each section. It opens dark unless the reader chose a theme; light mode is eggshell with vermilion and darker gold.
- A `zine` style for the whole site, a folder or one note (`style: zine`): a self-printed zine on grainy photocopy paper. The title is a cut-out strip in a wonky hand, section heads are lettered differently from one another, and quotes, callouts, pictures and code are pasted down at a slight angle in boxes of mismatched colours, some held by tape. Blocks lie straight on a phone and on paper, and cards stop moving for readers who ask for less motion. Readers can pick it from the View menu.
- An `atlas` style: an old atlas on parchment, with contour lines under the page and a compass rose in the corner of each note. Each top folder is a region whose name is lettered above every note and folder in it, and the graph is drawn as a map, notes as towns on land in a pale sea joined by dotted roads.
- A `catalog` style: a library card catalogue. Each note is a typed card with a red rule and a punched hole, filed under a call number made from its folders (`03 Atoms/Code` is `03.ATO · Code`); a folder page is a drawer with its call number on a brass label, its subfolders drawer fronts with their own numbers.
- An `eink` style for reading on electronic paper, and anywhere a calm page helps: greys only, pictures included, no transition or animation at all, large Literata with generous leading, high contrast, links told apart by their underline, and nothing that appears only under a mouse. On a note, "Turn pages" in the View menu lays the text out in pages as tall as the screen: Page Up and Page Down, the arrow keys, a tap on either edge or the buttons under the page turn them, with a "Page 2 of 7" counter. Screen readers and find-in-page still read the note as one text, a link reached with Tab turns to its page, the choice stays in the reader's browser, and it prints as one long page.
- A `paddy` style, the garden as terraced rice fields of the northern hills: same stages, filters and planted and tended wording, but each bed is a slope of fields along their contours, standing on earth banks with water under them, and a note's stage reads as the rice in its field, from seedling (mạ) through young rice and ripening to the golden harvest, each in its colour. Under each title the terraces are mirrored in the water.
- Social cards follow the style of their page: an index card for `notebook`, a quiet page for `classic`, a leafy tile for `garden`, a taped sheet with its label for `herbarium`, mirrored terraces for `paddy`, a phosphor prompt for `terminal`, a drawing with its title block for `blueprint`, gold leaf for `lacquer`, a masthead for `broadsheet`, a sidenote for `manuscript`, film strips for `darkroom`, an e-reader page for `eink`, a taped cut-out strip for `zine`, parchment with contours, a compass and the note's region for `atlas`, and a typed card with its call number for `catalog`; other styles get a plain card in their accent or `theme.accent`.
- `appearance.seasons: true` makes the garden style's colours follow the year, spring, summer, autumn and winter, each in light and dark: chosen from the build date, then turned to the reader's own date when the page opens, so a page cached for weeks still changes with the season. `seasons: { hemisphere: south }` turns them for the southern hemisphere.
- Five more collections for `layout:`. `daily` turns a folder of daily notes into a journal: a year calendar whose days open their note, a small chart (with its numbers as a table) for each property named in `track`, such as mood or sleep, and the latest entries by month. `bookmarks` lists Web Clipper notes as a reading list with each source's site and logo, author, date and your first paragraph as the comment, by unread, read and archived. `people` shows faces (`avatar`, else initials) with role, organisation and links, and a graph of how they link to each other. `snippets` shows each note's first code block, highlighted, with a copy button and a filter by language. `episodes` lists podcast or newsletter issues by season or year with their number, date, duration, guests and an audio player, and publishes a podcast feed (`episodes.xml`) with each `audio` as an enclosure.
- A collection can be grouped by `month`, and by alternatives such as `group: season|year`.
- Five more collections for `layout:`. `courses` lists courses by in progress, planned, completed and dropped, each with its provider, instructor and years, a progress bar (`progress: 45`, `45%` or `3/10`) and a link to its `certificate`, a URL or a file of the vault. `wishlist` shows things to get as cards with their price in the note's language and currency, priority and link, by wanted, bought, gifted and dropped, with what each group costs. `quotebook` gathers every signed quote (`> …` ending in `— Author`) of its notes, by author, by note (`group: source`) or all together, each linking back to its passage; nothing comes from protected notes, locked parts or embeds. `questions` lists the notes tagged `#question`, open ones first and oldest first, answered by `status: answered`, an `answer` property or a link under an *Answers* heading, with the answer linked. `digest` is a weekly digest of the garden: the notes planted and tended each ISO week, newest first, for the last `limit` weeks (8 by default), from git history with `history: true`, with an RSS feed of the weeks (`digest.xml`).
- Eight more page layouts for a note's own text: `paper` (authors, affiliation, venue, DOI and arXiv links, the abstract in a box, two columns on wide screens, and a *Cite this* box with the reference and a BibTeX entry to copy), `decision` (an architecture decision record with a status badge, deciders, sections for context, options, decision and consequences, and a banner pointing to the decision that superseded it), `changelog` (versions with dates and anchors, Keep a Changelog sections as coloured tags, and an RSS feed of the versions at `releases.xml`), `dialogue` (speakers' lines as chat bubbles, a side and a colour per speaker, pictures from `speakers`), `highlights` (Readwise and Kindle highlights as cards with their location and note, under the book's cover and author), `glossary` (terms A–Z with a bar of letters, an anchor per term, and the garden's `type/term` notes), `trip` (a map of the route or the stops, each day with its pictures in a strip) and `syllabus` (numbered lessons with their reading time, or the notes of a series, that readers tick as done to see their progress).
- Seven more page layouts for a note's own text: `poem` (centred verse with its line breaks and indentation, stanzas numbered with `numbered: true`, and with `bilingual: <lang>` the original and a translation from its language blocks side by side, stanza by stanza), `letter` (a sheet of paper with the `place` and `date`, the salutation, and the closing and signature at the foot, the signature in words or a picture from `signature`), `compare` (each `##` an option card with its pros and cons from `✅`/`❌` marks, `+`/`-` items or *Pros*/*Cons* subheadings, a table of every option's `key: value` facts, and the `pick` highlighted), `checklist` (every task a box readers tick, kept in their browser, with the progress of each section and of the whole and a reset button), `recipe-card` (one recipe as an A6 index card, ingredients beside the steps, printed alone on one A6 card), `hub` (a map of content drawn round the note at build time, its sections as spokes and their links as leaves, the sections listed below for screen readers and print) and `lore` (a worldbuilding entity with its properties in an infobox, its `relations` listed and drawn as a small family tree, and the other lore naming it, by relation). A protected note publishes none of a poem's translation, a letter's signature or lore's relations. All seven can be tried from the 🎨 bar of `datme dev`.
- `appearance.tags` in `datme.yaml` gives every note with a tag its own style, e.g. `{ poem: classic, til: notebook }`. Nested tags follow their parent (`poem/haiku` takes the style of `poem` unless it has its own), and the first of a note's tags with a style wins. A note's own `style:` and its layout's still come first, its folder's after; the 🎨 bar of `datme dev` names the tag when it applies and offers the `appearance.tags` line that keeps a preview.
- `appearance.readerSwitch` lets readers restyle the site from the View menu: `true` offers every style that only recolours a page (notebook, classic, garden, terminal, blueprint, manuscript, lacquer, zine, eink, paddy and a theme pack's own), or list the styles to offer. Their pick is kept in their browser, applies before the first paint without a flash of the author's style, and downloads only the chosen style's stylesheet; "As the author set it" goes back. Résumé and gallery pages keep their own style, and so do pages in `broadsheet`, `wiki`, `herbarium`, `atlas` and `catalog`, which lay a page out their own way and cannot be offered.
- `theme.preset` loads a theme pack: a folder of the vault (`.datme/themes/<name>` or a path) or an installed `datme-theme-<name>` package holding a `theme.yaml` (accent, fonts, code, comment and diagram themes, a suggested style) with its stylesheets, fonts and pictures. A pack can add styles of its own, each built on a built-in one, usable anywhere a style is. Values under `theme:` in `datme.yaml` beat the pack's, its own `@font-face` fonts are never fetched from Google Fonts, and anything wrong with it is a warning in `datme check` rather than a failed build. Packs ship CSS only: no script runs and no file outside the pack is published. `examples/themes/datme-theme-ink` is a complete example.
- Theme packs can reshape parts of a page with templates: `templates:` in `theme.yaml` maps a slot (`header-brand`, `note-card`, `note-row`, `note-footer`, `footer-band`) to a `.html` file of the pack, for every page, and `styles.<name>.templates` does the same for the pages of one of its styles. A template is plain HTML with `{{field}}` placeholders from the slot's documented fields, `{{#if}}`, `{{#unless}}` and `{{#each tags}}`; it is given only what datme's own component shows there, so a protected note never lends it an excerpt. A pack's style with templates of its own is not offered by `readerSwitch`. The example Ink pack ships a card for its style.
- `home: bento` turns the home page into a dashboard of tiles under the home note's intro, in any site style: the current `layout: now` note, recently tended notes, a random-note button, the numbers of /stats, a small graph around the most linked note, the newest short notes of the `stream` folders and the most used tags. `home: { note, layout: bento, tiles: [...] }` chooses the tiles and their order; tiles with nothing to show are left out, and the grid falls to one column on phones.
- The 🎨 bar of `datme dev` tries layouts and collections without editing a file: a note or folder page previews any layout, any collection or none (`?layout=books`), a collection can be regrouped by status, year, month, none or any property (`?group=year`), and a folder without a folder note can try a collection of its notes. The bar names where the page's layout and grouping come from, and gives the `layout:` and `group:` lines that keep the preview, or the one to take out.
- `appearance.stages` gives every note at a growth stage its own style, e.g. `{ Inbox: notebook, Notes: manuscript }` with the keys of `stages`, so seedlings can look rough and evergreens like a book page. It comes after `appearance.tags` and before `appearance.folders`; a stage that `stages` does not list is a config error. The 🎨 bar of `datme dev` names the stage when it applies and offers the `appearance.stages` line that keeps a preview.
- `appearance.languages` gives each language of a multilingual garden its own site-wide style, e.g. `{ vi-VN: lacquer, en-US: classic }` (a base such as `vi` covers every `vi-*`). It stands in for `appearance.style` on that language's pages, its home, folder and tag pages included, while `appearance.tags`, `stages` and `folders` still win; the 🎨 bar of `datme dev` names it.
- `appearance.schedule` changes the site-wide style for days of the year, e.g. `[{ style: lacquer, from: "01-20", to: "02-20" }]`; a range may wrap the new year, and the first entry covering the day of the build wins. It replaces only `appearance.style` and `appearance.languages`, so notes styled by their own `style:`, layout, tag, stage or folder keep theirs. The style is chosen at build time: the daily build of the GitHub and Cloudflare pipelines from `datme deploy` switches it on its dates, and the deploy docs show how on GitLab and Netlify. The 🎨 bar of `datme dev` names the entry.
- `datme check` warns when `theme.accent` (light or dark, from `datme.yaml` or a theme pack) fails WCAG AA: below 4.5:1 as text on the ground of a style the site uses, or under the text set on it. Each warning gives the ratio on every ground that fails and a darker or lighter accent of the same hue that passes.
- A theme gallery in the documentation (`docs/themes.md`) shows every built-in style on the same note, in light and dark; `bun run screenshots styles` remakes its pictures.

### Security

- Theme pack templates never run: they are parsed and kept only as allowlisted elements and attributes, so scripts, styles, frames, plugins, forms, `base`, `meta`, SVG, MathML, comments, event handlers, `id`, `data-*` and `srcdoc` are left out; addresses must be relative, http(s) or mailto, also once a field fills them; inline styles that load files or run code are dropped; and every value is escaped in text and attributes. Whatever is left out is a `datme check` warning, never a failed build.

### Fixed

- A code block inside one language's `<!--lang:…-->` block no longer shows on the pages of the other languages.

- `properties.show` in `datme.yaml` lists the only frontmatter keys a note's properties block (and a wiki infobox) may show, so a key added to a note later, such as a phone number, is not published until you list it. `datme check --privacy` suggests it while every key not hidden is shown.

### Security

- PNG, JPEG, WebP and AVIF originals are published without their EXIF, XMP and IPTC metadata, which held the GPS position where a phone took the picture, the device and the time; they are turned upright as their orientation said and keep their colour profile. A picture with no such metadata is copied byte for byte. `images.keepMetadata: true` publishes originals as they are.
- An unlisted note no longer appears in the backlinks of the notes it links to, so its title, URL and the sentence around the link stay with those who have the link.
- A password-protected note no longer publishes its `banner`, `cover` or `avatar`: they were copied to the site, drawn above the locked page and used as its social card. The page now gets the generated card, as for any note without a banner.
- The markdown copies (`llms.txt`, `.md` next to each page) and the history pages read comments the way the page does: a `%%` inside code or math is text, and comments inside a ```` ```tabs ```` block are removed as on the page. Before, such a mark could pair with the start of a real comment, so the comment's words were published there while the code around it was cut.

## [3.1.0] - 2026-10-20

### Added

- `footer` in `datme.yaml` takes columns of links: a heading over a list of entries written like `nav` (built-in pages, notes or URLs, with labels per language). The older `label: URL` pairs still work and share a first column without a heading.

- Under `datme dev`, a 🎨 bar on every page names the rule that chose its style and frame (the note's `style:` or `chrome:`, its layout, `appearance.folders` or `appearance.style`), previews the page in notebook, classic, garden, resume or darkroom and in full or minimal chrome without editing a file, and shows the frontmatter or `datme.yaml` lines that would keep the preview. Built sites never show it.
- A `sidebar` list in `datme.yaml` puts shortcuts at the top of the left sidebar: notes, built-in pages or URLs, written like `nav` entries, with the current one marked.
- Graphs have + and − buttons in their corner, in the sidebar and in the global graph, for readers without a wheel to zoom with.
- Notes chosen by folder or frontmatter can be read aloud in the author's own voice, with one TTS model per language (VieNeu for Vietnamese), its weights pinned to a fixed commit so the voice never changes under cached audio, and a ▶ Listen button at the top of the note.
- `datme doctor` checks that `uv` and `DATME_TTS_VOICE` are in place when `tts` is configured, and `datme deploy` writes the TTS toolchain into the GitHub, GitLab and Cloudflare pipelines: uv and the model files are kept between runs in a `.datme-tts` cache that builds never prune, and the voice clip comes from a GitLab Secure File (named by `DATME_TTS_VOICE_FILE`, `voice.wav` by default) or, on GitHub and Cloudflare, from the base64 `DATME_TTS_VOICE_B64` secret, compressed to Ogg Opus so it fits GitHub's 48 KB limit. A missing or empty clip stops the build, `datme deploy netlify` sets `DATME_TTS=off` so Netlify builds publish without audio and warns about it, and the pipelines pin uv and save the cache even when a long first run fails or times out. `DATME_TTS=off` builds any site without audio.

### Changed

- The footer is a band across the whole page, a shade darker than it: the profiles of `site.me` as logos (GitHub, X, LinkedIn, Mastodon, Bluesky and two dozen more) above the site's name, whose ending gets the accent when it is written like a domain, the `footer` columns beside them under small mono headings, and the copyright, RSS and datme lines along its foot. Pages with the minimal frame keep a single line.
- The header is shorter: the sidebar, stacked-pages and reader-mode toggles join the text-size and font choices in one View menu behind a sliders button, and with several languages the header shows only the current one, the others in a menu under it.

### Fixed

- The copy button of a code block stays in its corner when a long line scrolls the block sideways.
- The search box can be closed on any device: its close button always shows, and a tap on the dimmed page around a dialog closes it.
- A vault with `related.semantic` builds in CI: the pipeline `datme deploy` writes installs transformers.js together with datme, and the docs no longer suggest a `bunx --package` command that never let datme find it.

## [3.0.0] - 2026-10-18

### Added

- The 404 page offers a way back to the page the reader was on, next to
  the home link. The button shows only when the reader arrived from a page of
  the same garden, so a link typed or pasted from outside still sees just
  the home link.
- A gallery (`layout: gallery`, or `style: darkroom` on any note) now shows
  its pictures in rows of equal height across almost the whole page, uncropped,
  on near-black with only neutral greys around them; captions sit under each
  picture, while a base's covers show their titles on hover or focus on
  wide screens with a pointer and stand upright. Galleries start dark unless the reader
  chose a scheme. Album headings are quiet small-caps
  labels, and an enlarged picture opens on pure black. Light mode turns the
  page into an off-white gallery wall.
- A résumé (`layout: cv`, or `style: resume` on any note) now reads as one
  A4 sheet on a grey desk: the photo, name, role and contacts in a narrow
  left column, the summary and sections on the right with their headings in
  the margin, in one column on phones. Dark mode turns the sheet dark grey,
  and printing gives exactly that sheet on white paper, even from dark mode.
- Page layouts pick a fitting look by default: `cv` pages use the resume
  style, `gallery` pages the darkroom style and `links` pages the classic
  one, each in a minimal frame. Timelines, collections, `uses`, `now` and
  `quotes` keep the header and the explorer but drop the table of contents,
  the graph and stacked pages; `faq` keeps the full frame. A note's own
  `style:` and `chrome:` always win, and a folder takes the look of its
  folder note, whether that note sets `style:`/`chrome:` or has a layout.
- The minimal frame keeps only a thin bar with the site's name and the
  light/dark toggle, and a one-line footer: no menu, search, language switch,
  reader menu, sidebars or breadcrumbs, and no highlights or "forget where
  I've been" buttons. Any note can ask for it with `chrome: minimal`, or for the
  full frame with `chrome: full`.
- Notes can set `style:` (`notebook`, `classic`, `garden`, `resume` or
  `darkroom`) and `chrome:` (`full` or `minimal`) in their properties; an
  unknown value is reported as a warning at build time and ignored.
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
- `conventions.ratingScale` sets the highest `rating`, from 2 to 10 (5 by
  default): a vault rating on a 1–7 scale shows seven stars instead of
  having its ratings cut to five.
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

- `datme deploy` pipelines run the datme version that wrote them
  (`bunx @dynamotn/datme@<version>`) on a pinned Bun, so a new release never
  changes a site unasked; on GitHub only the deploy job may write to Pages.
- Unlisted notes are left out of Pagefind search and of Dataview and Bases
  results, like every other list; a note still queries itself with `this`.
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
- Builds are faster, most of all for large vaults: code blocks load only
  the grammars they use, social cards and pages render several at a time,
  and related notes are found without comparing every pair of notes.
- Pages are lighter: each carries only its part of the explorer (the top
  level and the folders holding it, already opened and marked) and loads
  the whole tree once the sidebar shows. Without JavaScript the part still
  links everywhere.
- Pages paint sooner: the monospace font no longer holds up the first
  paint, the print stylesheet loads apart, KaTeX's stylesheet comes only
  with math, and a page loads only its own style's stylesheet.
- The global graph stays responsive with hundreds of notes, and the search
  and graph libraries load only when first used.
- Offline reading keeps a bounded number of scripts and images.
- Note pages no longer download every note's text: the graph, walks and
  random notes read a slim index of titles and links
  (`/static/graph.<lang>.json`), and only search loads the full one. The
  offline app no longer downloads the search index when it installs.
- The global graph lays itself out in the background, so the page stays
  responsive while a graph of a thousand notes settles.
- With `history: true`, builds read the vault's git history in one pass
  instead of once per note, so history pages and `/changes` cost far less.

### Fixed

- A site served under a path, such as a GitHub or GitLab project site
  (`site.url: https://me.github.io/garden/`), now works: links between notes,
  assets, canonical and social URLs, RSS feeds, the sitemap (still without
  unlisted pages and redirects), `llms.txt`, search, the graph, the explorer,
  link previews and offline reading all stay under its path.
- A tag or `permalink` with a `.` or `..` segment no longer breaks the build.
- With `headers: { csp: true }`, Giscus comments load their stylesheet.
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
- Two pages whose URLs differ only in case, such as a note `Archive.md` and
  the built-in archive, or `notes.md` next to a folder `Notes/`, no longer
  overwrite each other on macOS, Windows or a static host: the first keeps
  the URL and `datme check` warns about the page left out.
- A note saved with a UTF-8 byte order mark, as some Windows editors do,
  keeps its frontmatter.
- `datme build --fresh` keeps the notes of neighbour gardens it has just
  fetched and the list of dead links, so links to other gardens still work.
- Links find notes, files and drawings whose names macOS stored in
  decomposed Unicode, as with Vietnamese file names, and those pages get the
  same URL as the name typed in composed form.
- Several builds at once, such as two vaults built side by side, each
  publish their own site instead of mixing their files.
- Dates written without a time, such as `date: 2024-01-01`, count in their
  own year and month on the archive, calendar, stats and timeline pages, also
  west of UTC.
- `datme build` refuses an `--out` it may not replace before building
  instead of after, and a build that fails to copy leaves the previous site
  in place.
- Empty tags, such as `tags: ["", "#"]`, no longer link to the list of tags
  or show as an empty category in the RSS feed.
- `datme dev` notices a folder created at the top of the vault after it
  started, on Windows too.
- The search, graph and other pages reading the note index try again after
  a failed load, such as when briefly offline, instead of staying empty.
- Code blocks served over plain http, where browsers offer no clipboard,
  show no copy button instead of one that fails.
- Builds of a vault outside git no longer print "fatal: not a git
  repository".
- Ignored folders match whatever their case, so a `Templates` folder is
  ignored like the default `templates`.
- On Windows, output inside the vault is left out of the next build, and
  dates come from git history.
- `datme export ./` writes a file named after the vault instead of
  `..epub`.
- A number as title, such as `title: 2024`, is used as the title.
- In the notebook look's dark scheme, the selected search result, its path
  and snippet, and the home page's hero card are readable, and matched words
  stand out in search results.
- Text on accent-coloured buttons (unlock, subscribe, practice, calendar
  days) switches to dark ink when `theme.accent` is a light colour, in each
  colour scheme, instead of staying white.
- The header fits a 320px phone with a language switch: its buttons no
  longer shrink, and on the narrowest screens the random-note button moves
  into the menu drawer.
- The search placeholder stays on one line in a crowded desktop header.
- On narrow phones the home hero title wraps inside its card, and the search
  dialog keeps its field in view and shows a close button on touch screens
  instead of keyboard hints.
- Kanban and task checkboxes, the graph's time slider, series summaries and
  gallery captions are big enough to tap.
- Chip counts, panel titles, folder counts and copy buttons are at least
  12px, and the classic look's muted text meets 4.5:1 contrast.
- The home page's author photo for IndieWeb readers points inside a site
  served under a path, such as `/datme/icon-512.png`.
- Screen readers: search results form a proper list of options, task
  checkboxes are named by their task, a gallery cover no longer adds an
  unnamed link, wide kanban boards and contribution graphs can be scrolled
  with the keyboard, the two sidebars and the two navigations have distinct
  names, note cards under a page title use the next heading level, and chart
  tables no longer have an empty header cell.
- A base formula calling `round()` with digits outside 0–100 rounds to the
  nearest allowed precision instead of crashing the build.
- A new, empty or comment-only `.base` file shows one table of every note
  instead of "invalid YAML".
- A vault whose `datme.yaml` is empty or holds only comments builds with the
  defaults instead of stopping with "Cannot parse", and `datme migrate`
  works on it; an empty ```contributionGraph block shows the plugin's
  default heatmap.
- A note whose frontmatter is empty or holds only comments no longer gets a
  "frontmatter is not valid YAML" warning, and an empty chart block says what
  a chart needs.
- A BibTeX entry without a key, such as `@misc{}`, is skipped instead of being
  cited as `}`.
- In a ```query block, a dash before parentheses negates the whole group, as
  in Obsidian: `meeting -(work meetup)`.
- On the timeline, a `start` or `end` with a month or day of 0, such as
  `1927-00`, is no longer taken as a date.
- `datme check` and the privacy report show the words of an embed of a
  private note as written, without HTML entities.
- Two builds sharing a cache no longer crash when both prune it at once.
- In `datme dev`, a change in a sibling folder whose name starts like the
  vault's (`Notes-archive` next to `Notes`) no longer reloads the page.
- A map with no places and no `center` shows the world instead of failing to
  draw.
- Code no longer shifts the page when the monospace font arrives: until it
  does, code shows in a local monospace sized to match it.
- A note's banner image loads first, so the page shows sooner.
- The graph's time slider shows its date on pages without a language set,
  instead of failing.

### Security

- An Excalidraw drawing can no longer carry markup or scripts into the page
  through its numbers or styles: every field is checked as it is read.
- History pages and `/changes` show links to private notes as the page does,
  and skip versions from before a note was moved out of an ignored or hidden
  folder, or into the vault.
- Link previews refuse addresses on the build machine or a private network,
  and follow at most three redirects, each one checked.
- Canvas link cards only open web and mail addresses.
- `_headers` adds `Strict-Transport-Security` for HTTPS sites and serves the
  vault's SVG, HTML and XML files sandboxed, so a script in one never runs on
  the site's origin.
- `@dynamotn/datme` is published to npm by trusted publishing from GitHub
  Actions, with a provenance attestation and no npm token stored anywhere.
  Pre-releases go to the `next` dist-tag, so `latest` stays on the last
  stable release.

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
