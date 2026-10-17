# Layout Looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A note's `layout` picks a default style and navigation frame, any note can override them with `style:` and `chrome:`, and two new styles — `resume` for `cv`, `darkroom` for `gallery` — give those pages a look of their own.

**Architecture:** `src/lib/look.ts` grows from folder rules to the spec's four tiers (note property → layout default → folders/classic → site), plus `frameOf(note)` for the frame and a per-layout defaults table. `Base.astro` takes a `frame` and renders a thin bar instead of the full header and rails under `minimal`; a scheme hint makes `darkroom` start dark. `resume` and `darkroom` are two scoped stylesheets like `garden.css`.

**Tech Stack:** Astro, TypeScript, Bun (`bun test`, `bun run check`), plain CSS, Playwright (screenshots only).

**Spec:** `docs/superpowers/specs/2026-10-17-garden-style-design.md` — sections "Page layouts: style and chrome per note", "Layout defaults", "Layout styles: `resume` and `darkroom`", "`Base.astro`", "Tests for this part". This plan is steps 2 and 3 of its "Order of work".

## Global Constraints

- Branch `feat/layout-looks`, from `feat/garden-style` (needs `src/lib/look.ts`, `STYLES`). Page layouts are on `main` since `12eea4f`.
- `STYLES` becomes `["notebook", "classic", "garden", "resume", "darkroom"]`. `library` and `vault` do not exist yet: `books`/`movies`/`shelf` default to the site's resolved style (leave a one-line comment where `library` will go).
- Note properties: `style:` accepts any of `STYLES`; `chrome:` accepts only `full` and `minimal`. Unknown values give a build warning through `report("warning", …)` in `src/lib/vault.ts` (same pattern and `lang === site.defaultLang` gate as `layout`) and are ignored.
- Style precedence, highest first: note `style` → layout default → `appearance.folders`/`classic` (longest match) → `appearance.style`. Frame: note `chrome` → layout default → `full`.
- Internal frame value `full-norail` (header and left sidebar, no TOC/graph rail, no stack toggle) is reachable only through a layout default.
- Layout defaults, verbatim from the spec: `cv` → `resume` + `minimal`; `links` → `classic` + `minimal`; `gallery` → `darkroom` + `minimal`; `timeline`, `now`, `uses`, `quotes` → site style + `full-norail`; `faq` → site style + `full`; `projects`, `talks`, `recipes`, `places` → site style + `full-norail`; `shelf`, `books`, `movies` → site style + `full-norail`. A layout with no row: site style, `full`.
- "Dark by default" belongs to the `darkroom` style (not to `gallery`): when the reader has no stored choice the page starts dark, even if `theme.scheme` is `light`; a stored choice wins; the toggle works.
- `minimal` frame: one thin bar with site name/logo linking home plus the light/dark toggle; no main nav, no search trigger, no random/graph/due/prefs/reader/sidebar/stack buttons, no left sidebar, no right rail, no breadcrumbs, no search or graph dialogs; footer reduced to one line. Markup is not rendered at all (not merely hidden).
- A folder page whose folder note has a layout (and is not protected) takes its style and frame from that folder note; otherwise `lookOfDir`.
- Under `resume`/`darkroom`, home/folder/tag pages use the classic markup with that style's colours (nothing to build: classic is the fall-through branch).
- Every rule in `resume.css` is scoped to `[data-look="resume"]`, in `darkroom.css` to `[data-look="darkroom"]`; existing looks must not change.
- Commits: Conventional Commits, no agent trailers; CHANGELOG line under `## [Unreleased]` in the same commit as each user-visible change; never `--no-verify`. Run git as `/usr/bin/git`.
- Last step of the plan: rebase onto the latest `main`, rerun `bun test` and `bun run check`; push the rebased branch under a new name rather than force-pushing (user rule).

## Review Focus

1. **`style:` or `chrome:` with odd spelling** (`Garden`, ` minimal `): normalised like `layout` (trim, lower-case) and accepted. Test in Task 1.
2. **A `cv` note that is protected**: keeps the normal note head (layouts behaviour) and still renders under `resume` with `minimal`. Test in Task 4 (fixture `CV locked.md` with a password, assert `data-look="resume"` and `class="note-head"`).
3. **Reader with a stored theme on a darkroom page**: stored `light` beats the dark default. Test in Task 3 by asserting the inline script's order (stored value is read before `data-scheme-default`): unit-test the extracted `initialTheme(stored, schemeDefault, siteScheme, prefersDark)` helper.
4. **Keyboard shortcuts on a `minimal` page** (Ctrl+K, `/`, Ctrl+G): no dialogs are rendered, so they must do nothing and not throw — `openSearch()`/`openGraph()` already return when their dialog is missing; Task 3 asserts the dialogs are absent and that `app.ts` is still loaded.
5. **Gallery made from a base** (`Covers.md`): its cover images carry no width/height; justified rows must not collapse them. Task 5 sizes items without an aspect ratio with a fixed fallback ratio and checks `Covers/index.html` in a screenshot.

