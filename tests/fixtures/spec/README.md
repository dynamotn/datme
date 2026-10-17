# Markdown spec examples

The examples of two markdown specifications, which `tests/spec.test.ts` runs
through datme's renderer to make sure Obsidian's syntax never breaks plain
markdown.

- `commonmark-0.31.2.json`: every example of the
  [CommonMark Spec 0.31.2](https://spec.commonmark.org/0.31.2/), from its
  `spec.json`.
- `gfm-0.29-extensions.json`: the examples of the extensions in the
  [GitHub Flavored Markdown Spec 0.29](https://github.github.com/gfm/)
  (tables, task lists, strikethrough, autolinks), taken from the `spec.txt`
  of [cmark-gfm](https://github.com/github/cmark-gfm). Its tagfilter example
  is left out: datme keeps raw HTML on purpose.

Both specifications are by John MacFarlane (GFM with GitHub), licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
