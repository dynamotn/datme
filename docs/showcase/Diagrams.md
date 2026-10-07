---
tags: [type/demo, markdown]
description: D2 and Typst drawn at build time, sheet music and a mind map drawn in the browser.
---
# Diagrams

A D2 diagram, drawn at build time. Switch the theme: it follows.

```d2
vault: Obsidian vault
datme: datme {shape: hexagon}
site: Digital garden {shape: cloud}
vault -> datme: notes
datme -> site: HTML
```

Typst, typeset at build time in the page's ink:

```typst
$ integral_0^oo e^(-x^2) dif x = sqrt(pi) / 2 $
```

A tune in ABC notation, drawn by abcjs:

```abc
X:1
T:Seeds
M:3/4
L:1/8
K:G
B2 A2 G2 | d4 B2 | c2 B2 A2 | G6 |
```

A mind map, from headings and lists. Drag it, zoom it, fold its branches:

```markmap
# A garden
## Seeds
- fleeting notes
- quotes
## Sprouts
- atomic notes
## Trees
- maps of content
- essays
```