---

### Task 1: Style and chrome properties on notes

**Files:**
- Modify: `src/site.config.ts` (`STYLES` gains `resume`, `darkroom`)
- Modify: `src/lib/pwa.ts` (`THEME_COLOR` entries for the two styles)
- Modify: `src/lib/look.ts` (option lists and parser)
- Modify: `src/lib/vault.ts` (Note fields `style?`, `chrome?`, read near `layout`, l.~760 and ~852)
- Test: `tests/look.test.ts`, `tests/pwa.test.ts`

**Interfaces:**
- Produces in `src/lib/look.ts`:
  - `export const CHROMES = ["full", "minimal"] as const`, `export type Chrome = (typeof CHROMES)[number]`, `export type Frame = Chrome | "full-norail"`
  - `export function pickOption<T extends string>(value: unknown, options: readonly T[]): { value?: T; invalid?: string }` — strings are trimmed and lower-cased; a non-empty string not in `options` returns `{ invalid: <original string> }`; anything else `{}`.
- Produces on `Note` (vault.ts): `style?: Style`, `chrome?: Chrome`, each with a one-line doc comment like `layout`'s. Warning text: `style "<raw>" is not one of <STYLES joined>, so the note keeps its usual style` and `chrome "<raw>" is not one of full, minimal, so the note keeps its usual frame`.
- `THEME_COLOR.resume = { light: "#e9e7e2", dark: "#1b1c1e" }` (desk colours), `THEME_COLOR.darkroom = { light: "#f4f2ee", dark: "#0b0b0b" }`.

- [ ] **Step 1: Failing tests** in `tests/look.test.ts`:

```ts
describe("pickOption", () => {
  test("normalises like layout", () => {
    expect(pickOption(" Garden ", STYLES)).toEqual({ value: "garden" })
    expect(pickOption("MINIMAL", CHROMES)).toEqual({ value: "minimal" })
  })
  test("flags unknown strings and ignores the rest", () => {
    expect(pickOption("fancy", STYLES)).toEqual({ invalid: "fancy" })
    expect(pickOption("full-norail", CHROMES)).toEqual({ invalid: "full-norail" })
    expect(pickOption(undefined, STYLES)).toEqual({})
    expect(pickOption(3, STYLES)).toEqual({})
    expect(pickOption("", STYLES)).toEqual({})
  })
})
```

`tests/pwa.test.ts` already asserts `THEME_COLOR` keys equal `STYLES`; it must keep passing.
- [ ] **Step 2: Run** `bun test tests/look.test.ts tests/pwa.test.ts` — FAIL.
- [ ] **Step 3: Implement** the list change, `THEME_COLOR`, `pickOption`, and the two Note fields with warnings in vault.ts. `bun run check` must stay clean: every `look ===` branch already falls through to classic markup; confirm Home/Folder/Tag pages compile with the wider `Style`.
- [ ] **Step 4: Run** `bun test tests/look.test.ts tests/pwa.test.ts tests/vault.test.ts`, then full `bun test`, `bun run check` — PASS.
- [ ] **Step 5: Commit** `feat(notes): add style and chrome properties` (CHANGELOG `### Added`: notes can set `style:` and `chrome:`).

---

### Task 2: Layout defaults and the four-tier resolution

