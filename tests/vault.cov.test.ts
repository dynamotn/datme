import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadConfig, site } from "../src/site.config"
import { getVault, markdownFiles, type Vault } from "../src/lib/vault"

/** Scratch vaults live outside the repository; every one is rebuilt from scratch per run. */
const ROOT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-vault-cov-")), "vaults")

const saved = { ...site }
const savedNeighbours = process.env.DATME_NEIGHBOURS

const bump = () => {
  const g = globalThis as { __vaultVersion?: number }
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
}

/** Point the site at another vault, with its own datme.yaml, and index it afresh. */
function useVault(dir: string): Vault {
  const config = loadConfig(dir, {})
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, config)
  bump()
  return getVault()
}

function write(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
}

const HEX = (c: string) => c.repeat(40)

const OUTER_DRAWING = `---
excalidraw-plugin: parsed
publish: false
---
# Excalidraw Data

## Embedded Files
${HEX("a")}: [[Bad.excalidraw]]

${HEX("b")}: [[Alpha]]

${HEX("c")}: [[Hidden]]

${HEX("d")}: [[nothing.zip]]

${HEX("e")}: [[pic.png]]

%%
## Drawing
\`\`\`json
${JSON.stringify({
  elements: ["a", "b", "c", "d", "e"].map((c, i) => ({ type: "image", id: `img${c}`, fileId: HEX(c), x: i * 20, y: 0, width: 10, height: 10 })),
})}
\`\`\`
%%
`

const TWIN_DRAWING = `---
excalidraw-plugin: parsed
publish: false
---
%%
## Drawing
\`\`\`json
${JSON.stringify({ elements: [{ type: "rectangle", id: "r1", x: 0, y: 0, width: 10, height: 10 }] })}
\`\`\`
%%
`

const main = path.join(ROOT, "main")
const unreadable = path.join(main, "locked.vtt")

beforeAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true })
  write(main, {
    "datme.yaml": [
      "publish: all",
      "languages: [en-US]",
      "bibliography: [missing.bib]",
      "neighbours:",
      "  friend: https://friend.example",
      "  offline: https://offline.example",
      "lineBreaks:",
      "  folders: [B]",
    ].join("\n"),
    "index.md": "Welcome home.",
    "Alpha.md": [
      "---",
      "aliases: Al, Alpha One",
      "tags: 5",
      'banner: "[[pic.png]]"',
      "cover: missing-cover.png",
      "layout: bogus",
      "style: bogus",
      "chrome: bogus",
      "---",
      "![[50% off.png]]",
      "",
      "Kept: [[Hidden|kept words]].",
      "",
      "File: [[missing.pdf]]",
      "",
      "Gardens: [[friend:Gone]] [[offline:Anything]] [[friend:Known]]",
      "",
      "![[Gone.excalidraw]]",
      "",
      "![[Bad.excalidraw]]",
      "",
      "![[Outer.excalidraw]]",
      "",
      "[[Board.canvas]]",
      "",
      "![[talk.mp3]]",
      "",
      "![[locked.mp3]]",
    ].join("\n"),
    "Beta.md": "---\naliases: [Alpha]\n---\nBeta links [[Hidden]].",
    "Hidden.md": "---\npublish: false\n---\nPrivate.",
    "Deck.md": ["---", "marp: true", 'style: "section { background: url(pic.png) }"', 'backgroundImage: "url(nowhere.png)"', "---", "# Slide"].join("\n"),
    "Bad.excalidraw.md": "---\npublish: false\n---\nno drawing here",
    "Outer.excalidraw.md": OUTER_DRAWING,
    "Board.canvas": "this is not a canvas",
    "pic.png": "png",
    "50% off.png": "png",
    "talk.mp3": "mp3",
    "talk.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSpoken words\n",
    "locked.mp3": "mp3",
    "locked.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNever read\n",
    "A/Gamma.md": "Gamma in A.",
    "B/C/Gamma.md": "Deeper gamma.",
    "Links.md": [
      "[[Gamma]] and [[C/Gamma]] and [[Map.canvas]] and [[Outer.excalidraw]]",
      "",
      "![[Twin.excalidraw]]",
      "",
      "![[twin.png]]",
      "",
      "<!--lock:secret-->",
      "Locked [[Hidden|locked words]] and [[friend:Known]]",
      "<!--lock:*-->",
    ].join("\n"),
    "X/Twin.excalidraw.md": TWIN_DRAWING,
    "Y/Z/Twin.excalidraw.md": TWIN_DRAWING,
    "X/twin.png": "png",
    "Y/Z/twin.png": "png",
    "Map.canvas": JSON.stringify({
      nodes: [{ id: "t1", type: "text", text: "See [[Hidden]] and [[friend:Known]] ![[pic.png]]", x: 0, y: 0, width: 100, height: 50 }],
      edges: [],
    }),
    "theme.css": "/* @theme mine */\nsection { color: red }",
    "plain.css": "body { color: blue }",
    "neighbours.json": JSON.stringify({
      friend: { url: "https://friend.example", fetchedAt: 0, notes: { "en-US": [{ u: "/known", t: "Known" }] } },
    }),
  })
  fs.chmodSync(unreadable, 0o000)
  fs.symlinkSync(path.join(ROOT, "does-not-exist.md"), path.join(main, "dead.md"))

  write(path.join(ROOT, "explicit"), { "datme.yaml": "publish: explicit", "Draft.md": "Not published." })
  write(path.join(ROOT, "empty"), { "datme.yaml": "publish: all", "image.png": "png" })
})

