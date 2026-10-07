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
- `![[embeds]]` of whole notes, sections, blocks, images, audio, video and PDFs.
- Callouts (`> [!tip]`), folded with `> [!tip]-`.
- `==highlights==`, `%%comments%%`, `#tags` and `^block-ids`.
- LaTeX (`$…$`, `$$…$$`) and Mermaid diagrams.
- Standard markdown links to notes and files, with relative paths.

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
| `cssclasses` | Classes added to the note, as in Obsidian |
| `draft`, `publish_date`, `unlisted`, `password` | See [Privacy](privacy.md) |
| `lang` | The language the note is written in, when it isn't the site's default one |
| `lineBreaks` | `true` to keep single line breaks (poems, lyrics) |
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

## Footnotes and citations

Footnotes (`[^1]`) move into the margin as sidenotes on wide screens, in
reader mode or when both sidebars are hidden, each tied to its line by a
dashed leader. Footnotes that hold lists or code
stay at the end. Hovering a footnote number shows it in a popover.

Citations use Pandoc's syntax: `[@key]`, `[@key, p. 12]`, `[see @a; @b]`, or
`[-@key]` to leave the author out. datme looks them up in the `bibliography`
files of `datme.yaml`, shows them author–date ("Luhmann 1992, p. 12") and
lists the references in APA style at the end of the note. `datme check`
reports keys that aren't in the bibliography.

## Series

Notes that share `series: Name` (or `series: "[[Intro note]]"`) show their
part number, the list of parts, and links to the previous and next part.
`series_order` sets the order; otherwise the creation date does.

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
  folders and top tags.

Each of these pages exists only when some note qualifies. Protected notes
never show up on them.

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
`/<lang>/`. A note with no block for some language is shown there in its
original language, with a notice. Put `lang: en-US` in the frontmatter of a
note written in a language other than the default one. Locked parts use the
same kind of markers; see [Privacy](privacy.md#locked-parts).

## Feeds

Every folder and tag has its own RSS feed (`/Books/index.xml`,
`/tags/book/index.xml`), linked from its page. `/recent` lists the notes
planted or watered lately.
