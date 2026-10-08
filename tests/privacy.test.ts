import { describe, expect, test } from "bun:test"
import { preprocess, type LinkTarget } from "../src/lib/obsidian"
import { outsideHosts, privateLinkText, showsName, type PrivateLinks } from "../src/lib/privacy"
import { toProp } from "../src/lib/properties"
import { formatPrivacy, privacyReport } from "../src/lib/check"
import { parseArgs } from "../src/cli"
import { site } from "../src/site.config"

describe("privateLinkText", () => {
  test("text keeps the words, placeholder replaces them, hide drops a bare name but keeps an alias", () => {
    expect(privateLinkText("text", "Job interview", undefined, "a private note")).toBe("Job interview")
    expect(privateLinkText("text", "Folder/Job interview.md", "that day", "a private note")).toBe("that day")
    expect(privateLinkText("placeholder", "Job interview", "that day", "a private note")).toBe("a private note")
    expect(privateLinkText("hide", "Job interview#Notes", undefined, "a private note")).toBe("")
    expect(privateLinkText("hide", "Job interview", "job interview", "a private note")).toBe("")
    expect(privateLinkText("hide", "Job interview", "that day", "a private note")).toBe("that day")
  })

  test("a link shows its note's name when its words are that name, whatever the folder or case", () => {
    expect(showsName("Folder/Job Interview.md", "job interview")).toBe(true)
    expect(showsName("Job interview", "that day")).toBe(false)
  })
})

describe("links to private notes in a note", () => {
  const target: LinkTarget = { key: "Public" }
  const run = (src: string, mode: PrivateLinks) =>
    preprocess(src, {
      lang: "en-US",
      dir: "",
      resolveNote: (t) => (t.toLowerCase() === "public" ? target : undefined),
      resolveAsset: () => undefined,
      privateLink: (t, _dir, alias) => (/^secret( plan)?(\.md)?$/i.test(t) ? privateLinkText(mode, t, alias, "a private note") : undefined),
    })

  test("placeholder replaces the words of links, embeds and markdown links", () => {
    const { md, problems } = run("[[Secret plan]], ![[Secret plan]] and [the plan](Secret%20plan.md)", "placeholder")
    expect(md).not.toContain("Secret")
    expect(md).not.toContain("the plan")
    expect(md.match(/a private note/g)).toHaveLength(3)
    expect(problems.map((p) => p.shown)).toEqual(["a private note", "a private note", "a private note"])
  })

  test("hide leaves nothing for a bare name and keeps an alias", () => {
    const { md } = run("Before [[Secret plan]] after, [[Secret plan|a plan]].", "hide")
    expect(md).toBe('Before  after, <span class="broken-link" title="Not published">a plan</span>.')
  })

  test("a missing note is not private: it keeps its words", () => {
    expect(run("[[Nowhere]]", "hide").md).toContain(">Nowhere</span>")
  })

  test("the backlink context of a link on the same line does not name the private note", () => {
    const { links } = run("See [[Public]] and [[Secret plan]].", "placeholder")
    expect(links).toEqual([{ key: "Public", context: "See Public and a private note." }])
    expect(run("See [[Public]] and [[Secret plan]].", "text").links[0].context).toBe("See Public and Secret plan.")
  })
})

describe("properties naming a private note", () => {
  const resolve = () => undefined
  test("follow privateLinks, and disappear when they show nothing", () => {
    expect(toProp("[[Secret plan]]", resolve, () => "a private note")).toEqual({ kind: "text", text: "a private note" })
    expect(toProp("[[Secret plan]]", resolve, () => "")).toBeUndefined()
    expect(toProp(["[[Secret plan]]", "x"], resolve, () => "")).toEqual({ kind: "list", items: [{ kind: "text", text: "x" }] })
    expect(toProp("[[Missing]]", resolve)).toEqual({ kind: "text", text: "Missing", href: undefined })
  })
})

describe("datme check --privacy", () => {
  const report = privacyReport()

  test("lists published notes with their URL, and only those", () => {
    expect(report.notes.find((n) => n.file === "03_Atomic/Zettelkasten.md")?.url).toBe("/03_Atomic/Zettelkasten")
    expect(report.notes.some((n) => n.file === "06_Reference/Private.md")).toBe(false)
    expect(report.notes.find((n) => n.file === "06_Reference/Secret.md")?.protected).toBe(true)
  })

  test("lists the files copied, the properties shown and the links to private notes", () => {
    expect(report.files).toContain("_assets/images/diagram.png")
    expect(report.properties.find((p) => p.key === "website")?.files).toEqual(["06_Reference/Niklas Luhmann.md"])
    expect(report.privateLinks).toContainEqual({ file: "03_Atomic/Zettelkasten.md", target: "Private", shown: "Private" })
  })

  test("lists the outside hosts the configuration turns on", () => {
    const hosts = report.hosts.map((h) => h.host)
    expect(hosts).toContain("giscus.app")
    expect(hosts).toContain("www.googletagmanager.com")
    expect(hosts).toContain("fonts.googleapis.com")
  })

  test("the text report has a section for each, with its count", () => {
    const text = formatPrivacy(report)
    expect(text).toStartWith(`Published notes (${report.notes.length})`)
    expect(text).toContain('03_Atomic/Zettelkasten.md  "Private" shows "Private"')
    expect(text).toContain("giscus.app  comments")
  })

  test("is a switch of check only", () => {
    expect(parseArgs(["check", "--privacy"]).privacy).toBe(true)
    expect(parseArgs(["build", "--privacy"]).privacy).toBeUndefined()
  })

  test("defaults to the words as written", () => {
    expect(site.privateLinks).toBe("text")
  })
})

describe("outsideHosts", () => {
  const base = { theme: { fonts: {} }, map: { tiles: "https://tile.example/{z}/{x}/{y}.png" }, linkPreviews: false }
  test("only the hosts in use: no map tiles without a place, embeds named once", () => {
    const hosts = outsideHosts(base, "https://font.example/a.css", ["https://www.youtube-nocookie.com/embed/x", "https://www.youtube-nocookie.com/embed/y"], false)
    expect(hosts).toEqual([
      { host: "font.example", why: "monospace font of every page" },
      { host: "www.youtube-nocookie.com", why: "embedded in a note" },
    ])
    expect(outsideHosts(base, "https://font.example/a.css", [], true).map((h) => h.host)).toContain("tile.example")
  })
})
