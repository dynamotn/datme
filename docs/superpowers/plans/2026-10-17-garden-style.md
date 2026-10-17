# Garden Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `garden`, a third site style that reads as a digital garden (recently tended row, maturity-sized tiles, wandering filters), selectable per site and per folder, with style resolution gathered in one module.

**Architecture:** The list of styles becomes one constant (`STYLES`) used by the config schema, `Base.astro`, the PWA colours and a new `src/lib/look.ts` that resolves a folder's or note's style. Garden-specific data (tile size, order, filters) is pure code in `src/lib/garden.ts`; markup lives in `src/components/garden/`; all garden CSS is in `src/styles/garden.css` scoped to `[data-look="garden"]`; a small client script handles filters, the 60-tile cap and relative dates.

**Tech Stack:** Astro, TypeScript, Bun (`bun test`, `bun run check`), zod (`astro/zod`), plain CSS.

**Spec:** `docs/superpowers/specs/2026-10-17-garden-style-design.md`. This plan covers step 1 of its "Order of work" only: everything except the page-layout tier, `chrome`, `full-norail`, the scheme hint, `resume` and `darkroom`, which wait for branch `worktree-feat-note-layouts` to land on `main` and get their own plan.

## Global Constraints

- Branch from `main` (`58eadf8` or later). Do not edit `src/lib/note-layouts.ts`, `src/components/Collection.astro`, `CvHead.astro`, `LinksHead.astro` (they do not exist on `main`; they belong to the layouts branch). Keep edits to `NotePage.astro`, `FolderPage.astro`, `vault.ts`, `global.css`, `print.css` small: they are shared hot spots with that branch.
- Every rule in `src/styles/garden.css` is scoped to `[data-look="garden"]`. `notebook` and `classic` rendering must not change, except the folder-page change in Task 3.
- Garden CSS uses the existing token names (`--bg`, `--surface`, `--ink`, `--ink-2`, `--muted`, `--line`, `--accent`, `--accent-2`, `--accent-soft`, `--font-ui`, `--font-read`, …) so `themeCss()` accent and font overrides keep winning.
- Pages work without JavaScript: every tile shows, filter controls stay hidden.
- Accessibility: tile order = DOM order (CSS `columns`, not `grid-auto-flow: dense`); filters are `<button>`s and a `<select>`; the stage emoji is always shown next to any stage colour; AA contrast in both schemes.
- Visual values from the spec: light bg around `#f7f3e8`, moss accent around `#4f7a3a`, earth secondary around `#a0703c`; dark bg around `#121a14`, cream text, lighter moss accent. Fonts: Fraunces (headings, titles), Literata (reading), Inter (UI), loaded from Google Fonts the way `notebook.css` loads Bricolage.
- Numbers from the spec: recently tended row = 6 notes; home bed shows 60 tiles before "walk the whole garden"; tag select = 12 most used tags; large tiles show up to 3 tags and a description clamped to 2 lines; relative dates only within 30 days.
- Commits: Conventional Commits, subject ≤ 72 chars, no `Co-Authored-By` or other agent trailers. Every user-visible change gets a `CHANGELOG.md` line under `## [Unreleased]` (`### Added` / `### Changed`) in the same commit.
- Checks before each commit: `bun test <the files touched>`; before the last commit: `bun test`, `bun run check`, and the repo's pre-commit hooks (`prek run --all-files` if configured). Never `--no-verify`.

## Review Focus

1. **Vault with no `stages`**: every tile is `medium`, the stage chips are replaced by top-level-folder chips, nothing throws. Tests in Task 4 (`gardenChips` and `tileSize` with `{}`).
2. **Vault with one or two stages**: two stages give `small` and `large`; a single stage gives `medium` (there is no rank to compare). Test in Task 4 (`tileSize`).
3. **Notes without `updated`** (no frontmatter, no git, mtime only is always set, but `updated` is optional in the type): ordering must not throw and such notes sort last within their rank. Test in Task 4 (`gardenOrder`).
4. **Folder listed in both `classic` and `folders`, and nested matches**: longest match across both lists, tie → `folders`. Test in Task 2 (`resolveLook`).
5. **Home with fewer than 60 notes / exactly 0 notes**: no "walk the whole garden" button, no empty bed markup, recently tended row omitted when empty. Test in Task 6 (garden fixture has < 60 notes: assert no `data-garden-more` button is visible, i.e. it carries `hidden`).

