import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  getVault,
  filterLanguage,
  listed,
  byRecent,
  countNotes,
  isPublished,
  textLanguages,
  fallbackOf,
  contentLanguage,
} from "../src/lib/vault"

const vault = getVault()
const vi = vault.byKey["vi-VN"]
const en = vault.byKey["en-US"]

describe("publishing rules", () => {
  test("only published, non-draft notes outside ignored folders are kept", () => {
    expect([...vault.sources.keys()].sort()).toEqual([
      "01_Fleeting/01_Fleeting",
      "03_Atomic/Code",
      "03_Atomic/Fallback",
      "03_Atomic/Queries",
      "03_Atomic/Zettelkasten",
      "05_Structure/First walk",
      "06_Reference/Niklas Luhmann",
      "06_Reference/Secret",
      "07_Project/Blog post",
      "07_Project/Deck",
      "07_Project/Poem",
      "07_Project/Talk",
      "08_Journal/2026-09-28",
      "08_Journal/2026-10-05",
      "08_Journal/2026-10-07",
      "08_Journal/Garden plans",
      "08_Journal/Unlisted",
      "index",
    ])
  })

  test("permalinks replace the URL in every language and remember the old one", () => {
    expect(vi.get("07_Project/Poem")!.url).toBe("/poems/rain")
    expect(vi.get("07_Project/Poem")!.formerUrl).toBe("/07_Project/Poem")
    expect(en.get("07_Project/Poem")!.url).toBe("/en-US/poems/rain")
  })

  test("a permalink that clashes with another note is ignored", () => {
    expect(vi.get("03_Atomic/Code")!.url).toBe("/03_Atomic/Code")
    expect(vi.get("03_Atomic/Code")!.formerUrl).toBeUndefined()
    expect(vi.get("06_Reference/Niklas Luhmann")!.url).toBe("/06_Reference/Niklas-Luhmann")
  })

  test("a language counts as translated only with its own lang block", () => {
    expect(en.get("03_Atomic/Zettelkasten")!.translated).toBe(true)
    expect(en.get("06_Reference/Niklas Luhmann")!.translated).toBe(false)
    expect(vi.get("06_Reference/Niklas Luhmann")!.translated).toBe(true)
    expect(en.get("06_Reference/Niklas Luhmann")!.sourceLang).toBe("vi-VN")
  })

  test("an untranslated note shows its fallback language's blocks", () => {
    const fallback = en.get("03_Atomic/Fallback")!
    expect(fallback.translated).toBe(false)
    expect(fallback.contentLang).toBe("vi-VN")
    expect(fallback.md).toContain("Nội dung chỉ được viết bằng tiếng Việt.")
    expect(fallback.md).not.toContain("A heading alone")
    expect(fallback.md).toContain("Shared introduction.")
    expect(vi.get("03_Atomic/Fallback")!.contentLang).toBe("vi-VN")
    expect(en.get("03_Atomic/Zettelkasten")!.contentLang).toBe("en-US")
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

  test("two trailing spaces stay, as the line break they are", () => {
    expect(filterLanguage("Roses are red  \r\nViolets\n<!--lang:*-->  ", "vi-VN")).toBe("Roses are red  \nViolets")
  })

  test("only real fences hide markers: ~~~ fences count, ``` inside a line does not", () => {
    expect(filterLanguage("Run ```ls``` first.\n<!--lang:en-US-->\nen\n<!--lang:*-->\nend", "vi-VN")).toBe("Run ```ls``` first.\nend")
    const tilde = "~~~\n<!--lang:en-US-->\n```\n~~~\nafter"
    expect(filterLanguage(tilde, "vi-VN")).toBe(tilde)
  })

  test("language markers quoted inside a line are content", () => {
    const src = "<!--lang:vi-VN-->\n| Blocks | `<!--lang:vi-VN-->`, `<!--lang:en-US-->` |\n\n[^1]: Footnote.\n<!--lang:*-->"
    expect(filterLanguage(src, "vi-VN")).toBe("| Blocks | `<!--lang:vi-VN-->`, `<!--lang:en-US-->` |\n\n[^1]: Footnote.")
    expect(textLanguages(src)).toEqual(["vi-VN"])
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
    expect(zk.tags).toEqual(["type/notion", "type/term", "theme/pkm"])
    expect(zk.types).toEqual(["notion", "term"])
    expect(zk.aliases).toEqual(["Slip box"])
    expect(zk.stage).toBe("03_Atomic")
  })

  test("a stage property overrides the folder", () => {
    expect(vi.get("05_Structure/First walk")!.stage).toBe("03_Atomic")
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
      "_assets/images/wide.png",
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
    expect(countNotes(fleeting)).toBe(0)
  })

  test("note counts leave out folder notes at every depth", () => {
    const [intro, a, b] = vault.notes["vi-VN"]
    const leaf = { ...vault.folders["vi-VN"].get("01_Fleeting")!, folderNote: intro, notes: [a, b], folders: [] }
    const stage = { ...leaf, folderNote: intro, notes: [a], folders: [leaf] }
    expect(countNotes(stage)).toBe(3)
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

describe("fallback language", () => {
  test("textLanguages counts real text only", () => {
    const src = [
      "<!--lang:vi-VN-->",
      "Đã viết.",
      "<!--lang:en-US-->",
      "## Goals",
      "<!--",
      "a long comment",
      "-->",
      "- [ ]",
      "-",
      "<!--lang:fr-FR-->",
      "- [ ] Appeler la banque",
      "<!--lang:*-->",
      "Shared text belongs to no language.",
    ].join("\n")
    expect(textLanguages(src)).toEqual(["vi-VN", "fr-FR"])
  })

  test("textLanguages ignores markers inside a code fence", () => {
    expect(textLanguages("```\n<!--lang:en-US-->\ncode\n```")).toEqual([])
  })

  test("fallbackOf takes fallback_lang, else the source language", () => {
    expect(fallbackOf({}, "vi-VN")).toBe("vi-VN")
    expect(fallbackOf({ fallback_lang: "en-US" }, "vi-VN")).toBe("en-US")
    expect(fallbackOf({ fallback_lang: "none" }, "vi-VN")).toBeNull()
    expect(fallbackOf({ fallback_lang: "" }, "vi-VN")).toBeNull()
    expect(fallbackOf({ fallback_lang: null }, "vi-VN")).toBeNull()
  })

  test("contentLanguage falls back only to a language with text", () => {
    const viOnly = "<!--lang:vi-VN-->\nĐã viết.\n<!--lang:en-US-->\n## Goals\n<!--lang:*-->"
    expect(contentLanguage(viOnly, "en-US", "vi-VN")).toBe("vi-VN")
    expect(contentLanguage(viOnly, "vi-VN", "en-US")).toBe("vi-VN")
    expect(contentLanguage(viOnly, "en-US", null)).toBe("en-US")
    expect(contentLanguage(viOnly, "en-US", "fr-FR")).toBe("en-US")
    expect(contentLanguage("No blocks here.", "en-US", "vi-VN")).toBe("en-US")
  })
})

describe("frontmatter flags", () => {
  test('unlisted: "true", quoted, unlists the note as publish: "true" publishes it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-unlisted-"))
    fs.writeFileSync(path.join(dir, "Note.md"), '---\npublish: "true"\nunlisted: "true"\n---\nHidden.\n')
    const script = path.join(dir, "flags.ts")
    fs.writeFileSync(
      script,
      `import { getVault } from ${JSON.stringify(path.resolve(import.meta.dir, "../src/lib/vault"))}
console.log(JSON.stringify(Object.values(getVault().notes)[0].map((n) => n.unlisted)))
process.exit(0)`,
    )
    const proc = Bun.spawnSync(["bun", script], { env: { ...process.env, VAULT_PATH: dir, DATME_CACHE: "" } })
    fs.rmSync(dir, { recursive: true, force: true })
    expect(JSON.parse(proc.stdout.toString().trim().split("\n").pop()!)).toEqual([true])
  }, 60_000)
})

describe("link targets", () => {
  test("a partial path finds the note it ends, in a vault of nested folders", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-nested-"))
    fs.mkdirSync(path.join(dir, "A/B"), { recursive: true })
    fs.mkdirSync(path.join(dir, "C/B"), { recursive: true })
    fs.writeFileSync(path.join(dir, "A/B/Note.md"), "---\npublish: true\n---\nA.\n")
    fs.writeFileSync(path.join(dir, "C/B/Other.md"), "---\npublish: true\n---\nC.\n")
    const script = path.join(dir, "resolve.ts")
    fs.writeFileSync(
      script,
      `import { getVault } from ${JSON.stringify(path.resolve(import.meta.dir, "../src/lib/vault"))}
const v = getVault()
console.log(JSON.stringify([v.resolveNote("B/Note", "")?.key, v.resolveNote("b/other", "")?.key, v.resolveNote("X/Note", "")?.key ?? null]))
process.exit(0)`,
    )
    const proc = Bun.spawnSync(["bun", script], { env: { ...process.env, VAULT_PATH: dir, DATME_CACHE: "" } })
    fs.rmSync(dir, { recursive: true, force: true })
    expect(JSON.parse(proc.stdout.toString().trim().split("\n").pop()!)).toEqual(["A/B/Note", "C/B/Other", null])
  }, 60_000)

  test("a % that is not an escape, as in a 50% rule, is taken as written", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-percent-"))
    fs.writeFileSync(path.join(dir, "Note.md"), "---\npublish: true\n---\nSee [[The 50% rule]] and ![[100% done.png]].\n")
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "check", dir], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { ...process.env, VAULT_PATH: "", DATME_VAULT: "", DATME_CACHE: "" },
    })
    fs.rmSync(dir, { recursive: true, force: true })
    const out = proc.stdout.toString() + proc.stderr.toString()
    expect(out).not.toContain("URIError")
    expect(out).toContain("The 50% rule")
  }, 60_000)
})
