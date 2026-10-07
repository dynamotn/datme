---
tags: [type/moc]
description: Live examples of what datme renders from an Obsidian vault.
---
# Showcase

Every note in this folder is a plain Obsidian note, published by datme as it
is. Open one, then read its source on
[GitLab](https://gitlab.com/dynamo-tools/datme/-/tree/main/docs/showcase) to
compare.

- [[Callouts and math]]: callouts, highlights, footnotes, LaTeX and Mermaid.
- [[Diagrams]]: D2, Typst, sheet music and a mind map.
- [[Tabs and columns]]: tabs and columns from plugins.
- [[A slide deck]]: a Marp deck. Press ▶ Present.
- [[Flashcards]]: Spaced Repetition cards and a practice mode.
- [[Locked part]]: a passage only readers with the password can open (it's `datme`).
- [[Project board]]: a Kanban board.
- [[Reading list]]: Dataview queries and a chart.
- [[Places]]: a Leaflet map with markers.
- [[Sketch.excalidraw|A sketch]]: an Excalidraw drawing, drawn from its scene.
- [[Garden map.canvas|A canvas]]: an Obsidian canvas, with pan and zoom.

```dataview
LIST description
FROM "showcase"
WHERE file.name != "Showcase"
SORT file.name
```
