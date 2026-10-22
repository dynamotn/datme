import { beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { probeVault } from "./vault-probe"

const sketch = fs.readFileSync(path.join(import.meta.dir, "fixtures/vault/_assets/draw/Sketch.excalidraw.md"), "utf8")
const withFrontmatter = (drawing: string, extra: string) => drawing.replace(/^---\n/, `---\n${extra}\n`)

let result: any
beforeAll(() => {
  result = probeVault(
    {
      "Target.md": "---\npublish: true\n---\nLinked from around the garden.\n",
      "Listed.md": "---\npublish: true\n---\nSee [[Target]].\n",
      "Hidden.md": "---\npublish: true\nunlisted: true\n---\nA secret path to [[Target]].\n",
      "Locked.md": "---\npublish: true\npassword: fixture-not-a-real-secret\nbanner: banner.png\ncover: cover.png\n---\nLocked.\n",
      "banner.png": "png",
      "cover.png": "png",
      "Open.excalidraw.md": sketch,
      "Plan.excalidraw.md": withFrontmatter(sketch, "publish: false"),
      "Plan.excalidraw.svg": "<svg/>",
      "Draft.excalidraw.md": withFrontmatter(sketch, "draft: true"),
      "Embeds.md": "---\npublish: true\n---\n![[Open.excalidraw]]\n\n![[Plan.excalidraw]] and [[Draft.excalidraw|the draft]] and [draft](Draft.excalidraw)\n",
    },
    `import { getVault } from "$src/lib/vault"
import { renderNote } from "$src/lib/markdown"
const v = getVault()
const lang = Object.keys(v.notes)[0]
const note = (k) => v.byKey[lang].get(k)
const embeds = await renderNote(note("Embeds"))
console.log(JSON.stringify({
  backlinks: (v.backlinks[lang].get("Target") ?? []).map((b) => b.note.key).sort(),
  hiddenLinks: note("Hidden").links.map((l) => l.key),
  locked: { banner: note("Locked").banner ?? null, cover: note("Locked").cover ?? null },
  assets: [...v.assets].sort(),
  docs: [...v.docs.keys()].sort(),
  embeds: embeds.html,
}))`,
  ).result
}, 60_000)

describe("unlisted notes", () => {
  test("are left out of the backlinks of the notes they link to", () => {
    expect(result.backlinks).toEqual(["Listed"])
  })

  test("still link to other notes from their own page", () => {
    expect(result.hiddenLinks).toEqual(["Target"])
  })
})

describe("protected notes", () => {
  test("publish neither their banner nor their cover", () => {
    expect(result.locked).toEqual({ banner: null, cover: null })
    expect(result.assets).not.toContain("banner.png")
    expect(result.assets).not.toContain("cover.png")
  })
})

describe("drawings", () => {
  test("an embedded drawing is drawn and published", () => {
    expect(result.embeds).toContain('class="drawing generated"')
  })

  test("a drawing saying publish: false or draft: true is withheld, with its exported image", () => {
    expect(result.assets).not.toContain("Plan.excalidraw.svg")
    expect(result.docs).not.toContain("Draft.excalidraw.md")
    expect(result.embeds.match(/class="drawing generated"/g)).toHaveLength(1)
    // As a private note: the words of the link stay, nothing leads anywhere.
    expect(result.embeds).toContain('title="Not published">Plan</span>')
    expect(result.embeds).toContain('title="Not published">the draft</span>')
    expect(result.embeds).toContain('title="Not published">draft</span>')
  })
})
