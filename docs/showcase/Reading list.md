---
tags: [type/demo]
description: Dataview queries over the garden, and a chart.
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
