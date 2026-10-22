---
title: "Writing notes"
---
# Writing notes

Write in Obsidian the way you already do. This page covers what datme reads
from a note, and the few extras it adds.

## Obsidian syntax

*Live example: [Callouts and math](showcase/Callouts%20and%20math.md).*

All of this works the same as in the app:

- `[[wikilinks]]`, `[[note#heading|alias]]` and `[[note#^block-id]]`.
- `![[embeds]]` of whole notes, sections, blocks, images, audio, video and
  PDFs, which open at `#page=3` and take `#height=400`.
- Callouts (`> [!tip]`), folded with `> [!tip]-`.
- `==highlights==`, `%%comments%%`, `#tags` and `^block-ids`. A colour emoji
  right after the opening `==` colours the highlight, as in Obsidian 1.14:
  `==🔴Important==`, with 🔴 🟠 🟡 🟢 🔵 🟣. A `^block-id` on a line of its
  own names the list, quote or table above it.
- Tasks of any status, such as `- [?]` or `- [/]`, with the status in a
  `data-task` attribute for themes to style.
- LaTeX (`$…$`, `$$…$$`, which is display math even within a line) and
  Mermaid diagrams. A dollar with a space after it, as in "$5 and $10",
  stays a dollar.
- Standard markdown links to notes and files, with relative paths; a target
  with spaces may go in angle brackets: `[text](<My note.md>)`.

A note named after its folder (`Books/Books.md`) becomes the introduction of
that folder's page.

## Frontmatter