afterAll(() => {
  if (fs.existsSync(unreadable)) fs.chmodSync(unreadable, 0o644)
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, saved)
  if (savedNeighbours === undefined) delete process.env.DATME_NEIGHBOURS
  else process.env.DATME_NEIGHBOURS = savedNeighbours
  bump()
})

describe("a vault full of mistakes", () => {
  let vault: Vault
  let warned: string[]
  beforeAll(() => {
    process.env.DATME_NEIGHBOURS = path.join(main, "neighbours.json")
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      vault = useVault(main)
      warned = warn.mock.calls.map((c) => String(c[0]))
    } finally {
      warn.mockRestore()
    }
  })
  const messages = (file: string) => vault.problems.filter((p) => p.file === file).map((p) => `${p.level}: ${p.message}`)

  test("a broken symlink is skipped; markdownFiles lists every note, published or not", () => {
    expect(vault.sources.has("dead")).toBe(false)
    expect(markdownFiles().sort()).toEqual([
      "A/Gamma.md",
      "Alpha.md",
      "B/C/Gamma.md",
      "Bad.excalidraw.md",
      "Beta.md",
      "Deck.md",
      "Hidden.md",
      "Links.md",
      "Outer.excalidraw.md",
      "X/Twin.excalidraw.md",
      "Y/Z/Twin.excalidraw.md",
      "index.md",
    ])
  })

  test("aliases and tags written as a comma list or a number", () => {
    const alpha = vault.byKey["en-US"].get("Alpha")!
    expect(alpha.aliases).toEqual(["Al", "Alpha One"])
    expect(alpha.tags).toEqual(["5"])
    expect(vault.resolveNote("Alpha One", "")?.key).toBe("Alpha")
  })

  test("an alias that is another note's name is ambiguous", () => {
    expect(messages("Beta.md")).toContain('warning: alias "Alpha" is also the name or an alias of Alpha.md, so links to it are ambiguous')
  })

  test("a banner of the vault is published; a missing cover, layout, style and chrome are reported", () => {
    const alpha = vault.byKey["en-US"].get("Alpha")!
    expect(alpha.banner).toBe("/assets/pic.png")
    expect(alpha.cover).toBe("/assets/pic.png")
    expect(alpha.layout).toBeUndefined()
    expect(vault.assets.has("pic.png")).toBe(true)
    const m = messages("Alpha.md")
    expect(m).toContain('error: cover "missing-cover.png" is not in the vault')
    expect(m.some((x) => x.startsWith('warning: layout "bogus" is not one of cv, gallery'))).toBe(true)
    expect(m.some((x) => x.startsWith('warning: style "bogus" is not one of'))).toBe(true)
    expect(m.some((x) => x.startsWith('warning: chrome "bogus" is not one of'))).toBe(true)
  })

  test("a target with a lone % is taken as written", () => {
    expect(vault.resolveAsset("50% off.png", "")).toBe("50% off.png")
    expect(vault.byKey["en-US"].get("Alpha")!.assets).toContain("50% off.png")
  })

  test("links to private notes, missing files and garden notes are classified", () => {
    const m = messages("Alpha.md")
    expect(m).toContain('info: link to unpublished note "Hidden" is shown as plain text')
    expect(messages("Beta.md")).toContain(
      'info: link to unpublished note "Hidden" shows its name as plain text; privateLinks: placeholder or hide keeps it off the site',
    )
    expect(m).toContain('error: link to missing file "missing.pdf"')
    expect(m).toContain('warning: link to "Gone" not found in the garden "friend" (https://friend.example)')
    expect(vault.privateLinks).toEqual(
      expect.arrayContaining([
        { file: "Alpha.md", target: "Hidden", shown: "kept words" },
        { file: "Beta.md", target: "Hidden", shown: "Hidden" },
      ]),
    )
    const md = vault.byKey["en-US"].get("Alpha")!.md
    expect(md).toContain('<a href="https://friend.example/known" class="garden-link"')
    expect(md).toContain('<a href="https://offline.example/" class="garden-link" data-garden="offline"')
  })

  test("drawings: a missing one, one that cannot be read, and nested drawings that fail inside", () => {
    const m = messages("Alpha.md")
    expect(m).toContain('warning: drawing "Gone.excalidraw" is not in the vault, so it is not shown')
    expect(messages("Bad.excalidraw.md")).toEqual(["warning: drawing cannot be drawn: no drawing found; is it an Excalidraw file?"])
    const md = vault.byKey["en-US"].get("Alpha")!.md
    // The outer drawing is drawn: a published note shows as a linked card, a private one as a lock.
    expect(md).toContain("📄 Alpha")
    expect(md).toContain("📄 🔒")
    expect(md).toContain(`href="${vault.byKey["en-US"].get("Alpha")!.url}"`)
  })

  test("a transcript is read next to its media; one that cannot be read leaves a plain player", () => {
    const md = vault.byKey["en-US"].get("Alpha")!.md
    expect(md).toContain("Spoken words")
    expect(md).not.toContain("Never read")
    expect(md).toContain('<audio src="/assets/locked.mp3" controls></audio>')
  })

  test("an invalid canvas is reported and not published", () => {
    expect(vault.docs.has("Board.canvas")).toBe(false)
    expect(messages("Board.canvas")).toEqual(["error: not a valid canvas, so it is not published"])
    expect(warned).toContain("[datme] skipped Board.canvas: not a valid canvas")
  })

  test("a bibliography that cannot be read is reported", () => {
    expect(messages("datme.yaml")).toEqual(['error: bibliography "missing.bib" cannot be read'])
  })

  test("a deck's directives point at the vault's files; only CSS files naming a @theme are its themes", () => {
    const deck = vault.byKey["en-US"].get("Deck")!
    expect(deck.slides).toMatchObject({ style: "section { background: url(/assets/pic.png) }", backgroundImage: "url(nowhere.png)" })
    expect(vault.assets.has("pic.png")).toBe(true)
    expect(vault.slideThemes).toEqual(["/* @theme mine */\nsection { color: red }"])
  })

  test("of notes, drawings and files sharing a name, the shortest path wins; a partial path picks its note", () => {
    expect(vault.resolveNote("Gamma", "")?.key).toBe("A/Gamma")
    expect(vault.resolveNote("C/Gamma", "")?.key).toBe("B/C/Gamma")
    expect(vault.resolveNote("Q/Gamma", "")).toBeUndefined()
    expect(vault.resolveAsset("twin.png", "")).toBe("X/twin.png")
    const links = vault.byKey["en-US"].get("Links")!
    expect(links.links.map((l) => l.key)).toEqual(["A/Gamma", "B/C/Gamma"])
    expect(links.assets).toContain("X/twin.png")
    expect(links.md).toContain('class="drawing generated"')
  })

  test("single line breaks are kept in the folders lineBreaks names, and below them", () => {
    expect(vault.byKey["en-US"].get("B/C/Gamma")!.hardBreaks).toBe(true)
    expect(vault.byKey["en-US"].get("A/Gamma")!.hardBreaks).toBe(false)
  })

  test("a locked part converts its private and garden links too", () => {
    const part = vault.byKey["en-US"].get("Links")!.lockedParts[0]
    expect(part.password).toBe("secret")
    expect(part.md).toContain('<span class="broken-link" title="Not published">locked words</span>')
    expect(part.md).toContain('<a href="https://friend.example/known" class="garden-link"')
  })

  test("a drawing linked as a page is published with the files it shows", () => {
    const doc = vault.docs.get("Outer.excalidraw.md")!
    expect(doc.kind).toBe("drawing")
    expect(doc.texts["en-US"].svg).toContain("/assets/pic.png")
    expect(vault.assets.has("pic.png")).toBe(true)
  })

  test("a canvas's text converts private and garden links", () => {
    const text = vault.docs.get("Map.canvas")!.texts["en-US"].t1
    expect(text).toContain('<span class="broken-link" title="Not published">Hidden</span>')
    expect(text).toContain('<a href="https://friend.example/known" class="garden-link"')
  })
})

describe("vaults with nothing to publish", () => {
  const build = (name: string) => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const vault = useVault(path.join(ROOT, name))
      return { vault, warned: warn.mock.calls.map((c) => String(c[0])) }
    } finally {
      warn.mockRestore()
    }
  }

  test("explicit publishing without any `publish: true` says how to publish", () => {
    const { vault, warned } = build("explicit")
    expect(vault.sources.size).toBe(0)
    expect(warned).toEqual([
      `[datme] no note in ${path.join(ROOT, "explicit")} has \`publish: true\`; add it to the notes to share, or set \`publish: all\` in datme.yaml`,
    ])
  })

  test("a vault without notes says so", () => {
    const { vault, warned } = build("empty")
    expect(vault.notes["en-US"]).toEqual([])
    expect(warned).toEqual([`[datme] no publishable note found in ${path.join(ROOT, "empty")}`])
  })
})