**Files:**
- Modify: `src/lib/look.ts`
- Modify: `src/components/pages/NotePage.astro` (compute `frame`), `src/components/pages/FolderPage.astro` (folder note's look)
- Test: `tests/look.test.ts`

**Interfaces:**
- Consumes: `pickOption`, `Frame`, Note `style`/`chrome`/`layout` (Task 1).
- Produces in `look.ts`:
  - `export interface LayoutLook { style?: Style; frame: Frame }` (no `style` = site's resolved style)
  - `export const LAYOUT_LOOKS: Partial<Record<Layout, LayoutLook>>` with exactly the rows in Global Constraints (`faq` → `{ frame: "full" }`).
  - `lookOf(note: Pick<Note, "dir" | "style" | "layout"> | undefined): Style` — four tiers.
  - `export function frameOf(note: Pick<Note, "chrome" | "layout"> | undefined): Frame`.
  - `export function startsDark(look: Style): boolean` — `look === "darkroom"`.
- FolderPage: `const owner = folder.folderNote && !folder.folderNote.protected ? folder.folderNote : undefined`; `look = owner ? lookOf(owner) : lookOfDir(folder.dir)`; `frame = owner ? frameOf(owner) : "full"`.

- [ ] **Step 1: Failing tests:**

```ts
describe("lookOf with notes", () => {
  test("note style beats layout, layout beats folders", () => {
    expect(lookOf({ dir: "07_Project", layout: "cv" })).toBe("resume")
    expect(lookOf({ dir: "07_Project", layout: "cv", style: "garden" })).toBe("garden")
    expect(lookOf({ dir: "07_Project", layout: "projects" })).toBe("classic") // folder rule, layout has no style
    expect(lookOf({ dir: "03_Atomic", layout: "gallery" })).toBe("darkroom")
    expect(lookOf({ dir: "03_Atomic", style: "garden" })).toBe("garden")
  })
})
describe("frameOf", () => {
  test("note chrome beats the layout default, which beats full", () => {
    expect(frameOf({ layout: "cv" })).toBe("minimal")
    expect(frameOf({ layout: "cv", chrome: "full" })).toBe("full")
    expect(frameOf({ layout: "timeline" })).toBe("full-norail")
    expect(frameOf({ layout: "faq" })).toBe("full")
    expect(frameOf({ chrome: "minimal" })).toBe("minimal")
    expect(frameOf({})).toBe("full")
    expect(frameOf(undefined)).toBe("full")
  })
  test("every layout has a row, and rows only use known values", () => {
    for (const l of LAYOUTS) expect(LAYOUT_LOOKS[l]).toBeDefined()
  })
})
```

(`07_Project` is a classic folder in the main fixture; `03_Atomic` is notebook.)
- [ ] **Step 2: Run** `bun test tests/look.test.ts` — FAIL.
- [ ] **Step 3: Implement**; NotePage keeps `look = lookOf(note)` and adds `const frame = frameOf(note)` (passed to Base in Task 3); FolderPage per Interfaces.
- [ ] **Step 4: Run** `bun test tests/look.test.ts tests/build.test.ts tests/page-layouts.test.ts`, full `bun test`, `bun run check` — PASS. Existing layouts pages now carry `data-look="resume"`/`"darkroom"`/`"classic"` for cv/gallery/links: update any page-layouts assertion that pinned the old look, keeping its intent.
- [ ] **Step 5: Commit** `feat(look): let layouts and notes choose their style` (CHANGELOG `### Added`: layouts pick a fitting style by default).

---

### Task 3: Frames: minimal and full-norail in Base, and the dark-first scheme

**Files:**
- Modify: `src/layouts/Base.astro` (prop `frame?: Frame`, default `"full"`; `data-chrome={frame}` on `<html>`; `data-scheme-default="dark"` when `startsDark(look)`; inline theme script order)
- Create: `src/lib/theme-init.ts` (pure helper mirrored by the inline script)
- Modify: `src/components/pages/NotePage.astro` (`frame` to Base; `rail={frame === "full"}`; no `<Breadcrumbs>` when `frame === "minimal"`), `src/components/pages/FolderPage.astro` (`frame` to Base; no breadcrumbs under minimal)
- Modify: `src/styles/global.css` (`[data-chrome="minimal"]` bar and one-line footer; small, frame-only rules), `src/styles/print.css` (generalise `.layout-cv .crumbs` to also cover minimal if still needed)
- Test: `tests/theme-init.test.ts`, `tests/page-layouts.test.ts`

**Interfaces:**
- Consumes: `frameOf`, `startsDark`, `Frame` (Tasks 1-2).
- Produces: `export function initialTheme(stored: string | null, schemeDefault: string | undefined, siteScheme: string | undefined, prefersDark: boolean): "light" | "dark"` in `src/lib/theme-init.ts` — order: stored (`light`/`dark`) → `schemeDefault` → `siteScheme` → system. The inline script in Base must implement the same order (it cannot import; keep a comment pointing to the helper, and keep its other duties unchanged).
- Base under `frame === "minimal"` renders: `<header class="site-header site-bar">` with `a.brand` and the `[data-theme-toggle]` button only; no `aside.sidebar-left`, no rail, no `dialog[data-search-dialog]`, no `dialog[data-graph-dialog]`; footer with only its first line. Under `"full-norail"`: as today with `rail` false.

- [ ] **Step 1: Failing tests.** `tests/theme-init.test.ts`:

```ts
test("a stored choice wins, then the page's default, then the site, then the system", () => {
  expect(initialTheme("light", "dark", "dark", true)).toBe("light")
  expect(initialTheme(null, "dark", "light", false)).toBe("dark")
  expect(initialTheme(null, undefined, "light", true)).toBe("light")
  expect(initialTheme(null, undefined, undefined, true)).toBe("dark")
  expect(initialTheme("bogus", undefined, undefined, false)).toBe("light")
})
```

In `tests/page-layouts.test.ts` (fixture `tests/fixtures/layouts`):

```ts
test("a résumé and a link page stand alone", () => {
  for (const [page, look] of [["CV/index.html", "resume"], ["Links/index.html", "classic"]] as const) {
    const html = read(page)
    expect(html).toContain(`data-look="${look}"`)
    expect(html).toContain('data-chrome="minimal"')
    for (const gone of ['class="main-nav"', "data-open-search", "sidebar-left", "sidebar-right", 'class="crumbs"', "data-search-dialog", "data-graph-dialog"])
      expect(html).not.toContain(gone)
    expect(html).toContain("data-theme-toggle")
  }
})
test("a gallery starts dark", () => {
  const html = read("Photos/index.html")
  expect(html).toContain('data-look="darkroom"')
  expect(html).toContain('data-scheme-default="dark"')
})
test("collections and timelines keep the header but drop the rail", () => {
  for (const page of ["Life/index.html", "Projects/index.html"]) {
    const html = read(page)
    expect(html).toContain('data-chrome="full-norail"')
    expect(html).toContain('class="main-nav"')
    expect(html).not.toContain("sidebar-right")
  }
  expect(read("FAQ/index.html")).toContain('data-chrome="full"')
})
test("a note can override its layout's style and frame", () => {
  const html = read("Styled-CV/index.html")
  expect(html).toContain('data-look="garden"')
  expect(html).toContain('data-chrome="full"')
})
```

Add fixture `tests/fixtures/layouts/Styled CV.md` (`layout: cv`, `style: garden`, `chrome: full`, a role and one `##` section). Check the `article()` helper (matches up to `<aside`) still finds its end on minimal pages, which have no aside: change it to stop at `</article>` if needed, keeping other tests' intent.
- [ ] **Step 2: Run** `bun test tests/theme-init.test.ts tests/page-layouts.test.ts` — FAIL.
- [ ] **Step 3: Implement** per Interfaces. Confirm by reading `src/scripts/app.ts` and `prefs.ts` that nothing throws without header/sidebar/dialogs (exploration found all lookups guarded).
- [ ] **Step 4: Run** the two files, `tests/build.test.ts`, full `bun test`, `bun run check` — PASS.
- [ ] **Step 5: Commit** `feat(layouts): give standalone pages a minimal frame` (CHANGELOG `### Added`: `chrome: minimal`, résumé and link pages stand alone, galleries start dark).

---

### Task 4: The `resume` style

**Files:**
- Create: `src/styles/resume.css` (import in `Base.astro` after `garden.css`)
- Modify: `src/styles/print.css` (resume prints on white paper, dark ink, in both schemes; no desk, no shadow)
- Create: `tests/fixtures/layouts/CV locked.md` (`layout: cv`, a `password:` per `docs/privacy.md`)
- Test: `tests/styles.test.ts`, `tests/page-layouts.test.ts`

**Interfaces:**
- Consumes: markup from `src/components/CvHead.astro` (`header.cv-head > img.cv-photo, div.cv-id > h1.note-title, p.cv-role, p.cv-contact; button.cv-print`), `cvHtml` sections in `src/lib/note-layouts.ts` (read it for the section markup), `article.note.layout-cv`, `[data-chrome="minimal"]` bar from Task 3.
- Values from the spec: on screen an A4 sheet (`210mm` wide, scaled down on narrow screens) centred on a light grey desk with a soft shadow; two columns — left: the CV head; right: summary and `##` sections with headings in the margin; one column on phones; sans-serif type (`--font-ui` family), one accent for section headings and links; dark mode: dark grey sheet on a darker desk, still one sheet; print: exactly the sheet, white paper, dark ink, even in dark mode.

- [ ] **Step 1: Failing tests.** `tests/styles.test.ts`: every selector in `resume.css` starts with `[data-look="resume"]` (reuse the garden scoping check, generalised to a helper taking file and look). `print.css` contains a `[data-look="resume"]` rule. `tests/page-layouts.test.ts`: `CV-locked/index.html` (slug of `CV locked.md`; verify the real slug) contains `data-look="resume"` and `class="note-head"` (protected CV keeps the normal head).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `bun test tests/styles.test.ts tests/page-layouts.test.ts`, full `bun test`, `bun run check` — PASS.
- [ ] **Step 5: Visual check.** Build `tests/fixtures/layouts` into `/Users/dynamo/.claude/jobs/62013c44/tmp/layout-shots/site` and screenshot `CV/` and `CV-locked/` at 1280 and 375 px, light and dark, plus print emulation (`page.emulateMedia({ media: "print" })`), into `/Users/dynamo/.claude/jobs/62013c44/tmp/layout-shots/`. Look at them: reads as one sheet on a desk, two columns on desktop, one on phone, white paper in print even from dark.
- [ ] **Step 6: Commit** `feat(cv): add the resume style` (CHANGELOG `### Added`).

---

### Task 5: The `darkroom` style

**Files:**
- Create: `src/styles/darkroom.css` (import in `Base.astro` after `resume.css`)
- Test: `tests/styles.test.ts`, `tests/page-layouts.test.ts`

**Interfaces:**
- Consumes: gallery markup from `galleryHtml`/`galleryOfNotes` in `src/lib/note-layouts.ts` (`div.gallery-grid > figure.gallery-item > img (+ a.internal wrapper for base covers) + figcaption`); note images from markdown carry `width`/`height`; base covers do not. Lightbox markup from `src/scripts/lightbox.ts` (`dialog.lightbox`, `figure`, `figcaption`, `.lightbox-btn`); its backdrop is styled in `global.css:~2366`.
- Values from the spec: near-black background, text and rules in neutral greys only, no accent colour (links keep an underline as the non-colour cue); justified rows of equal height filling almost the full width with thin gaps; captions small, under each picture on phones, on hover/focus on larger screens (always reachable by keyboard); lightbox on pure black; light mode is a "gallery wall" (off-white, same neutral greys); headings in a gallery note are quiet small-caps labels above each grid.
- Justified rows: CSS only — `.gallery-grid { display: flex; flex-wrap: wrap }`, each `.gallery-item` gets `flex-grow` and `flex-basis` from its image's aspect ratio. Since CSS cannot read `width`/`height` attributes into flex values, set a custom property per item at build time: **modify `galleryHtml`** to add `style="--ar: <w/h>"` on `figure.gallery-item` when the `<img>` has `width` and `height`, and leave it unset otherwise (CSS falls back to `--ar: 1.5`). This is the one allowed edit to `src/lib/note-layouts.ts`; add a unit test for it in `tests/page-layouts.test.ts`'s transform block (`galleryHtml('<p><img src="a.jpg" width="300" height="200"></p>')` contains `style="--ar: 1.5"`; without size no `style`).

- [ ] **Step 1: Failing tests:** scoping of `darkroom.css` (helper from Task 4); the `--ar` unit test; `Photos/index.html` contains `--ar:`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `bun test tests/styles.test.ts tests/page-layouts.test.ts`, full `bun test`, `bun run check` — PASS.
- [ ] **Step 5: Visual check** (same tool and directory as Task 4): `Photos/` and `Covers/` at 1280 and 375 px, dark (default) and light, one shot with the lightbox open. Judge: rows of equal height filling the width, nothing tinted, captions reachable, base covers not collapsed.
- [ ] **Step 6: Commit** `feat(gallery): add the darkroom style` (CHANGELOG `### Added`).

---

### Task 6: Docs

**Files:**
- Modify: `docs/writing.md` (properties table: `style`, `chrome`; "Page layouts" section: each layout's default style and frame, as one short table), `docs/configuration.md` (style values list: add `resume`, `darkroom`, "made for a single page"), `README.md` if it lists styles, `src/cli.ts` init template comment if it lists styles.
- Test: `bun test tests/docs.test.ts tests/cli.test.ts`

- [ ] **Step 1:** Write the docs. **Step 2:** Run the two test files and full `bun test` — PASS. **Step 3: Commit** `docs(layouts): document styles and frames per note` (tidy the CHANGELOG lines from Tasks 1-5 into reader-facing wording in this commit if needed).

---

### Final step (controller): rebase onto main

After the final whole-branch review is clean: `/usr/bin/git fetch` if `main` has a remote counterpart, `/usr/bin/git rebase main`, resolve conflicts in favour of `main`'s behaviour plus this branch's additions, rerun `bun test` and `bun run check`, then push as a new branch name if `feat/layout-looks` was already pushed (no force-push). Same for `feat/garden-style` if the user wants it current.