---

### Task 1: One list of styles and per-folder styles in the config

**Files:**
- Modify: `src/site.config.ts` (appearance schema near line 386, resolved `appearance` near line 539)
- Modify: `tests/config.test.ts` ("menu and appearance" block, ~line 180)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `export const STYLES = ["notebook", "classic", "garden"] as const`, `export type Style = (typeof STYLES)[number]` in `src/site.config.ts`; `site.appearance` becomes `{ style: Style; classic: string[]; folders: Record<string, Style>; stream: string[] }`, with folder keys trimmed of leading/trailing slashes like `classic`.

- [ ] **Step 1: Write the failing tests** in `tests/config.test.ts`:

```ts
test("the menu defaults to home and tags, in the notebook style", () => {
  const c = resolveConfig({}, "/v")
  expect(c.nav).toEqual([{ kind: "home" }, { kind: "tags" }])
  expect(c.appearance).toEqual({ style: "notebook", classic: [], folders: {}, stream: [] })
})

test("the garden style and a style per folder", () => {
  const c = resolveConfig({ appearance: { style: "garden", folders: { "/Writing/": "classic", "Lab/Old": "notebook" } } }, "/v")
  expect(c.appearance.style).toBe("garden")
  expect(c.appearance.folders).toEqual({ Writing: "classic", "Lab/Old": "notebook" })
})

test("unknown styles are rejected", () => {
  expect(() => resolveConfig({ appearance: { style: "library" } }, "/v")).toThrow()
  expect(() => resolveConfig({ appearance: { folders: { A: "fancy" } } }, "/v")).toThrow()
})
```

(The first test replaces the existing one of the same name.)

- [ ] **Step 2: Run** `bun test tests/config.test.ts` — expected: the three tests FAIL (`folders` missing, `garden` rejected).
- [ ] **Step 3: Implement.** Add `STYLES`/`Style`; `style: z.enum(STYLES).default("notebook")`; `folders: z.record(z.string(), z.enum(STYLES)).default({})`; update the `.default({...})` of `appearance` and its doc comment (`garden: tiles sized by maturity, recently tended first`); resolve `folders` with the same slash trimming as `classic`.
- [ ] **Step 4: Run** `bun test tests/config.test.ts` — PASS.
- [ ] **Step 5: CHANGELOG** `### Added`: one line for `appearance.folders` (a style per folder, subfolders included). The `garden` style itself gets its entry in Task 6, when it renders.
- [ ] **Step 6: Commit** `feat(config): add the garden style and a style per folder`.

---

### Task 2: Resolve a folder's or note's look in one place

**Files:**
- Create: `src/lib/look.ts`
- Create: `tests/look.test.ts`
- Modify: `src/lib/nav.ts` (remove `lookOf`, lines 53-59)
- Modify: `tests/nav.test.ts` (remove the `lookOf` block and import)
- Modify: `src/components/pages/NotePage.astro:8` (import from `~/lib/look`)
- Modify: `src/layouts/Base.astro` (`look?: Style`, line 36; theme-color metas, lines 138-146)
- Modify: `src/lib/pwa.ts` (`THEME_COLOR`)
- Modify: `tests/pwa.test.ts`

**Interfaces:**
- Consumes: `Style`, `STYLES`, `site.appearance` (Task 1).
- Produces, in `src/lib/look.ts`:
  - `export function resolveLook(dir: string, appearance: Pick<SiteConfig["appearance"], "style" | "classic" | "folders">): Style` — pure.
  - `export function lookOfDir(dir: string): Style` — `resolveLook(dir, site.appearance)`.
  - `export function lookOf(note: Pick<Note, "dir"> | undefined): Style` — site style when `undefined`. (Takes a note so the layout and `style:` tiers can be added later without changing callers.)
