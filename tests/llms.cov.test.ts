import { afterEach, describe, expect, test } from "bun:test"
import { site } from "../src/site.config"
import { getVault, type Note } from "../src/lib/vault"
import { askAiLinks, hasMarkdown, llmsFullTxt, llmsTxt, mdUrl, noteMarkdown, plainNotes } from "../src/lib/llms"

const vi = getVault().byKey["vi-VN"]
const zk = vi.get("03_Atomic/Zettelkasten")!

// Fields of the shared site config a test changes, put back after it.
const saved = { url: site.url, langs: site.langs, tagline: { ...site.tagline }, askAi: site.askAi, llms: site.llms }
afterEach(() => {
  site.url = saved.url
  site.langs = saved.langs
  site.tagline = { ...saved.tagline }
  site.askAi = saved.askAi
  site.llms = saved.llms
})

/** A copy of a real note with other markdown, to test the text transformations alone. */
const withRaw = (n: Note, raw: string): Note => ({ ...n, source: { ...n.source, raw } })

describe("plain notes and their markdown copies", () => {
  test("plainNotes leave out the home page and protected notes", () => {
    const notes = plainNotes("vi-VN")
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.some((n) => n.isHome || n.protected)).toBe(false)
    expect(notes.map((n) => n.key)).toContain("03_Atomic/Zettelkasten")
  })

  test("hasMarkdown follows site.llms and the note's own state", () => {
    expect(hasMarkdown(zk)).toBe(true)
    expect(hasMarkdown({ ...zk, unlisted: true })).toBe(false)
    expect(hasMarkdown({ ...zk, protected: true })).toBe(false)
    expect(hasMarkdown({ ...zk, isHome: true })).toBe(false)
    site.llms = false
    expect(hasMarkdown(zk)).toBe(false)
  })

  test("mdUrl adds .md to the page URL", () => {
    expect(mdUrl(zk)).toBe(`${zk.url}.md`)
  })

  test("a body that opens with its own H1 gets no second title", () => {
    expect(noteMarkdown(withRaw(zk, "# Own heading\n\nText"))).toBe("# Own heading\n\nText\n")
    expect(noteMarkdown(withRaw(zk, "Just text"))).toBe(`# ${zk.title}\n\nJust text\n`)
  })

  test("comments go, blank runs shrink, and links to a private note become its words", () => {
    const md = noteMarkdown(withRaw(zk, "A %%hidden%% b <!-- c -->\n\n\n\nSee [[Private]] and [[Private|that one]] and [x](Private.md#part)."))
    expect(md).not.toContain("hidden")
    expect(md).not.toContain("<!--")
    expect(md).not.toContain("\n\n\n")
    expect(md).not.toContain("[[Private")
    expect(md).not.toContain("(Private.md")
  })

  test("a link with a malformed escape or no file keeps its raw text", () => {
    const md = noteMarkdown(withRaw(zk, "Broken [[%E0%A4%A]] and [[#Heading]] stay."))
    expect(md).toContain("[[%E0%A4%A]]")
    expect(md).toContain("[[#Heading]]")
  })
})

describe("ask an assistant", () => {
  test("one link per configured assistant, with the absolute URL of the markdown copy in the prompt", () => {
    const links = askAiLinks(zk)
    expect(links.map((l) => l.name)).toHaveLength(2)
    expect(links[0].href).toStartWith("https://chatgpt.com/?q=")
    expect(links[1].href).toStartWith("https://claude.ai/new?q=")
    expect(decodeURIComponent(links[1].href)).toContain(`https://notes.dynamotn.dev${zk.url}.md`)
    site.askAi = ["claude"]
    expect(askAiLinks(zk).map((l) => l.href.slice(0, 22))).toEqual(["https://claude.ai/new?"])
  })

  test("none without a public site URL or a markdown copy", () => {
    expect(askAiLinks({ ...zk, protected: true })).toEqual([])
    site.url = undefined
    expect(askAiLinks(zk)).toEqual([])
  })
})

describe("/llms.txt and /llms-full.txt", () => {
  test("llms.txt names the garden and links each note's markdown, under a heading per language", async () => {
    const txt = await llmsTxt()
    expect(txt).toStartWith(`# ${site.title[site.defaultLang]}\n\n> A test notebook\n\n`)
    expect(txt).toContain("## Notes (")
    expect(txt).toContain(`- [Zettelkasten](https://notes.dynamotn.dev${zk.url}.md)`)
    // A note with a description shows it after a colon.
    expect(txt).toMatch(/\.md\): \S/)
    expect(txt).toContain("## Optional\n\n- [Full text](https://notes.dynamotn.dev/llms-full.txt): every note above in one file\n")
  }, 60_000)

  test("one language and no tagline: a plain Notes heading, relative URLs without site.url", async () => {
    site.langs = ["vi-VN"]
    site.tagline = { ...site.tagline, "vi-VN": "" }
    site.url = undefined
    const txt = await llmsTxt()
    expect(txt).toStartWith(`# ${site.title["vi-VN"]}\n\n## Notes\n\n`)
    expect(txt).toContain(`(${zk.url}.md)`)
    expect(txt).toContain("- [Full text](/llms-full.txt)")
    const full = llmsFullTxt()
    expect(full).toStartWith(`# ${site.title["vi-VN"]}\n\n## Notes\n\n---\n\nSource: /`)
  }, 60_000)

  test("a language without plain notes gets no heading", async () => {
    const notes = getVault().notes as Record<string, Note[]>
    notes["fr-FR"] = []
    try {
      site.langs = ["fr-FR" as never]
      expect(await llmsTxt()).not.toContain("## Notes")
      expect(llmsFullTxt()).not.toContain("## Notes")
    } finally {
      delete notes["fr-FR"]
    }
  })

  test("llms-full.txt holds every note's markdown after its source URL", () => {
    const full = llmsFullTxt()
    expect(full).toContain(`---\n\nSource: https://notes.dynamotn.dev${zk.url}\n\n# Zettelkasten\n`)
    expect(full).not.toContain("a private comment")
  })
})
