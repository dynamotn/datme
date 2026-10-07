---
publish: true
---
```dataview
TABLE person.fullname AS "Name" FROM "06_Reference" WHERE person
```

```dataview
LIST WHERE publish = false OR file.name = "Private"
```

```dataview
TABLE rows.file.link GROUP BY file.folder
```

```dataview
TASK FROM "03_Atomic"
```

- [ ] Ask [[Niklas Luhmann]] about it
- [x] **Read** the paper

```tasks
not done
path includes Atomic
```

```query
"slip box" -tag:#theme/nothing
```

```dataviewjs
dv.list(dv.pages().file.name)
```

```dataview

```

Rating:: 4

Score: `= this.rating * 2`, by `= [[Niklas Luhmann]].file.name`; code stays `$= dv.current()`.

```base
views:
  - type: list
    name: Linked here
    filters: 'this.file.hasLink(file) && file.name != this.file.name'
  - type: table
    name: Rated
    filters: 'file.name == this.file.name'
    order: [file.name, formula.shout]
formulas:
  shout: 'this.file.name.upper()'
```
