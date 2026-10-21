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
| `style` | The look of this page: `notebook`, `classic`, `garden`, `herbarium`, `manuscript`, `lacquer`, `terminal`, `blueprint`, `wiki`, `broadsheet`, `resume` or `darkroom`. See [Page layouts](#page-layouts) |
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
this off.

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
| `faq` | the site's | `full` |
| all others | the site's | `full`, without the table of contents, the graph and stacked pages |

The `resume` style is an A4 sheet on a grey desk, in two columns, and prints
as a clean white page even in dark mode. The `darkroom` style is a near-black
gallery wall with pictures in rows of equal height; it starts dark unless the
reader chose a theme, plain captions always show and cover captions appear on
hover or focus on wide screens with a pointer. The `minimal` frame keeps a thin bar with the site's name and
a light/dark toggle, and a one-line footer. The remaining layouts (all but `faq`) keep the header but
lose the right rail (table of contents and graph) and stacked pages.

Any note can also take one of the site styles for itself, `style: manuscript`
for a long essay say: `herbarium` lays it out as a pressed specimen sheet with
a label card giving the date it was collected (`created`), its stage and the
first note that links to it; `manuscript` is a book page with a wide margin
for its sidenotes, old-style figures, a drop cap and numbered chapters at
each H2; `lacquer` is black lacquer with vermilion and gold leaf, and starts
dark unless the reader chose a theme. See [Look and
navigation](configuration.md#look-and-navigation).

To override, set `style` and `chrome` on the note: `style: notebook` and
`chrome: full` give a `cv` the usual site look. Without them the order is the
note's `style`, then its layout's, then `appearance.folders` (the longest
matching folder), then `appearance.style`; the frame is the note's `chrome`,
then its layout's, then `full`. An unknown value is reported as a warning at
build time and ignored. Any folder note (not protected) lends its style and frame
to the folder page, whether from its own `style:` and `chrome:` or from its
layout's defaults.

Under `datme dev`, a 🎨 bar in the bottom corner of every page names the rule
that chose its style and frame, and previews the page in any style and either
chrome without touching a file. The preview lives in the address
(`?style=garden&chrome=minimal`), so it can be reloaded or opened beside the
original. While one is on, the bar shows the lines that would keep it: the
note's (or folder note's) frontmatter, or `appearance.folders` /
`appearance.style` in `datme.yaml`. Built sites never show the bar and ignore
the address.

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
- **`faq`**: each `##` heading is a question that opens on its answer.
- **`quotes`**: quotes (`>`) become a wall of cards. A last line starting
  with a dash (`— Ada Lovelace`) is who said it.

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
`#tags` given in `from`. Projects, books and movies are grouped by
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
person's page shows their face round, and an episode's its player. A
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