- Produces, in `src/lib/pwa.ts`: `export const THEME_COLOR: Record<Style, { light: string; dark: string }>`.

- [ ] **Step 1: Write the failing tests** in `tests/look.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { resolveLook, lookOf } from "../src/lib/look"

const base = { style: "notebook" as const, classic: [] as string[], folders: {} }

describe("resolveLook", () => {
  test("without rules, the site style", () => {
    expect(resolveLook("Notes", base)).toBe("notebook")
    expect(resolveLook("", { ...base, style: "garden" })).toBe("garden")
  })
  test("classic folders flip notebook and classic; under garden they are classic", () => {
    expect(resolveLook("Writing/Poems", { ...base, classic: ["Writing"] })).toBe("classic")
    expect(resolveLook("Writing", { ...base, style: "classic", classic: ["Writing"] })).toBe("notebook")
    expect(resolveLook("Writing", { ...base, style: "garden", classic: ["Writing"] })).toBe("classic")
    expect(resolveLook("Writings", { ...base, classic: ["Writing"] })).toBe("notebook")
  })
  test("a style per folder, subfolders included; the longest match wins across both lists", () => {
    const a = { ...base, classic: ["A/B"], folders: { A: "garden" as const } }
    expect(resolveLook("A", a)).toBe("garden")
    expect(resolveLook("A/C", a)).toBe("garden")
    expect(resolveLook("A/B/D", a)).toBe("classic")
  })
  test("on a tie, folders win over classic", () => {
    expect(resolveLook("A", { ...base, classic: ["A"], folders: { A: "garden" } })).toBe("garden")
  })
})

describe("lookOf", () => {
  test("follows the fixture's classic folders", () => {
    expect(lookOf({ dir: "07_Project" })).toBe("classic")
    expect(lookOf({ dir: "07_Project/Poems" })).toBe("classic")
    expect(lookOf({ dir: "07_Projects" })).toBe("notebook")
    expect(lookOf(undefined)).toBe("notebook")
  })
})
```

In `tests/pwa.test.ts` add: `expect(Object.keys(THEME_COLOR).sort()).toEqual([...STYLES].sort())` and `expect(THEME_COLOR.garden.light).toMatch(/^#[0-9a-f]{6}$/i)`.

- [ ] **Step 2: Run** `bun test tests/look.test.ts tests/pwa.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement `src/lib/look.ts`.** Collect candidates `[folder, style, fromFolders]` from `classic` (style = `style === "notebook" ? "classic" : style === "classic" ? "notebook" : "classic"`) and from `folders`; keep those where `dir === f || dir.startsWith(f + "/")`; pick the longest `f`, preferring `fromFolders` on equal length; else `appearance.style`.
- [ ] **Step 4: Move callers.** Delete `lookOf` from `nav.ts` and its test block; `NotePage.astro` imports `lookOf` from `~/lib/look`. `Base.astro`: `look?: Style`; theme-color metas use `THEME_COLOR[look].light` / `.dark` instead of the hard-coded `#f6f3ec` / `#111210`. `pwa.ts`: `THEME_COLOR` gets `{ light, dark }` per style — notebook `{ "#f5f5f0", <notebook.css dark --bg> }`, classic `{ "#f6f3ec", "#111210" }`, garden `{ "#f7f3e8", "#121a14" }`; `manifest()` uses `THEME_COLOR[site.appearance.style].light`.
- [ ] **Step 5: Run** `bun test tests/look.test.ts tests/pwa.test.ts tests/nav.test.ts` — PASS; `bun run check` — no new errors.
- [ ] **Step 6: Commit** `refactor(look): resolve a page's style in one place` (theme-color now follows the look: add a `### Changed` CHANGELOG line, "The browser's theme colour follows the page's style").

---

### Task 3: Folder pages follow their folder's style

