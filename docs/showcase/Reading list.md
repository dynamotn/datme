---
tags: [type/demo]
description: Dataview queries over the garden, a chart and a heatmap.
---
# Reading list

Dataview queries run when the site is built, over published notes only.

```dataview
TABLE description AS "What it shows"
FROM #type/demo
SORT file.name
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
