import { describe, expect, test } from "bun:test"
import { getVault, filterLanguage, listed, byRecent, countNotes, isPublished } from "../src/lib/vault"

const vault = getVault()
const vi = vault.byKey["vi-VN"]
const en = vault.byKey["en-US"]

describe("publishing rules", () => {
  test("only published, non-draft notes outside ignored folders are kept", () => {
    expect([...vault.sources.keys()].sort()).toEqual([
      "01_Fleeting/01_Fleeting",
      "03_Atomic/Code",
      "03_Atomic/Queries",
      "03_Atomic/Zettelkasten",
      "06_Reference/Niklas Luhmann",
      "06_Reference/Secret",
      "07_Project/Blog post",
      "07_Project/Poem",
      "index",
    ])
  })

  test("lineBreaks applies to configured types and yields to frontmatter", () => {
    expect(vi.get("07_Project/Poem")!.hardBreaks).toBe(true)
    expect(vi.get("03_Atomic/Zettelkasten")!.hardBreaks).toBe(false)
  })

  test("password-protected notes are published sealed, with the password out of the frontmatter", () => {
    const secret = vault.sources.get("06_Reference/Secret")!
    expect(secret.password).toBe("fixture-not-a-real-secret")
    expect("password" in secret.fm).toBe(false)
    expect(vi.get("06_Reference/Secret")!.protected).toBe(true)
  })

  test("explicit mode needs publish: true, all mode only skips publish: false", () => {
    expect(isPublished({ publish: true }, "explicit")).toBe(true)
    expect(isPublished({ publish: "true" }, "explicit")).toBe(true)
    expect(isPublished({}, "explicit")).toBe(false)
    expect(isPublished({}, "all")).toBe(true)
    expect(isPublished({ publish: false }, "all")).toBe(false)
  })

  test("drafts are never published", () => {
    expect(isPublished({ publish: true, draft: true }, "explicit")).toBe(false)
    expect(isPublished({ draft: "true" }, "all")).toBe(false)
  })

  test("the home symlink replaces its target instead of duplicating it", () => {
    expect(vault.home?.key).toBe("index")
    expect(vault.sources.has("05_Structure/Home")).toBe(false)
    expect(vi.get("index")?.isHome).toBe(true)
    expect(vault.resolveNote("Home", "")?.key).toBe("index")
  })
})

describe("languages", () => {
  test("filterLanguage keeps shared and matching blocks only", () => {
    const src = "a\n<!--lang:vi-VN-->\nvi\n<!--lang:en-US-->\nen\n<!--lang:*-->\nb"
    expect(filterLanguage(src, "vi-VN")).toBe("a\nvi\nb")
    expect(filterLanguage(src, "en-US")).toBe("a\nen\nb")
  })

  test("language markers inside code fences are content", () => {
    const src = "```\n<!--lang:en-US-->\n```"
    expect(filterLanguage(src, "vi-VN")).toBe(src)
  })

  test("titles and slugs follow the per-language title map", () => {
    const zk = en.get("03_Atomic/Zettelkasten")!
    expect(zk.title).toBe("Zettelkasten method")
    expect(zk.url).toBe("/en-US/03_Atomic/Zettelkasten-method")
    expect(vi.get("03_Atomic/Zettelkasten")!.url).toBe("/03_Atomic/Zettelkasten")
    expect(en.get("index")!.url).toBe("/en-US")
  })

  test("each language only keeps its own blocks", () => {
    expect(vi.get("03_Atomic/Zettelkasten")!.md).toContain("Ghi chú tiếng Việt")
    expect(vi.get("03_Atomic/Zettelkasten")!.md).not.toContain("English-only")
    expect(en.get("03_Atomic/Zettelkasten")!.md).toContain("English-only")
  })

  test("link placeholders are replaced by the target URL of the same language", () => {
    expect(en.get("index")!.md).toContain('href="/en-US/03_Atomic/Zettelkasten-method"')
    expect(vi.get("index")!.md).toContain('href="/03_Atomic/Zettelkasten"')
    expect(en.get("index")!.md).not.toContain("\u0001")
  })
})

describe("metadata", () => {
  const zk = vi.get("03_Atomic/Zettelkasten")!
  test("frontmatter dates, tags, aliases, types and stage", () => {
    expect(zk.created?.getFullYear()).toBe(2024)
    expect(zk.tags).toEqual(["type/notion", "theme/pkm"])
    expect(zk.types).toEqual(["notion"])
    expect(zk.aliases).toEqual(["Slip box"])
    expect(zk.stage).toBe("03_Atomic")
  })

  test("banners resolve vault assets and keep their focal point", () => {
    const post = vi.get("07_Project/Blog post")!
    expect(post.isBlog).toBe(true)
    expect(post.banner).toBe("/assets/_assets/images/diagram.png")
    expect(post.bannerPos).toBe("50% 25%")
  })

  test("only referenced assets are exported", () => {
    expect([...vault.assets].sort()).toEqual([
      "_assets/draw/Flow.excalidraw.dark.svg",
      "_assets/draw/Flow.excalidraw.light.svg",
      "_assets/images/diagram.png",
    ])
  })
})

describe("graph of notes", () => {
  test("backlinks carry the linking line as context", () => {
    const back = vault.backlinks["vi-VN"].get("06_Reference/Niklas Luhmann")!
    expect(back.map((b) => b.note.key)).toContain("03_Atomic/Zettelkasten")
    expect(back.find((b) => b.note.key === "03_Atomic/Zettelkasten")!.context).toContain("Niklas Luhmann")
  })

  test("a note never backlinks to itself", () => {
    const back = vault.backlinks["vi-VN"].get("03_Atomic/Zettelkasten") ?? []
    expect(back.some((b) => b.note.key === "03_Atomic/Zettelkasten")).toBe(false)
  })

  test("nested tags also register their parents", () => {
    const tags = vault.tags["vi-VN"]
    expect(tags.has("type")).toBe(true)
    expect(tags.get("type/blog")!.map((n) => n.key)).toEqual(["07_Project/Blog post"])
  })

  test("folder notes introduce their folder instead of being listed", () => {
    const fleeting = vault.folders["vi-VN"].get("01_Fleeting")!
    expect(fleeting.folderNote?.key).toBe("01_Fleeting/01_Fleeting")
    expect(fleeting.notes).toHaveLength(0)
    expect(fleeting.name).toBe("Fleeting")
    expect(countNotes(fleeting)).toBe(1)
  })

  test("the folder tree hides the home note", () => {
    expect(vault.trees["vi-VN"].notes.some((n) => n.isHome)).toBe(false)
  })
})

describe("helpers", () => {
  test("listed and byRecent", () => {
    const sorted = byRecent(listed("vi-VN"), "created").filter((n) => n.created)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].created!.getTime()).toBeGreaterThanOrEqual(sorted[i].created!.getTime())
    }
  })

  test("the index is cached until the watcher bumps the version", () => {
    expect(getVault()).toBe(vault)
    const g = globalThis as { __vaultVersion?: number }
    g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
    expect(getVault()).not.toBe(vault)
  })
})