**Files:**
- Modify: `src/components/pages/FolderPage.astro` (line 79 branch; pass `look` to `Base`)
- Modify: `tests/build.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `lookOfDir(dir: string): Style` (Task 2).
- Produces: `FolderPage` computes `const look = lookOfDir(folder.dir)` and branches its note list on it (`notebook` → `IndexCard` wall, `classic` → `NoteRow` list; Task 6 adds `garden`).

- [ ] **Step 1: Write the failing test** in `tests/build.test.ts`, next to "notes use the notebook look…":

```ts
test("folder pages use their folder's style", () => {
  const project = read("07_Project/index.html")
  expect(project).toContain('data-look="classic"')
  expect(project).toContain('class="note-row')
  expect(project).not.toContain('class="card-wall"')
  expect(read("06_Reference/index.html")).toContain('data-look="notebook"')
})
```

- [ ] **Step 2: Run** `bun test tests/build.test.ts` — this test FAILS (folder page is notebook today); others pass.
- [ ] **Step 3: Implement** in `FolderPage.astro`: `look` from `lookOfDir`, passed to `<Base look={look}>`, list branch on `look === "notebook"`. Stream folders keep winning, unchanged.
- [ ] **Step 4: Run** `bun test tests/build.test.ts` — PASS.
- [ ] **Step 5: CHANGELOG** `### Changed`: "A folder listed in `appearance.classic` now shows its own page in that style too, not only its notes."
- [ ] **Step 6: Commit** `feat(folders): show folder pages in their folder's style`.

---

### Task 4: Garden data: tile sizes, order and filters

**Files:**
- Create: `src/lib/garden.ts`
- Create: `tests/garden-data.test.ts`

**Interfaces:**
- Consumes: `site.stages` (`Record<string, StageDef>` with `order`), `site.conventions.typePrefix`, `Note`, `byRecent`.
- Produces:
  - `export type TileSize = "small" | "medium" | "large"`
  - `export const RECENT_TILES = 6`, `export const HOME_TILES = 60`, `export const FILTER_TAGS = 12`
  - `export function tileSize(stage: string | undefined, stages?: Record<string, StageDef>): TileSize` — default `site.stages`. Ranks by `order`. ≥3 stages: first `small`, last `large`, others `medium`; exactly 2: `small`, `large`; 0 or 1 stage, or `stage` undefined/unknown: `medium`.
  - `export function gardenOrder<T extends Pick<Note, "stage" | "updated">>(notes: T[], stages?: Record<string, StageDef>): T[]` — new array; most mature first (higher `order` first; notes without a stage after all staged ones), then `updated` newest first, missing `updated` last.
  - `export interface GardenChip { kind: "stage" | "folder"; value: string; icon: string; label: string; count: number }`
  - `export function gardenChips(notes: Note[], lang: Lang, stages = site.stages): GardenChip[]` — one chip per configured stage with `count > 0`, in stage order; when `site.stages` is empty, one chip per top-level folder of the notes (`icon: "📁"`, `label`: folder display name, `value`: the folder segment).
  - `export function topTags(notes: Pick<Note, "tags">[], n = FILTER_TAGS): { tag: string; count: number }[]` — excludes tags starting with `site.conventions.typePrefix`; sorted by count desc then name.

- [ ] **Step 1: Write the failing tests.** Use explicit `stages` objects for `tileSize`/`gardenOrder` (pure), and the fixture vault (`listed("en-US")`) for `gardenChips`/`topTags`:

