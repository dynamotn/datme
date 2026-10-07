---
tags: [type/demo]
description: A map of the Obsidian Leaflet plugin, with markers that link to notes.
---
# Places

A ```leaflet block of the Leaflet plugin becomes a live map. Markers can link
to notes, and `markerTag:` or `markerFile:` place notes by their `location`.

```leaflet
id: showcase
lat: 16.0
long: 106.0
defaultZoom: 5
height: 420px
marker: default, 21.0278, 105.8342, [[Showcase]], Where the garden grows
marker: default, 16.4637, 107.5909, https://en.wikipedia.org/wiki/Hu%E1%BA%BF, Huế
marker: default, 10.7769, 106.7009, , Hồ Chí Minh City
```
