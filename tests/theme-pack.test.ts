import { afterAll, afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { APIContext } from "astro"
import { resolveConfig, site, ConfigError, STYLES, type SiteConfig } from "../src/site.config"
import { fontFaces, loadPack, packCandidates, packFiles } from "../src/lib/theme-pack"
import { baseStyle } from "../src/lib/look"
import { fontsHref, packSheets, packStyleSheets } from "../src/lib/theme"
import { parseYaml } from "../src/lib/yaml"
import * as route from "../src/pages/theme/[...path]"

const looks = path.resolve(import.meta.dir, "fixtures/look-mechanisms")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-packs-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Writes files under `dir`, making their folders. */
function write(dir: string, files: Record<string, string>): string {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

describe("where a preset is looked for", () => {
  const vault = path.join(tmp, "where")
  test("a folder of the vault, which must stay in it", () => {
    expect(packCandidates("./themes/ink", vault, [])).toEqual([path.join(vault, "themes/ink")])
    expect(packCandidates("themes/ink", vault, [])).toEqual([path.join(vault, "themes/ink")])
    expect(packCandidates("../ink", vault, [])).toBe("theme.preset: ../ink is outside the vault; install the theme as a package instead")
    expect(packCandidates("/etc", vault, [])).toContain("outside the vault")
    expect(packCandidates(".", vault, [])).toContain("outside the vault")
  })
  test("a name: .datme/themes of the vault, then datme-theme-<name> in node_modules up from each root", () => {
    const found = packCandidates("ink", vault, [vault]) as string[]
    expect(found[0]).toBe(path.join(vault, ".datme/themes/ink"))
    expect(found[1]).toBe(path.join(vault, "node_modules/datme-theme-ink"))
    expect(found.at(-1)).toBe(path.join(path.parse(vault).root, "node_modules/datme-theme-ink"))
    expect((packCandidates("datme-theme-ink", vault, [vault]) as string[])[1]).toBe(path.join(vault, "node_modules/datme-theme-ink"))
  })
  test("a scoped package is only a package; a name that is neither is refused", () => {
    expect((packCandidates("@me/ink", vault, [vault]) as string[])[0]).toBe(path.join(vault, "node_modules/@me/ink"))
    expect(packCandidates("bad name!", vault, [])).toBe('theme.preset: "bad name!" is neither a folder of the vault nor a package name')
  })
})

describe("loadPack", () => {
  test("a missing pack says where it was looked for", () => {
    const vault = path.join(tmp, "missing")
    expect(loadPack("ink", vault, []).warnings).toEqual(["theme.preset: no theme.yaml in .datme/themes/ink or a datme-theme-ink package, so the site keeps its own theme"])
    expect(loadPack("@me/ink", vault, []).warnings[0]).toContain("no theme.yaml in a @me/ink package")
    expect(loadPack("themes/ink", vault, []).warnings[0]).toContain("no theme.yaml in themes/ink")
    expect(loadPack("../x", vault, []).warnings[0]).toContain("outside the vault")
  })
  test("a theme.yaml that cannot be read keeps the site's own theme", () => {
    const vault = write(path.join(tmp, "broken"), { "a/theme.yaml": "accent: [", "b/theme.yaml": "- a list", "c/theme.yaml": "# nothing" })
    expect(loadPack("./a", vault, []).warnings[0]).toStartWith("theme ./a: theme.yaml is not valid YAML, so the site keeps its own theme:")
    expect(loadPack("./b", vault, [])).toEqual({ warnings: ["theme ./b: theme.yaml holds no settings, so the site keeps its own theme"] })
    expect(loadPack("./c", vault, []).pack?.css).toEqual([])
  })
  test("the fixture's pack: its settings, styles and own fonts, and a warning for each mistake", () => {
    const { pack, warnings } = loadPack("ink", looks, [])
    expect(pack).toMatchObject({
      preset: "ink",
      dir: path.join(looks, ".datme/themes/ink"),
      file: ".datme/themes/ink/theme.yaml",
      style: "ink",
      css: ["ink.css"],
      styles: { ink: { base: "classic", css: ["paper.css"] } },
      fonts: ["Ink Serif"],
    })
    expect(Object.keys(pack!.theme)).toEqual(["accent", "fonts", "mermaid"])
    expect(warnings).toEqual([
      "theme ink: theme.yaml has no setting colour, so it is ignored",
      "theme ink: css: ../../stray.css is outside the theme's folder, so it is left out",
      "theme ink: css: missing.css is not in the theme, so it is left out",
      "theme ink: css: theme.js is not a .css file, so it is left out",
      "theme ink: styles.ink.templates.note-row: <script> is not an element a template can hold, so it is left out with what it holds",
      "theme ink: styles.ink.templates.note-row: <img>: the attribute onerror is not one a template can set, so it is left out",
      "theme ink: styles.Bad Name: a style's name is lower-case letters, digits and -, so it is left out",
      // A note's footer is never given its text.
      "theme ink: templates.note-footer: {{excerpt}} is not a field of note-footer (siteTitle, home, lang, title, url, date, datetime, stage, stageIcon, author, locked, tags), so it is left out",
      "theme ink: templates.sidebar: is no slot of datme (header-brand, note-card, note-row, note-footer, footer-band), so it is left out",
    ])
    expect(Object.keys(pack!.templates!)).toEqual(["footer-band", "note-footer"])
    expect(Object.keys(pack!.styles.ink.templates!)).toEqual(["note-card", "note-row"])
  })
  test("styles need a map, a base and file names; a link out of the pack is refused", () => {
    const vault = write(path.join(tmp, "styles"), {
      "outside.css": "a{}",
      "p/theme.yaml": "styles: [ink]",
      "q/theme.yaml": "styles: { ink: classic, wide: { base: notebook, css: [3] }, linked: { base: classic, css: link.css } }",
    })
    fs.symlinkSync(path.join(vault, "outside.css"), path.join(vault, "q/link.css"))
    expect(loadPack("./p", vault, []).warnings).toEqual(["theme ./p: styles must map a style's name to its base and stylesheets"])
    const q = loadPack("./q", vault, [])
    expect(q.pack?.styles).toEqual({ wide: { base: "notebook", css: [] }, linked: { base: "classic", css: [] } })
    expect(q.warnings).toEqual([
      "theme ./q: styles.ink: needs a base, the built-in style it builds on, so it is left out",
      "theme ./q: styles.wide.css: 3 is not a file name, so it is left out",
      "theme ./q: styles.linked.css: link.css is outside the theme's folder, so it is left out",
    ])
  })
  test("a pack installed as a package, outside the vault, is reported against datme.yaml", () => {
    const root = write(path.join(tmp, "pkg"), { "node_modules/datme-theme-sea/theme.yaml": "accent: teal", "vault/datme.yaml": "" })
    const { pack } = loadPack("sea", path.join(root, "vault"), [root])
    expect(pack?.dir).toBe(path.join(root, "node_modules/datme-theme-sea"))
    expect(pack?.file).toBe("datme.yaml")
  })
})

describe("templates of a pack", () => {
  test("a map of slots to .html files of the pack, compiled; each mistake is a warning", () => {
    const vault = write(path.join(tmp, "templates"), {
      "outside.html": "<p>x</p>",
      "a/theme.yaml": "templates: [card.html]",
      "b/theme.yaml": "templates: { note-card: card.htm, footer-band: missing.html, note-footer: link.html, header-brand: brand.html }\nstyles: { sea: { base: classic, templates: { note-card: card.html } }, dry: { base: classic, templates: {} } }",
      "b/card.htm": "",
      "b/card.html": "<p>{{title}}</p>",
      "b/brand.html": "<b>{{siteTitle}}</b>",
    })
    fs.symlinkSync(path.join(vault, "outside.html"), path.join(vault, "b/link.html"))
    expect(loadPack("./a", vault, [])).toMatchObject({ warnings: ["theme ./a: templates must map a slot (header-brand, note-card, note-row, note-footer, footer-band) to an .html file, so it is left out"] })
    expect(loadPack("./a", vault, []).pack?.templates).toBeUndefined()
    const { pack, warnings } = loadPack("./b", vault, [])
    expect(warnings).toEqual([
      "theme ./b: templates.note-card: card.htm is not a .html file, so it is left out",
      "theme ./b: templates.footer-band: missing.html is not in the theme, so it is left out",
      "theme ./b: templates.note-footer: link.html is outside the theme's folder, so it is left out",
    ])
    expect(Object.keys(pack!.templates!)).toEqual(["header-brand"])
    expect(pack!.styles.sea.templates!["note-card"]).toEqual([{ kind: "element", tag: "p", attrs: [], children: [{ kind: "text", parts: [{ field: "title" }] }] }])
    // A style whose templates are all left out has none.
    expect(pack!.styles.dry).toEqual({ base: "classic", css: [] })
    // Templates are read at build time, never published.
    expect(packFiles(path.join(vault, "b"))).toEqual([])
  })
  test("a style with templates of its own is no choice of the reader switch", () => {
    const vault = write(path.join(tmp, "switch"), {
      ".datme/themes/t/theme.yaml": "styles: { sea: { base: classic, templates: { note-card: c.html } }, sky: { base: classic } }",
      ".datme/themes/t/c.html": "<p>{{title}}</p>",
    })
    const c = resolveConfig({ theme: { preset: "t" }, appearance: { readerSwitch: ["sea", "sky", "garden"] } }, vault)
    expect(c.appearance.readerSwitch).toEqual(["sky", "garden"])
    expect(c.warnings).toEqual([{ file: "datme.yaml", message: "appearance.readerSwitch: sea has templates of its own that reshape its pages, so readers cannot pick it" }])
    expect(resolveConfig({ theme: { preset: "t" }, appearance: { readerSwitch: true } }, vault).appearance.readerSwitch.at(-1)).toBe("sky")
  })
})

describe("fontFaces and packFiles", () => {
  test("families of @font-face rules, quoted or not", () => {
    expect(fontFaces(`@font-face { font-family: "A B"; } @font-face{src:url(x);font-family:C} p { font-family: D }`)).toEqual(["A B", "C"])
  })
  test("only stylesheets, fonts and pictures, outside hidden folders, node_modules and links", () => {
    const dir = write(path.join(tmp, "files"), {
      "a.css": "",
      "fonts/b.woff2": "",
      "img/c.PNG": "",
      "d.svg": "",
      "e.js": "",
      "theme.yaml": "",
      ".git/f.css": "",
      "node_modules/x/g.css": "",
    })
    fs.symlinkSync(path.join(dir, "a.css"), path.join(dir, "h.css"))
    expect(packFiles(dir)).toEqual(["a.css", "fonts/b.woff2", "img/c.PNG"])
  })
})

describe("theme.preset in datme.yaml", () => {
  const config = () => parseYaml(fs.readFileSync(path.join(looks, "datme.yaml"), "utf8")) as Record<string, Record<string, unknown>>
  test("the pack fills what theme: leaves out, and its styles join datme's", () => {
    const c = resolveConfig(config(), looks)
    expect(c.theme.preset).toBe("ink")
    expect(c.theme.accent).toBe("#2d6a4f")
    expect(c.theme.fonts).toEqual({ heading: "Fraunces", body: "Ink Serif" })
    expect(c.theme.mermaid).toEqual({ light: "neutral", dark: "dark" })
    expect(c.styles).toEqual([...STYLES, "ink"])
    expect(c.pack).toMatchObject({ dir: path.join(looks, ".datme/themes/ink"), css: ["ink.css"], fonts: ["Ink Serif"], styles: { ink: { base: "classic", css: ["paper.css"] } } })
    expect(Object.keys(c.pack!.templates!)).toEqual(["footer-band", "note-footer"])
    expect(c.appearance.folders).toEqual({ Ink: "ink" })
    // The pack's style has templates of its own, so readers cannot pick it.
    expect(c.appearance.readerSwitch).toEqual(["notebook", "classic", "garden", "terminal", "blueprint", "manuscript", "lacquer", "zine"])
    // appearance.style is set, so the pack's style is not the site's.
    expect(c.appearance.style).toBe("classic")
    expect(c.warnings.map((w) => w.file)).toEqual(Array(10).fill(".datme/themes/ink/theme.yaml"))
    expect(c.warnings.at(-1)!.message).toStartWith("theme ink: mermaid: ")
  })
  test("datme.yaml's fonts beat the pack's one family at a time; its style is the site's unless one is set", () => {
    const raw = config()
    const c = resolveConfig({ theme: { preset: "ink", fonts: { body: "Literata" } } }, looks)
    expect(c.theme.fonts).toEqual({ heading: "Fraunces", body: "Literata" })
    expect(c.appearance.style).toBe("ink")
    expect(raw.theme.preset).toBe("ink")
    expect(() => resolveConfig({ theme: { preset: "ink", fonts: "Literata" } }, looks)).toThrow(ConfigError)
  })
  test("a pack's style or styles that datme cannot use are warnings", () => {
    const vault = write(path.join(tmp, "odd"), {
      ".datme/themes/a/theme.yaml": "style: neon\nstyles: { classic: { base: notebook }, sea: { base: library }, cv: { base: resume } }",
      ".datme/themes/b/theme.yaml": "style: 3",
    })
    const c = resolveConfig({ theme: { preset: "a" } }, vault)
    expect(c.styles.at(-1)).toBe("cv")
    expect(c.warnings.map((w) => w.message)).toEqual([
      "theme a: styles.classic: a built-in style has that name, so it is left out",
      `theme a: styles.sea: base library is not one of ${STYLES.join(", ")}, so it is left out`,
      'theme a: style "neon" is no style of datme or of the theme, so it is ignored',
    ])
    expect(c.appearance.style).toBe("notebook")
    expect(resolveConfig({ theme: { preset: "b" } }, vault).warnings[0].message).toContain("style 3 is no style")
    // A style built on a résumé is no style for a whole site.
    expect(resolveConfig({ theme: { preset: "a" }, appearance: { readerSwitch: true } }, vault).appearance.readerSwitch).toEqual(["notebook", "classic", "garden", "terminal", "blueprint", "manuscript", "lacquer", "zine"])
    expect(() => resolveConfig({ theme: { preset: "a" }, appearance: { readerSwitch: ["cv"] } }, vault)).toThrow("cv is made for a single page")
  })
  test("a preset not found is a warning against datme.yaml; no preset reads nothing", () => {
    const c = resolveConfig({ theme: { preset: "nowhere" } }, path.join(tmp, "none"))
    expect(c.warnings).toEqual([{ file: "datme.yaml", message: expect.stringContaining("no theme.yaml in .datme/themes/nowhere") }])
    expect(c.pack).toBeUndefined()
    expect(resolveConfig({ theme: {} }, "/v").warnings).toEqual([])
    expect(() => resolveConfig({ theme: "x" }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig("x", "/v")).toThrow(ConfigError)
  })
})

/** Change some settings for the length of a test; restored after each one. */
const saved: Partial<SiteConfig>[] = []
function setSite(patch: Partial<SiteConfig>): void {
  saved.push(Object.fromEntries(Object.keys(patch).map((k) => [k, site[k as keyof SiteConfig]])) as Partial<SiteConfig>)
  Object.assign(site, patch)
}
afterEach(() => {
  while (saved.length) Object.assign(site, saved.pop())
})

describe("a pack on the site", () => {
  const pack = { dir: path.join(looks, ".datme/themes/ink"), css: ["ink.css"], fonts: ["Ink Serif"], styles: { ink: { base: "classic", css: ["paper.css"] } } }
  test("a style draws as its base", () => {
    expect(baseStyle("ink", pack)).toBe("classic")
    expect(baseStyle("garden", pack)).toBe("garden")
    // Without the pack, the name is taken as it is.
    expect(baseStyle("ink") as string).toBe("ink")
  })
  test("its stylesheets are linked from /theme/, and its own fonts never fetched from Google", () => {
    expect(packSheets()).toEqual([])
    setSite({ pack, theme: { ...site.theme, fonts: { heading: "Fraunces", body: "Ink Serif" } } })
    expect(packSheets()).toEqual(["/theme/ink.css"])
    expect(packStyleSheets("ink")).toEqual(["/theme/paper.css"])
    expect(packStyleSheets("garden")).toEqual([])
    expect(fontsHref()).not.toContain("Ink")
  })
  test("/theme/ publishes its stylesheets, fonts and pictures only", async () => {
    const call = (p: string) => route.GET({ params: { path: p } } as unknown as APIContext)
    expect(route.getStaticPaths()).toEqual([])
    expect((await call("ink.css")).status).toBe(404)
    setSite({ pack })
    expect(route.getStaticPaths().map((p) => p.params.path)).toEqual(["fonts/ink.woff2", "ink.css", "paper.css"])
    const css = await call("ink.css")
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(await css.text()).toContain("Ink Serif")
    expect((await call("fonts/ink.woff2")).headers.get("content-type")).toBe("font/woff2")
    for (const p of ["theme.yaml", "theme.js", "mark.svg", "../stray.css", ".hidden/a.css"]) expect((await call(p)).status).toBe(404)
  })
})