```ts
const s = (keys: string[]) => Object.fromEntries(keys.map((k, i) => [k, { icon: "x", label: {}, order: i }]))
test("tile size follows maturity rank", () => {
  const three = s(["seed", "sprout", "tree", "old"])
  expect(tileSize("seed", three)).toBe("small")
  expect(tileSize("tree", three)).toBe("medium")
  expect(tileSize("old", three)).toBe("large")
  expect(tileSize(undefined, three)).toBe("medium")
  expect(tileSize("nope", three)).toBe("medium")
  expect(tileSize("a", s(["a", "b"]))).toBe("small")
  expect(tileSize("b", s(["a", "b"]))).toBe("large")
  expect(tileSize("a", s(["a"]))).toBe("medium")
  expect(tileSize("a", {})).toBe("medium")
})
test("the garden opens on its most mature notes, newest first within a stage", () => {
  const d = (x: string) => new Date(x)
  const notes = [
    { k: 1, stage: "seed", updated: d("2026-10-10") },
    { k: 2, stage: "tree", updated: d("2026-01-01") },
    { k: 3, stage: "tree", updated: d("2026-05-01") },
    { k: 4, stage: undefined, updated: d("2026-10-16") },
    { k: 5, stage: "tree", updated: undefined },
  ]
  expect(gardenOrder(notes, s(["seed", "tree"])).map((n) => n.k)).toEqual([3, 2, 5, 1, 4])
})
test("chips list the stages that have notes, in stage order", () => {
  const chips = gardenChips(listed("en-US"), "en-US")
  expect(chips.every((c) => c.kind === "stage" && c.count > 0)).toBe(true)
  expect(chips[0].value).toBe("01_Fleeting")
})
test("top tags leave type tags out", () => {
  expect(topTags([{ tags: ["a", "type/book", "b"] }, { tags: ["a"] }])).toEqual([{ tag: "a", count: 2 }, { tag: "b", count: 1 }])
})
```

Also: `gardenChips(listed("en-US"), "en-US", {})` returns only `kind: "folder"` chips, one per top-level folder that has notes.

- [ ] **Step 2: Run** `bun test tests/garden-data.test.ts` — FAIL.
- [ ] **Step 3: Implement** `src/lib/garden.ts` to the signatures above.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(garden): size and order notes by maturity`.

---

### Task 5: Garden client script: filters, cap and relative dates

**Files:**
- Create: `src/scripts/garden.ts`
- Create: `tests/garden-script.test.ts`
- Modify: `src/scripts/app.ts` (call `setupGarden()` in the `astro:page-load` handler, ~line 298)

**Interfaces:**
- Produces:
  - `export function relativeTended(since: Date, lang: string, now = new Date()): string | undefined` — `Intl.RelativeTimeFormat(lang, { numeric: "auto" })` in days (hours under a day); `undefined` when older than 30 days or in the future.
  - `export function tileMatches(tile: { stage: string; folder: string; tags: string[] }, filter: { stage?: string; folder?: string; tag?: string }): boolean`
  - `export function setupGarden(): void` — for each `[data-garden]` root:
    - un-hide `[data-garden-filters]`;
    - chip `<button data-garden-chip data-kind data-value aria-pressed>`: one active at a time, "all" resets;
    - `<select data-garden-tag>` filters by tag;
    - tiles are `.garden-tile` with `data-stage`, `data-folder`, `data-tags` (space-separated);
    - cap: when root has `data-cap="N"` and no filter is active, tiles after the N-th get `hidden`, and `[data-garden-more]` is un-hidden if any were hidden; clicking it removes the cap for the page;
    - any active filter shows all matching tiles regardless of cap;
    - every `time[data-tended]` inside the document gets its text replaced by `relativeTended(...)` when defined (keep the absolute date in `title`).

- [ ] **Step 1: Write the failing tests:**

```ts
const now = new Date("2026-10-17T12:00:00Z")
test("recent tending reads as relative time, older stays absolute", () => {
  expect(relativeTended(new Date("2026-10-14T12:00:00Z"), "en-US", now)).toBe("3 days ago")
  expect(relativeTended(new Date("2026-10-14T12:00:00Z"), "vi-VN", now)).toBe("3 ngày trước")
  expect(relativeTended(new Date("2026-10-16T12:00:00Z"), "en-US", now)).toBe("yesterday")
  expect(relativeTended(new Date("2026-09-01T00:00:00Z"), "en-US", now)).toBeUndefined()
  expect(relativeTended(new Date("2026-10-20T00:00:00Z"), "en-US", now)).toBeUndefined()
})
test("a tile matches every active filter", () => {
  const tile = { stage: "tree", folder: "Notes", tags: ["pkm", "garden"] }
  expect(tileMatches(tile, {})).toBe(true)
  expect(tileMatches(tile, { stage: "tree", tag: "pkm" })).toBe(true)
  expect(tileMatches(tile, { stage: "seed" })).toBe(false)
  expect(tileMatches(tile, { tag: "pk" })).toBe(false)
  expect(tileMatches(tile, { folder: "Notes" })).toBe(true)
})
```

- [ ] **Step 2: Run** `bun test tests/garden-script.test.ts` — FAIL.
- [ ] **Step 3: Implement** to the interface; wire `setupGarden()` into `app.ts`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(garden): filter the garden and show recent tending`.

