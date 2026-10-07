---
title: "Plugins"
---
# Plugins

datme renders the output of popular Obsidian plugins at build time, so readers
see your queries, drawings and decks without having Obsidian. Queries only ever
see **published** notes: a private note can't leak through a Dataview table.

- [Dataview](#dataview)
- [Tasks](#tasks)
- [Search queries](#search-queries)
- [Canvas](#canvas)
- [Bases](#bases)
- [Excalidraw](#excalidraw)
- [Marp Slides](#marp-slides)
- [Kanban](#kanban)
- [Charts](#charts)
- [Spaced Repetition flashcards](#spaced-repetition-flashcards)

## Dataview

*Live example: [Reading list](showcase/Reading%20list.md).*

```` ```dataview ```` blocks run at build time:

- `LIST` and `TABLE [WITHOUT ID]`.
- `FROM` #tags, "folders" and [[links]], combined with `AND`, `OR` and `-`.
- `WHERE`, `FLATTEN`, `GROUP BY`, `SORT`, `LIMIT`, and the common functions.
- `TASK` queries over `- [ ]` items, with Tasks-plugin dates like 📅 and
  `[key:: value]` fields.

DataviewJS blocks show a notice, since they would need Obsidian to run.

## Tasks

```` ```tasks ```` blocks list the published tasks that match:

- `done` and `not done`.
- `due|scheduled|starts|done before|after|on today|tomorrow|<date>`.
- `no|has due date`.
- `path|description|heading includes` and `tag includes`.
- `priority is`, `sort by`, `group by` and `limit`.

Each task links to its note.

## Search queries

```` ```query ```` blocks run Obsidian's search over the published notes:
words, `"phrases"`, `OR`, `-word`, `( )`, `tag:`, `path:`, `file:` and
`line:(…)`. Matching ignores case and accents. Results list each matching note
with the line that matched.

## Canvas

*Live example: [Garden map](showcase/Garden%20map.canvas).*

Canvases (`.canvas`) that a published note links to or embeds become pages of
their own, with pan and zoom. Text cards render markdown, file cards link to
published notes or show images, and edges keep their labels and colours. With
`publish: all`, every canvas is published.

## Bases

Bases (`.base`) get a page with all their views, and render in place when
embedded (`![[Books.base#Reading]]`). Supported:

- `filters` with `and`, `or` and `not`, and expressions like
  `file.hasTag("book") && rating >= 4`.
- `formulas` and `properties.displayName`.
- `table`, `cards` and `list` views, with `order`, `sort` and `limit`.

## Excalidraw

*Live example: [Sketch](showcase/Sketch.excalidraw).*

Drawings (`![[Plan.excalidraw]]`) need no export. datme reads the scene the
plugin stores in `.excalidraw.md` (compressed or not), or a plain `.excalidraw`
file, and draws it at build time with the same hand-drawn look: roughjs with
each shape's own seed, Excalifont text, arrows, freehand strokes and embedded
images. In the dark theme the drawing is inverted, the way Excalidraw does it.

If the plugin did export an SVG or PNG next to the drawing, datme uses that
file instead. With both `.light.svg` and `.dark.svg`, the drawing follows the
site theme.

- **Links.** A shape's link, and `[[wikilinks]]` or `[text](url)` in its text,
  are clickable and count as links of the note, for backlinks and the graph.
- **Frames** are drawn with their name, and clip what they hold.
- **Parts** embed as in the plugin: `![[Plan.excalidraw#^frame=id]]`,
  `#^clippedframe=id`, `#^group=id`, `#^area=id`, or a frame by name,
  `#Overview`.
- **Embedded files** are drawn too: images (cropped and rounded), other
  drawings, notes as cards linking to them, and LaTeX formulas.
- **Export settings.** The frontmatter keys `excalidraw-export-transparent`,
  `excalidraw-export-dark` and `excalidraw-export-padding` are honoured.
- **Fonts.** Nunito and Lilita One load only when a drawing uses them.
- **Viewing.** A drawing opens large in the lightbox. A plain link,
  `[[Plan.excalidraw]]`, leads to a page of its own with pan and zoom.

## Marp Slides

*Live example: [A slide deck](showcase/A%20slide%20deck.md).*

Notes with `marp: true` (as written for the Marp Slides plugin or Marp for
VS Code) are slide decks, rendered with Marp Core at build time.

```markdown
---
publish: true
marp: true
theme: gaia
paginate: true
footer: My talk
---

# First slide

---

<!-- _class: lead -->
![[sky.png|bg left]]
## Second slide
```

- Slides are split by `---`.
- Frontmatter directives work: `theme`, `paginate`, `header`, `footer`,
  `size`, `backgroundColor`, `transition` and the others.
- So do comment directives like `<!-- _class: lead -->` and `<style>` blocks.
- Image keywords work in both syntaxes: `![bg left](…)` and `![w:300](…)`, or
  `![[sky.png|bg left]]` and `![[logo.png|200]]` (which means `w:200`).
- Any CSS file in the vault with `/* @theme name */` is available as a theme.
- Speaker notes stay hidden.
- A **▶ Present** button shows the deck one slide at a time, full screen. Move
  with the arrow keys, space or a click; `Esc` ends the show.

## Kanban

*Live example: [Project board](showcase/Project%20board.md).*

Boards of the Kanban plugin (notes with `kanban-plugin` in their frontmatter)
show their `##` lanes side by side, each list item a card.

## Charts

*Live example: [Reading list](showcase/Reading%20list.md).*

```` ```chart ```` blocks of the Charts plugin are drawn with Chart.js in the
theme's colours. Supported: `type: bar|line|pie|doughnut|radar|polarArea`,
`labels`, `series`, `stacked`, `fill`, `tension`, `beginAtZero`, `indexAxis`
and `width`. The data is also given as a table, for screen readers and print.

## Spaced Repetition flashcards

*Live example: [Flashcards](showcase/Flashcards.md).*

In notes tagged `#flashcards` (or the tags set in `conventions.flashcardTags`),
the Spaced Repetition plugin's syntax works:

- `Question::Answer`.
- `Word:::Translation`, a card that goes both ways.
- Multi-line cards, with a `?` (or `??`) line between question and answer.

Cards flip open on click. `==Highlights==` outside cards become clozes, hidden
until clicked. A practice button runs the deck one card at a time, Leitner
style (boxes of 0, 1, 3, 7 and 14 days), and keeps progress in the reader's
browser.
