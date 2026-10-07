---
tags: [type/demo]
description: Dataview queries and a base over the garden, a chart and a heatmap.
---
# Reading list

Dataview queries run when the site is built, over published notes only.

```dataview
TABLE description AS "What it shows"
FROM #type/demo
SORT file.name
```

A base can live in the note too, as a `base` code block:

```base
filters: 'file.inFolder("showcase")'
views:
  - type: table
    name: Showcase notes
    order: [file.name, description]
    sort:
      - property: file.name
        direction: ASC
```

```chart
type: bar
labels: [Seeds, Growing, Harvested]
series:
  - title: Ideas
    data: [2, 1, 2]
beginAtZero: true
```

This note was written `= this.file.ctime`, and the garden has
`= length(this.file.inlinks)` notes pointing here.

```contributionGraph
title: Notes planted in the docs
dateRangeValue: 1
dateRangeType: LATEST_YEAR
dataSource:
  type: PAGE
  value: '"showcase"'
```