---

### Task 6: Garden tiles, home, folder and tag pages

**Files:**
- Create: `src/components/garden/GardenTile.astro`, `src/components/garden/GardenBed.astro`, `src/components/garden/GardenHome.astro`
- Create: `src/styles/garden.css` (structure only here: tokens, bed columns, tile sizes; Task 8 finishes the visual pass)
- Modify: `src/layouts/Base.astro` (import `~/styles/garden.css` after `notebook.css`)
- Modify: `src/components/pages/HomePage.astro` (`look === "garden" ? <GardenHome …/> : …` before the notebook branch)
- Modify: `src/components/pages/FolderPage.astro`, `src/components/pages/TagPage.astro` (garden branch)
- Modify: `src/lib/i18n.ts` (strings, `vi` and `en`)
- Create: `tests/fixtures/garden/` (vault), `tests/garden.test.ts` (build)
- Modify: `tests/fixtures/vault/datme.yaml` (`appearance.folders: { 01_Fleeting: garden }`), `tests/build.test.ts`
- Modify: `tests/styles.test.ts`

**Interfaces:**
- Consumes: `tileSize`, `gardenOrder`, `gardenChips`, `topTags`, `RECENT_TILES`, `HOME_TILES` (Task 4); `lookOfDir` (Task 2); the script's data attributes (Task 5).
- Produces:
  - `GardenTile.astro` props `{ note: Note; variant?: "recent" | "path" }` → `<article class="garden-tile" data-size={TileSize} data-stage={note.stage ?? ""} data-folder={top-level segment} data-tags={tags without type prefix, space-separated}>`. With `variant` the class is `garden-tile is-recent` / `garden-tile is-path`, so an exact `class="garden-tile"` matches bed tiles only; `recent` tiles are always `small` plus the date. Sizes: `small` = stage icon + title link; `medium` adds `<time datetime=… data-tended title=…>{formatDate(updated)}</time>` after `s.tended`; `large` also adds `<p class="garden-tile-desc">` (description) and up to 3 tag chips. No banner, no reading time.
  - `GardenBed.astro` props `{ notes: Note[]; lang: Lang; cap?: number }` → `<div data-garden data-cap={cap}>`, `<div class="garden-filters" data-garden-filters hidden>` (chips: "all" + `gardenChips`; `<select data-garden-tag>` of `topTags`), `<div class="garden-bed">` with `gardenOrder(notes)` tiles, `<button type="button" class="garden-more" data-garden-more hidden>{s.walkGarden}</button>` only when `cap` is set.
  - `GardenHome.astro` props `{ lang: Lang; intro: string; shelves: string[]; title: string }`, sections in this order: `section.garden-gate` (h1, tagline, intro prose) → `section.garden-recent` (h2 `s.recentlyTended`, horizontal row of `byRecent(notes).slice(0, RECENT_TILES)` as `GardenTile variant="recent"`; omitted when empty) → `section.garden-paths` (h2 `s.pathsIn`, MOCs as `GardenTile variant="path"`; omitted when none) → `GardenBed` (all listed notes except home and folder notes, `cap={HOME_TILES}`) → `section.garden-beds` (each shelf as `.prose`).
  - New `i18n` keys (en / vi): `recentlyTended` "Recently tended" / "Mới được chăm"; `tended` "Tended" / "Chăm"; `planted` "Planted" / "Gieo"; `lastTended` "Last tended" / "Chăm lần cuối"; `pathsIn` "Paths in" / "Lối vào"; `pathsFromHere` "Paths from here" / "Lối đi từ đây"; `nearby` "Nearby" / "Lân cận"; `walkGarden` "Walk the whole garden" / "Đi hết khu vườn"; `allStages` "All" / "Tất cả".

