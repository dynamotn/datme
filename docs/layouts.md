---
title: "Page layouts"
---
# Page layouts

A note with a `layout` property gets a page made for what it holds. It is
still an ordinary note in the vault, and the page leaves out backlinks and
related notes. There are two kinds:

- [Layouts of a note's own text](layouts-text.md) lay out the note itself:
  a résumé, a gallery, a letter.
- [Collections](collections.md) list other notes: a shelf of books, a map of
  places, a journal.

Each one below links to its properties, an example and a screenshot. The
[Theme gallery](themes.md) shows the styles a page can take; [Writing
notes](writing.md#page-layouts) explains how `layout`, `style` and `chrome`
decide together.

## Style and frame

Each layout also picks a look and a frame for its page:

| Layout | Style | Frame |
| --- | --- | --- |
| `cv` | `resume` | `minimal` |
| `links` | `classic` | `minimal` |
| `gallery` | `darkroom` | `minimal` |
| `faq`, `decision`, `lore` | the site's | `full` |
| all others | the site's | `full`, without the table of contents, the graph and stacked pages |

The `resume` style is an A4 sheet on a grey desk, in two columns, and prints
as a clean white page even in dark mode. The `darkroom` style is a
near-black gallery wall with pictures in rows of equal height; it starts
dark unless the reader chose a theme, plain captions always show and cover
captions appear on hover or focus on wide screens with a pointer. The
`minimal` frame keeps a thin bar with the site's name and a light/dark
toggle, and a one-line footer. The remaining layouts (all but `faq`,
`decision` and `lore`) keep the header but lose the right rail (table of
contents and graph) and stacked pages.

A note's own `style` and `chrome` win over its layout's: `style: notebook`
and `chrome: full` give a `cv` the usual site look. Any folder note (not
protected) lends its style and frame to the folder page, whether from its
own `style:` and `chrome:` or from its layout's defaults.

## Layouts of a note's own text

| Layout | What it makes |
| --- | --- |
| [`cv`](layouts-text.md#cv) | A résumé with a head of contact details, printable as a PDF |
| [`gallery`](layouts-text.md#gallery) | A grid of pictures that open large, in albums |
| [`timeline`](layouts-text.md#timeline) | Each heading a moment on a line down the page |
| [`links`](layouts-text.md#links) | A link-in-bio page of buttons |
| [`uses`](layouts-text.md#uses) | A grid of cards for what you work with |
| [`now`](layouts-text.md#now) | What you are doing now, and when you said so |
| [`faq`](layouts-text.md#faq) | Questions that open on their answers |
| [`quotes`](layouts-text.md#quotes) | A wall of quote cards |
| [`paper`](layouts-text.md#paper) | An academic paper with its abstract and a citation to copy |
| [`decision`](layouts-text.md#decision) | An architecture decision record with a status badge |
| [`changelog`](layouts-text.md#changelog) | Versions with dates, tagged sections and a feed |
| [`dialogue`](layouts-text.md#dialogue) | An interview as chat bubbles |
| [`highlights`](layouts-text.md#highlights) | Reading highlights as cards, under the book |
| [`glossary`](layouts-text.md#glossary) | Definitions A–Z with a bar of letters |
| [`trip`](layouts-text.md#trip) | A travel journal with a map of the stops |
| [`syllabus`](layouts-text.md#syllabus) | Numbered lessons readers tick off |
| [`poem`](layouts-text.md#poem) | Centred verse, with a translation beside it |
| [`letter`](layouts-text.md#letter) | A letter on a sheet of paper, signed |
| [`compare`](layouts-text.md#compare) | Options side by side, for and against |
| [`checklist`](layouts-text.md#checklist) | Tasks readers tick, section by section |
| [`recipe-card`](layouts-text.md#recipe-card) | One recipe as a printable A6 card |
| [`hub`](layouts-text.md#hub) | A map of content drawn round the note |
| [`lore`](layouts-text.md#lore) | A character or place of a made-up world, with its relations |

## Collections

| Layout | What it lists |
| --- | --- |
| [`projects`](collections.md#projects) | Projects as cards with their years, stack and links |
| [`books`](collections.md#books) | A shelf of book covers with ratings |
| [`movies`](collections.md#movies) | A shelf of posters |
| [`talks`](collections.md#talks) | Talks by year, with slides and video |
| [`recipes`](collections.md#recipes) | Recipe cards by category |
| [`places`](collections.md#places) | A map of places over their cards |
| [`daily`](collections.md#daily) | A journal: a year calendar, charts and the latest days |
| [`bookmarks`](collections.md#bookmarks) | A reading list of clipped pages |
| [`people`](collections.md#people) | Faces, and a graph of how people link |
| [`snippets`](collections.md#snippets) | Code snippets to copy, filtered by language |
| [`episodes`](collections.md#episodes) | Podcast episodes with a player and a feed |
| [`courses`](collections.md#courses) | Courses with their progress and certificates |
| [`wishlist`](collections.md#wishlist) | Wishes with their prices and priority |
| [`quotebook`](collections.md#quotebook) | Every signed quote of the notes, by author |
| [`questions`](collections.md#questions) | Open questions, and their answers |
| [`digest`](collections.md#digest) | What was planted and tended each week |
| [`shelf`](collections.md#shelf) | A shelf of anything else, with your own statuses |

## Trying a layout

Under `datme dev`, the 🎨 bar on a note or a folder page names the page's
layout and tries another one: any layout of a note's own text, any
collection, or `none` to see the note without its layout (`?layout=books`).
A collection can be regrouped by status, year, month, none or its layout's
default (`?group=year`, or any property). A folder without a folder note
tries collections only, of the notes in that folder, and the bar gives the
frontmatter of the folder note to create. A previewed layout brings its own
style and frame, as it would once written, and the lines to copy start with
`layout:` and `group:`.

The screenshots of these pages are made by `bun run screenshots layouts`,
which builds this documentation and opens each example under
[examples](https://gitlab.com/dynamo-brain/datme/-/tree/main/docs/examples).
