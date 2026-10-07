---
tags: [type/demo, markdown]
description: Tabs and columns from the Tabs and Multi-Column Markdown plugins.
---
# Tabs and columns

## Tabs

````tabs
--- Bun
```bash
bunx @dynamotn/datme dev ~/MyVault
```
--- Node
```bash
npx @dynamotn/datme dev ~/MyVault
```
--- Installed
Install it once with `npm i -g @dynamotn/datme`, then:

```bash
datme dev ~/MyVault
```
````

## Columns

--- start-multi-column: Seasons
```column-settings
Number of Columns: 2
```
> [!tip] Spring
> Plant new notes, short and rough.

--- column-break ---

> [!success] Autumn
> Gather what grew into [[Callouts and math|evergreen notes]].

--- end-multi-column

## Callouts side by side

> [!multi-column]
>
> > [!note] Left
> > A callout of its own.
>
> > [!example] Right
> > And another, next to it.