- [ ] **Step 1: Create the garden fixture** `tests/fixtures/garden/`:
  - `datme.yaml`: `site.title: Garden test`, `languages: [en-US]`, `publish: all`, `stages: { Seeds: fleeting, Sources: literature, Evergreen: permanent }`, `appearance: { style: garden, classic: [Writing] }`.
  - `index.md` (home): an intro paragraph and one `## Beds` section.
  - `Seeds/Idea.md` (tags `[pkm]`), `Seeds/Question.md`, `Sources/Book notes.md` (tags `[reading]`), `Evergreen/Gardens.md` (description in frontmatter, tags `[pkm, garden, writing, extra]`, links `[[Idea]]`), `Evergreen/Map.md` (tags `[moc]`), `Writing/Essay.md`. Give each explicit `created:` and `updated:` dates so order and the "Planted" line are deterministic.
- [ ] **Step 2: Write the failing build tests** `tests/garden.test.ts`, same `beforeAll` pattern as `tests/zero-config.test.ts` with `tests/fixtures/garden`:

```ts
test("the home is a garden: recently tended, paths in, then the bed", () => {
  const home = read("index.html")
  expect(home).toContain('data-look="garden"')
  const order = ["garden-gate", "garden-recent", "garden-paths", "garden-bed", "garden-beds"].map((c) => home.indexOf(`class="${c}`))
  expect(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1]))).toBe(true)
  expect(home).not.toContain("index-card")
  expect(home).not.toContain("hero-stats")
})
test("every listed note is a tile in the bed, most mature first", () => {
  const bed = read("index.html").split('class="garden-bed"')[1]
  expect((bed.match(/class="garden-tile"/g) ?? []).length).toBe(6)
  expect(bed.indexOf("Gardens")).toBeLessThan(bed.indexOf("Idea"))
  expect(bed).toMatch(/data-size="large"[^>]*data-stage="Evergreen"|data-stage="Evergreen"[^>]*data-size="large"/)
})
test("with fewer than 60 notes, the walk-the-garden button stays hidden", () => {
  expect(read("index.html")).toMatch(/<button[^>]*data-garden-more[^>]*hidden/)
})
test("tag and folder pages are garden beds; a classic folder is not", () => {
  expect(read("tags/pkm/index.html")).toContain('class="garden-tile"')
  expect(read("Evergreen/index.html")).toContain('class="garden-bed"')
  expect(read("Writing/index.html")).toContain('data-look="classic"')
})
```

In `tests/build.test.ts`: `01_Fleeting/Idea/index.html` and `01_Fleeting/index.html` contain `data-look="garden"`, the folder page contains `class="garden-tile"`; `03_Atomic/Zettelkasten/index.html` still `data-look="notebook"`.

In `tests/styles.test.ts`: read `garden.css`, strip comments, and for every selector list before a `{` that is not an at-rule (`@import`, `@media`, `@font-face`, `@supports`, `@keyframes` and its frames), assert each comma-separated selector starts with `[data-look="garden"]`.

- [ ] **Step 3: Run** `bun test tests/garden.test.ts tests/build.test.ts tests/styles.test.ts` — the new tests FAIL.
- [ ] **Step 4: Implement** the components, page branches, strings and the structural `garden.css` (masonry via `columns`, `break-inside: avoid`; tile sizes by `[data-size]`; recently tended row `overflow-x: auto` with `scroll-snap`).
- [ ] **Step 5: Run** `bun test` (whole suite: the main fixture changed) — PASS. `bun run check` — clean.
- [ ] **Step 6: CHANGELOG** `### Added`: the garden home, tiles and filters (one line each, reader-facing).
- [ ] **Step 7: Commit** `feat(garden): add garden home, folder and tag pages`.

---

### Task 7: Garden note pages

**Files:**
- Modify: `src/components/NoteMeta.astro` (new prop `look: Style`)
- Modify: `src/components/pages/NotePage.astro` (pass `look`; garden headings and stage icons in backlinks/related)
- Modify: `tests/garden.test.ts`

**Interfaces:**
- Consumes: `lookOf` (Task 2), strings `planted`, `lastTended`, `pathsFromHere`, `nearby` (Task 6), `time[data-tended]` (Task 5).
- Produces: under `look === "garden"`:
  - `NoteMeta` renders `<p class="garden-dates">{s.planted} <time datetime>…</time> · {s.lastTended} <time datetime data-tended>…</time></p>` instead of the calendar/edit spans (reading time line kept); the stage chip gets class `chip stage garden-stage`.
  - Backlinks `h2` = `s.pathsFromHere`, related `h2` = `s.nearby`; each `a.backlink` starts with `<span class="backlink-stage" aria-hidden="true">{stage icon}</span>` when the linked note has a stage.
  - Other looks render exactly as before.

- [ ] **Step 1: Write the failing tests** in `tests/garden.test.ts`:

```ts
test("note pages say when a note was planted and last tended, and offer paths", () => {
  const html = read("Evergreen/Gardens/index.html")
  expect(html).toMatch(/Planted <time datetime="[^"]+">/)
  expect(html).toMatch(/Last tended <time datetime="[^"]+" data-tended/)
  expect(read("Seeds/Idea/index.html")).toContain("Paths from here")
  expect(read("Seeds/Idea/index.html")).toMatch(/class="backlink-stage"[^>]*>🌳/)
})
```

And in `tests/build.test.ts` assert a notebook note (`03_Atomic/Zettelkasten/index.html`) still has no `garden-dates`.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `bun test tests/garden.test.ts tests/build.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(garden): show planting and paths on note pages` (CHANGELOG `### Added` line).

---

### Task 8: Garden visual language, print and docs

**Files:**
- Modify: `src/styles/garden.css` (full visual pass)
- Modify: `src/styles/print.css` (garden prints like classic: add `[data-look="garden"]` wherever notebook has its own print rules)
- Modify: `docs/configuration.md` ("Look and navigation": `style: notebook | classic | garden`, `folders:` example), `README.md` (feature line ~116), `src/cli.ts` (`datme init` template: mention `garden` and `folders`), `CHANGELOG.md` (tidy the Added lines into reader-facing wording)
- Optionally: `tools/screenshots.ts` (garden home light and dark)

**Interfaces:**
- Consumes: all class names from Tasks 6-7.

- [ ] **Step 1:** Light tokens on `[data-look="garden"]`, dark on `[data-look="garden"][data-theme="dark"]`, values from Global Constraints; `@import` Fraunces + Literata from Google Fonts; tiles with soft, slightly irregular `border-radius` (e.g. different radii per corner), growth tint per `data-size` (pale → deep green), no tape/rotation; filter chips as pills with `aria-pressed` styling; `.garden-dates`, `.garden-stage`, backlinks and `.stream-item` (stream folders keep their markup) restyled; mobile (≤ 520px) bed collapses to 1-2 columns.
- [ ] **Step 2:** `bun test tests/styles.test.ts` — PASS (scoping still holds).
- [ ] **Step 3:** Docs, README, `cli.ts` template, CHANGELOG. Run `bun test tests/docs.test.ts tests/cli.test.ts` if they cover these files — PASS.
- [ ] **Step 4:** Visual check: `bun bin/datme.ts dev tests/fixtures/garden` (or `bun run screenshots` after adding a garden shot), look at home light/dark, a note, a tag page, at desktop and 375px width. Confirm against the anti-goal: no post timeline, no cover images, no single column of entries on desktop. Record what was checked in the commit body only if something was decided.
- [ ] **Step 5:** Full verification: `bun test`, `bun run check`, pre-commit hooks — all pass; `git diff --stat HEAD~1 -- CHANGELOG.md` shows the entry.
- [ ] **Step 6: Commit** `feat(garden): give the garden its colours and type`.