| Key | What it does |
| --- | --- |
| `publish` | `true` to publish the note (see [Privacy](privacy.md)) |
| `title` | Page title, or one value per language: `{ en-US: …, vi-VN: … }` |
| `permalink` | A custom URL, or one per language; the old URL redirects |
| `aliases` | Other names, used to resolve links; each one becomes a redirect |
| `tags` | Tags; `type/…` tags become chips (book, person, recipe…) |
| `created`, `updated` | Dates; without them datme uses the git history, then the file's times |
| `banner` | An image across the top (`banner_x`, `banner_y` from 0 to 1 set its focus) |
| `description` | The excerpt for cards, feeds and search engines |
| `layout` | A page made for what the note holds: `cv`, `gallery`, `projects`, `books`… see [Page layouts](#page-layouts) |
| `style` | The look of this page: `notebook`, `classic`, `garden`, `herbarium`, `paddy`, `manuscript`, `lacquer`, `zine`, `atlas`, `catalog`, `eink`, `terminal`, `blueprint`, `wiki`, `broadsheet`, `resume`, `darkroom` or a style of the theme pack. See [Page layouts](#page-layouts) |
| `chrome` | The frame around the page: `full`, or `minimal` for a thin bar with no menu, search or sidebars |
| `cover` | The picture that stands for the note in a collection and beside its title (a vault file or a URL); the banner otherwise |
| `cssclasses` | Classes added to the note, as in Obsidian |
| `draft`, `publish_date`, `unlisted`, `password` | See [Privacy](privacy.md) |
| `lang` | The language the note is written in, when it isn't the site's default one |
| `lineBreaks` | `true` to keep single line breaks (poems, lyrics) |
| `outdated` | `false` to never say the note may be out of date (see [`outdated`](configuration.md#readers-and-the-social-web)) |
| `series`, `series_order` | See [Series](#series) |
| `start`, `end`, `location` | See [Timeline, map and stats](#timeline-map-and-stats) |

## Code

````markdown
```ts title="app.ts" {2,4-5}
````

This adds a file name and highlights lines 2, 4 and 5. Inline, comments like
`// [!code highlight]`, `[!code ++]`, `[!code --]` and `[!code focus]` mark
single lines. Blocks of more than one line number their lines, and every block
gets a copy button; neither ends up in what you copy.

## Links and media

- A paragraph that is only a pasted URL becomes a card with the page's title,
  description and image. It's read once at build time and cached; set
  `linkPreviews: false` to keep plain links.
- `![](https://…)` embeds YouTube (privacy-enhanced, `t=` kept), Vimeo, tweets
  from twitter.com or x.com, and remote video or audio files. `![Title|640](…)`
  sets the width, as in Obsidian. Printed pages show the link instead.
- `datme check --external` finds links to sites that no longer answer, and
  later builds point those links at their Internet Archive copy.
- `![[talk.mp4#t=1:30]]` starts a video or audio file at 1:30. `#t=90`,
  `#t=1m30s` and a range like `#t=1:30,2:00` work too.
- A `.vtt` or `.srt` file next to a video or audio file, with the same name
  (`talk.vtt`, or `talk.en.vtt` for the English pages), becomes its captions
  and a transcript under the player. Clicking a time plays from there, and the
  line being spoken is marked as it plays. The transcript is searchable.

### Links to other gardens

Name other datme gardens in `datme.yaml`, then link to their notes as you
would to your own, with the garden's name and a colon:

```yaml
neighbours:
  ana: https://garden.ana.dev
```

```markdown
Ana keeps notes on [[ana:Composting]] too, and on [[ana:Roses|her roses]].
```

The link goes to the note on Ana's site, marked 🌿, and hovering it previews
the note when her site allows it (her `.md` copies, `llms: true`). datme finds
the note in her garden's public index, fetched before each build and kept in
the build cache, so a build without a network uses the last copy. `datme
check` warns of a link to a note her garden does not have.

## Footnotes and citations

Footnotes (`[^1]`, or inline as `^[text]`) move into the margin as sidenotes on wide screens, in
reader mode or when both sidebars are hidden, each tied to its line by a
dashed leader. In the `manuscript` style they stand in the margin whenever
the text has room for one. Footnotes that hold lists or code
stay at the end. Hovering a footnote number shows it in a popover.

Citations use Pandoc's syntax: `[@key]`, `[@key, p. 12]`, `[see @a; @b]`, or
`[-@key]` to leave the author out. datme looks them up in the `bibliography`
files of `datme.yaml`, shows them author–date ("Luhmann 1992, p. 12") and
lists the references in APA style at the end of the note. `datme check`
reports keys that aren't in the bibliography.

## Series

Notes that share `series: Name` (or `series: "[[Intro note]]"`) show their
part number, the list of parts, and links to the previous and next part.
`series_order` sets the order; otherwise the creation date does. In the
`manuscript` style the list of parts is open, numbered like the chapters of
a book.

## Trails

A trail is a guided walk through the garden, across folders. Give a note
`trail: true` and list its stops, one list item per stop, each starting with a
link; the rest of the item is what you say about that stop:

```markdown
---
trail: true
---
# First walk

1. [[Zettelkasten]] — where it all starts
2. [[Niklas Luhmann]]: the man behind the slip box
3. [[Writing notes]]
```

The trail's page gets a **Start the trail** button. While a reader walks it,
each stop shows the trail's name, the step (2 / 3), your words for it, and
links to the previous and next stops; `n` and `p` move along. A note can be a
stop on several trails, and readers can leave a trail at any time. Unlike a
[series](#series), a trail leaves its notes untouched.

## Glossary

Notes tagged `type/term` are terms. The first mention of a term (its title or
an alias, as a whole word) in any other note links to it, with a preview on
hover. Links, code and headings are left alone. Set `glossary: false` to turn
this off. A page with `layout: glossary` lists these terms A–Z beside the
ones it defines itself.

## Timeline, map and stats

- Notes with `start` (and `end`) appear on `/timeline`, as do notes tagged as
  events. Dates can be `1927`, `1927-12` or `1927-12-08`, and `-0500` for BCE.
- Notes with `location: [lat, lng]` appear on `/map`.
- `/stats` shows the garden in numbers: notes, words, links, growth by month,
  folders and top tags. Its garden health part tells how connected and fresh
  the garden is: links per note and their trend, orphans and dead ends (as
  `datme check` counts them), notes tended in the last 30, 90 and 365 days,
  and the most linked notes. `stats: { hide: [density, structure, freshness,
  hubs, topics] }` leaves any of them out. With `related.semantic`, it also
  groups the notes into topics, each named after the tag most of its notes
  share, or its most central note; the graph can colour notes by topic too.

Each of these pages exists only when some note qualifies. Protected notes
never show up on them.

## Page layouts

A note with a `layout` property gets a page made for what it holds. It is
still an ordinary note in the vault, and the page leaves out backlinks and
related notes.

Each layout also picks a look and a frame for its page:

| Layout | Style | Frame |
| --- | --- | --- |
| `cv` | `resume` | `minimal` |
| `links` | `classic` | `minimal` |
| `gallery` | `darkroom` | `minimal` |
| `faq`, `decision`, `lore` | the site's | `full` |
| all others | the site's | `full`, without the table of contents, the graph and stacked pages |

The `resume` style is an A4 sheet on a grey desk, in two columns, and prints
as a clean white page even in dark mode. The `darkroom` style is a near-black
gallery wall with pictures in rows of equal height; it starts dark unless the
reader chose a theme, plain captions always show and cover captions appear on
hover or focus on wide screens with a pointer. The `minimal` frame keeps a thin bar with the site's name and
a light/dark toggle, and a one-line footer. The remaining layouts (all but `faq`, `decision` and `lore`) keep the header but
lose the right rail (table of contents and graph) and stacked pages.

Any note can also take one of the site styles for itself, `style: manuscript`
for a long essay say: `herbarium` lays it out as a pressed specimen sheet with
a label card giving the date it was collected (`created`), its stage and the
first note that links to it; `manuscript` is a book page with a wide margin
for its sidenotes, old-style figures, a drop cap and numbered chapters at
each H2; `lacquer` is black lacquer with vermilion and gold leaf, and starts
dark unless the reader chose a theme; `zine` pastes its blocks down at an
angle under tape, in mismatched boxes on grainy photocopy paper; `atlas`
letters the note's region (its top folder) above its title on parchment with
a compass rose; `catalog` types it on a catalogue card under a call number
made from its folders, such as `03.ATO · Code`; `eink` is an e-reader's grey page,
still and in large type, which the reader can turn page by page; `paddy`
plants it in a terraced rice field, its stage the rice from seedling to
golden harvest. See [Look and
navigation](configuration.md#look-and-navigation).

To override, set `style` and `chrome` on the note: `style: notebook` and
`chrome: full` give a `cv` the usual site look. Without them the order is the
note's `style`, then its layout's, then `appearance.tags` (the first of the
note's tags, in the order it lists them, that has a style; `poem/haiku` takes
the style of `poem` unless it has its own), then `appearance.stages` (the
note's growth stage: its `stage` property, else its top folder, as configured
in `stages`), then `appearance.folders` (the longest
matching folder), then the site-wide style: an `appearance.schedule` entry
covering the day of the build, else `appearance.languages` (the style of the
note's language), else `appearance.style`; the frame is the note's `chrome`,
then its layout's, then `full`. An unknown value is reported as a warning at
build time and ignored. Any folder note (not protected) lends its style and frame
to the folder page, whether from its own `style:` and `chrome:` or from its
layout's defaults.

Under `datme dev`, a 🎨 bar in the bottom corner of every page names the rule
that chose its style and frame, and previews the page in any style and either
chrome without touching a file. The preview lives in the address
(`?style=garden&chrome=minimal`), so it can be reloaded or opened beside the
original. While one is on, the bar shows the lines that would keep it: the
note's (or folder note's) frontmatter, or `appearance.tags` (for the tag that
styles the note, else its first), `appearance.stages` (for the note's stage),
`appearance.folders` or `appearance.style`
in `datme.yaml`. Built sites never show the bar and ignore
the address.

On a note or a folder page the bar also names the page's layout and tries
another one: any layout of a note's own text, any collection, or `none` to see
the note without its layout (`?layout=books`). A collection can be regrouped
by status, year, month, none or its layout's default (`?group=year`, or any
property). A folder without a folder note tries collections only, of the
notes in that folder, and the bar gives the frontmatter of the folder note to
create. A previewed layout brings its own style and frame, as it would once
written, and the lines to copy start with `layout:` and `group:`.

### Layouts of a note's own text

- **`cv`**: a résumé. The title is your name, and `role`, `location`,
  `phone`, `email` and `links` (a map of label to URL), plus `cover` for a
  photo, make the head. The text before the first heading is the summary.
  Each `##` section is a row with its heading at the side. A button prints
  the page or saves it as a PDF.
- **`gallery`**: pictures embedded one after another (`![[a.jpg]]`) become
  a grid, and clicking one opens it large. `![[a.jpg|Caption]]` captions a
  picture. Text and headings stay as they are, so each heading can start an
  album.
- **`timeline`**: each `##` heading is a moment on a line down the page (a
  year, a date, a chapter), with its text beside it.
- **`links`**: a page of links, as in a link-in-bio. `cover` is the
  avatar and `description` the line under the title. Every list whose
  items each start with a link becomes a column of buttons; the words after
  a link describe it.
- **`uses`**: what you work with. Every list whose items each start with a
  name in bold (`- **Vim** — my editor`) or a link becomes a grid of cards.
- **`now`**: what you are doing now. The page says when it was last
  updated, and warns readers once that is more than three months ago.
  With `home: bento`, the latest one is a tile of the home page.
- **`faq`**: each `##` heading is a question that opens on its answer.
- **`quotes`**: quotes (`>`) become a wall of cards. A last line starting
  with a dash (`— Ada Lovelace`) is who said it.
- **`paper`**: an academic paper. Under the title come the `authors` (a
  list; wikilinks link to their notes), `affiliation` (or `affiliations`),
  where it appeared (`journal` or `conference`, `volume`, `issue`, `pages`)
  and links to its `doi` and `arxiv` id. A section named *Abstract*, or else
  the text before the first heading, is the abstract, in a box; the rest
  runs in two columns where the page is wide enough. A *Cite this* box gives
  the reference and a BibTeX entry, built from the properties, to copy.
- **`decision`**: an architecture decision record. `status` shows as a
  coloured badge: proposed, accepted, rejected, deprecated or superseded, in
  any usual spelling (`draft`, `approved`, `declined`, `obsolete`,
  `replaced`…); `deciders`, `supersedes` and `superseded-by` (wikilinks)
  follow. Sections named *Context*, *Options* (or *Considered options*),
  *Decision* and *Consequences* each get a look of their own. A decision
  with `superseded-by` (or `status: superseded`) opens with a banner
  pointing to its replacement.
- **`changelog`**: each `##` heading is a version, with an optional date
  (`## 1.2.0 - 2026-10-01`, `## [1.2.0] - 2026-10-01` or `## v1.2.0
  (2026-10-01)`), anchored at `#v1.2.0`. Keep a Changelog's `###` sections
  (*Added*, *Changed*, *Deprecated*, *Removed*, *Fixed*, *Security*) become
  coloured tags. The numbered versions also make an RSS feed at
  `releases.xml` under the page, linked from it.
- **`dialogue`**: an interview, podcast notes or a play. Paragraphs that
  start with a speaker (`**Ada:** …`, `**Ada**: …`, or `Ada: …` once the
  same name opens two paragraphs) become chat bubbles, each speaker on a
  side and in a colour of their own. `speakers` lists the names, or maps
  them to pictures (`speakers: { Ada: ada.jpg }`).
- **`highlights`**: reading notes as Readwise or a Kindle plugin exports
  them. The head shows the book: its `cover`, `author` and `source` (a
  name, or a URL to link). Every quote and every list item becomes a card,
  with its location (`(Location 123)`, `(p. 45)`, `— location: 123`) and
  the note under it: the paragraphs right after a quote, or what a list
  item nests. A *Metadata* section stays as it is.
- **`glossary`**: definitions A–Z. Each `##` or `###` heading, and each
  paragraph starting with a term in bold (`**Term**: what it means`), is a
  term; a heading of a single letter only groups them. A bar of letters
  jumps to each, and every term has an anchor of its own. Notes tagged
  `type/term` that the page does not define are listed too, with their
  `description`, linking to them.
- **`trip`**: a travel journal. Each `##` heading is a day or a stop,
  numbered down the page, with its pictures in a strip. A map at the top
  joins the places of `route` (a list of notes with a `location`, `lat, lng`
  pairs, or `{ name, location }`), or else the stops: a stop is where a line
  of its own says (`📍 35.01, 135.77`), or at the first note it links to
  that has a `location`.
- **`syllabus`**: a course. Each `##` heading is a lesson, numbered, with
  its reading time; a note without them lists the notes of its series
  instead (the notes whose `series` links to it, or the series it names).
  Readers tick lessons as done and see their progress; the ticks stay in
  their browser.
- **`poem`**: verse, centred on the page, each line and its indentation
  kept as written (the line breaks of `lineBreaks: true` come with the
  layout; `lineBreaks: false` turns them off). `numbered: true` numbers the
  stanzas in the margin. With [language blocks](#multilingual-notes),
  `bilingual: vi-VN` shows the page's own text beside that language's,
  stanza by stanza, in two columns (one under the other on a phone); the
  original, the note's `lang`, goes first, and a block both share spans the
  two. On the page of that language itself, the original goes beside it.
- **`letter`**: a letter on a sheet of paper in the site's colours. `place`
  and `date` make the line at the top right; the first paragraph is the
  salutation. `signature` signs it, in words or as a picture of the vault
  (`signature: "[[signature.png]]"`, published like a cover, its ink turned
  light in dark mode), under the last paragraph as the closing. Without it,
  the last line of the last paragraph is the signature and the lines before
  it the closing (`Yours,` then `Ada`); a last paragraph of one line follows
  a short one, six words at most, as the closing. A letter always keeps a
  paragraph of body.
- **`compare`**: options side by side. Each `##` heading is an option, a
  card of its own. Items marked `✅` or `❌` (also `👍`, `👎`, `✔`, `✗`),
  items written with a `+` marker (and `-` ones in the same list), and the
  lists under `### Pros` and `### Cons` (*Advantages*, *Ưu điểm*,
  *Nachteile*…) become two columns, for and against. Lines of `key: value`
  (a paragraph or a list of them, `key:: value` too) fill a table of every
  option at the top, a dash where one says nothing. `pick: Obsidian` (an
  option's name) marks the one chosen, in its card and its column.
- **`checklist`**: every task of the note (`- [ ] …`) becomes a box the
  reader ticks: a packing list, a routine, a launch plan. The ticks stay in
  their browser for that page; each `##` section counts its own, a bar the
  whole, and *Reset* goes back to the boxes as the note ticks them. Tasks a
  query gathers from other notes stay as they are, and so do the tasks of
  every other page.
- **`recipe-card`**: one recipe as an index card the size of A6, lying
  down: its `cover`, `time` and `servings`, and its ingredients (a section
  named so) beside the steps, to tick off. *Print card* prints it alone on
  one A6 card.
- **`hub`**: a map of content drawn round the note: its title in the
  centre, each `##` section a spoke, and the links of each section leaves
  around it (eight at most, the last counting the others). The map is
  drawn when the site is built, as a picture for the eye; the sections
  follow as a list, which is what screen readers, keyboards and paper get.
  A phone shows the list only.
- **`lore`**: a character, place or faction of a world you are building.
  Its properties are boxed beside its text, as in the `wiki` style, with its
  `cover`. `relations` names who it stands with, by relation:
  `relations: { parent: "[[Borin]]", ally: ["[[Cael]]", Mira] }`, or a list
  of `"ally: [[Cael]]"`. They are listed after the text, and parents,
  partners, siblings and children (`parent`, `mother`, `spouse`, `sibling`,
  `child`, `cha`, `mẹ`, `vợ`, `con`…) also make a small family tree. Then
  come the other `lore` notes that name it, by relation (*child of Borin*
  when Borin says `child: [[Aria]]`), and those that only link to it.

A protected note keeps all of this inside its ciphertext: a poem's
translation, a letter's place and signature picture, the relations of lore
(on its own page and on the pages it names) are not published.

### Collections

A collection lists other notes:

- **`projects`**: a card for each, with its `cover`, `description`, the
  years from `start` to `end`, `role`, `stack` (or `tech`), and links from
  `repo`, `url`, `demo` and `links`.
- **`books`**: a shelf of covers, with `author`, `year` and a `rating` out
  of five, or of `conventions.ratingScale`.
- **`movies`**: a shelf of posters, with `director`, `released` (or `year`)
  and a `rating`.
- **`talks`**: a row for each talk, at its `date`, with its `event` (or
  `venue`) and links to its `slides`, `video` and `paper`, grouped by year.
- **`recipes`**: a card for each, with its `cover`, `time` and `servings`,
  grouped by `category`.
- **`places`**: a map of the places with a `location`, over a card for each,
  grouped by `country`.
- **`daily`**: a journal. A calendar of the year marks each day with a
  note (click one to open it), each numeric property named in `track`
  (`track: [mood, sleep, pages]`) is drawn as a small chart over time, with
  its numbers as a table for screen readers and paper, and the latest
  entries (`limit`, 30 by default) follow, grouped by month. A day is the
  note's `date`, else its name in the vault's daily note format, as on
  `/calendar`, or a name starting with `YYYY-MM-DD`. A day keeps its usual
  page, with its links to the days before and after.
- **`bookmarks`**: a reading list of clipped pages, as the Obsidian Web
  Clipper saves them: the site of `source` (or `url`) with its logo, or its
  first letter for a site datme has no logo for (no favicon is fetched),
  then `author`, `published` and the note's own first paragraph as your
  comment. Grouped by `status`: unread, read, archived (`to-read`, `inbox`,
  `later`, `done`, `archive`, …); `group: month` lists them by the month
  they were clipped (their `created` date).
- **`people`**: a grid of faces, from `avatar` (or `cover`), with initials
  for anyone without one, their `role` and `org` (or `company`) and links
  from `website`, `url` and `links`, sorted by name. Below, a graph of how
  the people link to each other, with the same ties as a list.
- **`snippets`**: code snippets or things learned. Each note is a card with
  its first code block, highlighted and with a copy button, and its
  `language` (else the block's) as a badge; buttons above filter the cards
  by language.
- **`episodes`**: a podcast or a newsletter. Each issue is a row with its
  `number` (or `episode`), `date`, `duration`, `guests` and a player for its
  `audio` (a file of the vault or a URL), newest first and grouped by
  `season`, else by year. The collection has a podcast feed next to its
  page (`episodes.xml`), each `audio` as an enclosure that podcast apps can
  play; a sound elsewhere on the web is listed with an unknown length (0).
- **`courses`**: courses you took, take or mean to take, grouped by
  `status`: in progress, planned, completed, dropped (`doing`, `enrolled`,
  `todo`, `finished`, `passed`, `quit`, …). Each row shows its `provider`
  (or `platform`), `instructor` and years (`start`, `end`), a bar of its
  `progress` (`45`, `45%` or `3/10`) and a link to its `certificate`: a URL,
  or a file of the vault (`certificate: "[[cert.pdf]]"`), which is then
  published. A course's own page shows the same bar and link.
- **`wishlist`**: things you would like to get, grouped by `status`:
  wanted, bought, gifted, dropped (`want`, `to-buy`, `got`, `purchased`,
  `gift`, `skipped`, …), each group with what its wishes cost together.
  Each wish is a card with its `price`, written as the note's language
  writes money in its `currency` (an ISO code such as `USD`, else the sign
  in the price, `$12`), its `priority` (`high`, `medium`, `low` or `1`, `2`,
  `3`; the most wanted come first) and its `url`. A bought item can link to
  where it is in use, such as your `uses` page, with an ordinary link.
- **`quotebook`**: every quote of the listed notes, on one page. A quote is
  a `>` blockquote whose last line names who said it (`— Ada Lovelace`), as
  in the `quotes` layout; unsigned quotes are left out. Quotes are grouped
  by who said them (`group: author`, the default, A–Z), by the note they
  are in (`group: source`) or not at all (`group: none`), and each links
  back to its passage: to its block id when it has one (a `^id` line after
  it), else to its first words with a text fragment. Quotes a note embeds
  from another, in a protected note or in a locked part are never
  gathered. The quoted notes keep their usual page.
- **`questions`**: open questions. Lists the notes tagged `#question` (or
  those of `from`), open ones first, the oldest first. A question is
  answered by `status: answered` (or `resolved`, `solved`, `closed`…), by
  an `answer` property (a note, a URL or a few words), or by a link to a
  note in a section named *Answers*; the answer is linked from the list and
  from the question's own page. An answer that is unlisted, a draft or
  protected still answers it, without being named.
- **`digest`**: a weekly digest of the garden. Each ISO week, newest first,
  lists the notes planted (created) and tended (updated) in it, for the
  last `limit` weeks (8 by default). It covers the whole garden, or the
  folders and `#tags` of `from`. With `history: true`, and `history` on for
  the site, every public version from git counts and links to its history
  page, as on the changes page. The weeks also make an RSS feed at
  `digest.xml` next to the page, linked from it.
- **`shelf`**: a shelf of anything else: games, records, podcasts. Name its
  statuses and the properties to show under each title:

```markdown
---
layout: shelf
from: "#game"
statuses:
  playing: { en-US: Playing, vi-VN: Đang chơi }
  backlog: Backlog
fields: [platform, year]
---
```

A collection lists the notes in its note's folder, or the folders and
`#tags` given in `from` (questions and digests have the defaults above). Projects, books and movies are grouped by
`status`: projects go in progress, planned, paused, done, archived; books
go reading, to read, read, abandoned; movies go watching, to watch,
watched, abandoned. Usual spellings of each status count (`ongoing`,
`completed`, `want-to-read`, `dnf`, `watchlist`, `seen`, …). Any other
status gets its own group after these, and notes without one come last.
`group` picks another property to group by, `year`, `month`, or `none`
(alternatives joined by `|`, such as `season|year`), and `fields` the
properties shown under each title.

```markdown
---
tags: [book]
status: read
author: "[[Cal Newport]]"
rating: 4
cover: deep-work.jpg
---
```

When a collection's note embeds a base (`![[Reading.base]]`, a view of one,
or a ```` ```base ```` block), it lists what the base finds instead, in the
base's order and under its `groupBy` groups, and the base's own table is
left out. In a `gallery`, a base shows the covers of the notes it finds; in
a `timeline`, those notes at their dates.

A note listed by a collection shows its `cover` beside its title, with what
it is (author, years, date and event…), its status, rating and links. A
person's page shows their face round, an episode's its player, a course's
its progress and certificate, and a question's whether it is answered. A
recipe's page puts its ingredients (a section named *Ingredients* or
*Nguyên liệu*) beside its steps, each one to tick off. Any note with a
`cover` gets the same head.

A folder note with a `layout` lays out its folder's page as well:
`Projects/Projects.md` with `layout: projects` turns `/Projects` into the
projects page.

## Poems and lyrics

Markdown joins lines that have no blank line between them. To keep single line
breaks, as Obsidian does, set `lineBreaks: true` in a note's frontmatter, or
turn it on for whole note types or folders with `lineBreaks` in `datme.yaml`.
The [`poem` layout](#layouts-of-a-notes-own-text) keeps them on its own, with
the indentation of each line, and can show a translation beside the poem.

## Multilingual notes

One note can hold several languages. Wrap each language's part in a marker,
and close with `<!--lang:*-->`:

```markdown
---
title:
  vi-VN: Hộp phiếu
  en-US: The slip box
---
<!--lang:vi-VN-->
Hộp phiếu là…
<!--lang:en-US-->
The slip box is…
<!--lang:*-->
Text for every language.
```

The first language in `languages` is served at `/`, and the others under
`/<lang>/`. Put `lang: en-US` in the frontmatter of a note written in a
language other than the default one. Locked parts use the same kind of
markers; see [Privacy](privacy.md#locked-parts).

A note with no text for some language is shown there in its fallback language,
with a notice: the blocks of that language replace the missing ones, and the
shared text stays. The fallback is the note's original language unless its
frontmatter says otherwise:

```yaml
fallback_lang: en-US   # show English where a translation is missing
fallback_lang: none    # show only the shared text instead
```

A block counts as a translation only when it holds real text: blank lines,
headings, comments and empty list items such as `- [ ]` alone don't count, so a
block a template filled with headings still falls back. The
[Lang Blocks](https://github.com/dynamotn/obsidian-lang-blocks) Obsidian plugin
follows the same rules, so a note reads the same in Obsidian and on the site.

## Feeds

Every folder and tag has its own RSS feed (`/Books/index.xml`,
`/tags/book/index.xml`), linked from its page. `/recent` lists the notes
planted or watered lately.
