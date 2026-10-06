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

```dataviewjs
dv.list(dv.pages().file.name)
```

```dataview

```
