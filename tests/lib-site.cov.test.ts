import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { site, type SiteConfig } from "../src/site.config"
import { getVault, type FolderNode, type Note } from "../src/lib/vault"
import * as history from "../src/lib/history"
import { feed, feedPath, changesFeed, changesPath } from "../src/lib/feed"
import { embeddable, embedUrl, oembedUrl, cardImage, oembedJson, EMBED_HEIGHT } from "../src/lib/oembed"
import { ogPath } from "../src/lib/og-url"
import { wilting } from "../src/lib/outdated"
import { routes, routeProblems, redirectsFile } from "../src/lib/routes"
import { allSeries, seriesOf } from "../src/lib/series"
import { customCssFile, fontsHref, themeCss } from "../src/lib/theme"
import { typeInfo } from "../src/lib/types"
import vaultWatcher, { ignoredInVault } from "../src/lib/vault-watcher"
import { BRIDGY_REDIRECTS } from "../src/lib/activitypub"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cov-lib-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Change some settings for the length of a test; restored after each one. */
const saved: Partial<SiteConfig>[] = []
function setSite(patch: Partial<SiteConfig>): void {
  saved.push(Object.fromEntries(Object.keys(patch).map((k) => [k, site[k as keyof SiteConfig]])) as Partial<SiteConfig>)
  Object.assign(site, patch)
}
afterEach(() => {
  while (saved.length) Object.assign(site, saved.pop())
})

const note = (key: string, lang = "vi-VN"): Note => getVault().byKey[lang].get(key)!

/** Every note planted with a sentence, then grown by a paragraph: changes without depending on git. */
function fakeVersions() {
  return spyOn(history, "noteVersions").mockImplementation(() => [
    { date: new Date("2026-01-05T10:00:00Z"), text: "A seed." },
    { date: new Date("2026-02-05T10:00:00Z"), text: "A seed.\n\nIt grew a whole new branch today." },
  ])
}

describe("feeds", () => {
  test("paths of the site, folder and tag feeds, per language", () => {
    expect(feedPath("vi-VN", { kind: "site" })).toBe("index.xml")
    expect(feedPath("en-US", { kind: "site" })).toBe("en-US/index.xml")
    expect(feedPath("vi-VN", { kind: "folder", dir: "07_Project" })).toBe("07_Project/index.xml")
    expect(feedPath("vi-VN", { kind: "tag", tag: "book" })).toBe("tags/book/index.xml")
    expect(changesPath("en-US", { kind: "folder", dir: "07_Project" })).toBe("en-US/07_Project/changes.xml")
  })

  test("the site feed lists listed notes, never the home page, in their language", async () => {
    const xml = await (await feed("vi-VN")).text()
    expect(xml).toContain("<language>vi-VN</language>")
    expect(xml).toContain(`<title>${site.title["vi-VN"]}</title>`)
    expect(xml).toContain(`${site.url}/07_Project/Blog-post`)
    expect(xml).not.toContain("08_Journal/Unlisted")
    expect(xml).not.toMatch(new RegExp(`<link>${site.url}/</link>\\s*<guid`))
  }, 60_000)

  test("folder and tag feeds are named after their scope and cover only it", async () => {
    const folder = await (await feed("en-US", { kind: "folder", dir: "07_Project" })).text()
    expect(folder).toContain(`<title>${getVault().folders["en-US"].get("07_Project")!.name} · ${site.title["en-US"]}</title>`)
    expect(folder).toContain("/en-US/07_Project/Talk")
    expect(folder).not.toContain("/en-US/03_Atomic/")
    const tag = [...getVault().tags["en-US"].keys()][0]
    const tagged = await (await feed("en-US", { kind: "tag", tag })).text()
    expect(tagged).toContain(`<title>#${tag} · ${site.title["en-US"]}</title>`)
  }, 60_000)

  test("without site.url the feed links point at the dev server", async () => {
    setSite({ url: undefined })
    const xml = await (await feed("vi-VN", { kind: "tag", tag: "no-such-tag" })).text()
    expect(xml).toContain("<link>http://localhost:4321/</link>")
    expect(xml).not.toContain("<item>")
  })

  test("the changes feed has an item per version: planted, then grown", async () => {
    setSite({ history: true })
    const spy = fakeVersions()
    try {
      const xml = await (await changesFeed("en-US")).text()
      expect(xml).toContain("<language>en-US</language>")
      expect(xml).toContain("<title>Garden changes · Test garden</title>")
      expect(xml).toContain("<title>Talk (new)</title>")
      expect(xml).toMatch(/\(\+1 −0 paragraphs\)/)
      expect(xml).toContain('<guid isPermaLink="false">/en-US/07_Project/Talk@2026-02-05T10:00:00.000Z</guid>')
      expect(xml).toContain("It grew a whole new branch today.")
      const folder = await (await changesFeed("en-US", { kind: "folder", dir: "07_Project" })).text()
      expect(folder).toContain(`· ${getVault().folders["en-US"].get("07_Project")!.name} · Test garden`)
      expect(folder).not.toContain("03_Atomic")
      const tagged = await (await changesFeed("en-US", { kind: "tag", tag: "zz-none" })).text()
      expect(tagged).toContain("#zz-none · Test garden")
      setSite({ url: undefined })
      expect(await (await changesFeed("en-US")).text()).toContain("http://localhost:4321")
    } finally {
      spy.mockRestore()
    }
  })
})

describe("oEmbed", () => {
  const blog = () => note("07_Project/Blog post")
  const talk = () => note("07_Project/Talk")

  test("public listed notes are embeddable when the site has a URL", () => {
    expect(embeddable(talk())).toBe(true)
    expect(embeddable(note("index"))).toBe(false)
    expect(embeddable(note("06_Reference/Secret"))).toBe(false)
    expect(embeddable(note("08_Journal/Unlisted"))).toBe(false)
    setSite({ url: undefined })
    expect(embeddable(talk())).toBe(false)
    setSite({ oembed: false, url: "https://x.example" })
    expect(embeddable(talk())).toBe(false)
  })

  test("the card and JSON live next to the note", () => {
    expect(embedUrl(talk())).toBe("/07_Project/Talk/embed")
    expect(oembedUrl(talk())).toBe("/07_Project/Talk.oembed.json")
    expect(embedUrl(note("index"))).toBe("/embed")
  })

  test("the card image is the banner, else the social card", () => {
    expect(cardImage(blog())).toBe("/assets/_assets/images/diagram.png")
    expect(cardImage(talk())).toBe("/og/07_Project/Talk.png")
    setSite({ ogImages: false })
    expect(cardImage(talk())).toBeUndefined()
  })

  test("the JSON describes a rich iframe with the author and a thumbnail", async () => {
    const j = await oembedJson(talk())
    expect(j).toMatchObject({
      version: "1.0",
      type: "rich",
      author_name: "Tester",
      provider_name: site.title["vi-VN"],
      provider_url: `${site.url}/`,
      thumbnail_url: `${site.url}/og/07_Project/Talk.png`,
      width: 600,
      height: EMBED_HEIGHT,
    })
    expect(j.html).toBe(
      `<iframe src="${site.url}/07_Project/Talk/embed" width="600" height="${EMBED_HEIGHT}" style="max-width:100%;border:0" loading="lazy" title="${String(j.title).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></iframe>`,
    )
  })

  test("without author or image those fields are left out, and the title is escaped", async () => {
    setSite({ author: "", ogImages: false })
    const n = { ...talk(), title: 'Fish & "chips" <3' }
    const j = await oembedJson(n)
    expect(j).not.toHaveProperty("author_name")
    expect(j).not.toHaveProperty("thumbnail_url")
    expect(String(j.html)).toContain('title="')
  })
})

describe("social card URLs", () => {
  test("segments are encoded, and there is none when cards are off", () => {
    expect(ogPath("Books/Dune & me")).toBe("/og/Books/Dune%20%26%20me.png")
    setSite({ ogImages: false })
    expect(ogPath("Books/Dune")).toBeUndefined()
  })
})

describe("outdated notes", () => {
  test("a note tended long ago wilts after outdated.after years", () => {
    const n = { ...note("07_Project/Talk"), updated: new Date("2000-01-01"), created: new Date("2000-01-01") }
    expect(wilting(n)).toEqual({ since: new Date("2000-01-01"), after: 2, now: true })
    const fresh = { ...n, updated: new Date() }
    expect(wilting(fresh)?.now).toBe(false)
  })

  test("home, daily notes, opted-out notes and sites without the setting never wilt", () => {
    expect(wilting(note("index"))).toBeUndefined()
    expect(wilting(note("08_Journal/2026-10-05"))).toBeUndefined()
    const talk = note("07_Project/Talk")
    expect(wilting({ ...talk, source: { ...talk.source, fm: { ...talk.source.fm, outdated: false } } })).toBeUndefined()
    expect(wilting({ ...talk, updated: undefined, created: undefined })).toBeUndefined()
    setSite({ outdated: undefined })
    expect(wilting(talk)).toBeUndefined()
  })
})

describe("routes", () => {
  test("every page by slug: notes, folders, built-in pages, tags, docs and aliases", () => {
    const r = routes()
    expect(r.get("")).toEqual({ kind: "home", lang: "vi-VN" })
    expect(r.get("en-US")).toEqual({ kind: "home", lang: "en-US" })
    expect(r.get("07_Project/Talk")).toMatchObject({ kind: "note", lang: "vi-VN" })
    expect(r.get("07_Project")).toMatchObject({ kind: "folder" })
    for (const page of ["tags", "archive", "recent", "stats", "calendar", "practice"]) expect(r.get(page)?.kind as string).toBe(page === "tags" ? "tag" : page)
    expect(r.get("07_Project/Map.canvas")).toMatchObject({ kind: "canvas" })
    expect(r.get("07_Project/Poem")).toMatchObject({ kind: "alias" })
    expect([...r.values()].some((p) => p.kind === "alias" && p.note.key === "03_Atomic/Zettelkasten")).toBe(true)
    expect(r.has("changes")).toBe(false)
    expect([...r.values()].some((p) => p.kind === "history")).toBe(false)
  })

  test("with history on, changed notes get a history page and the garden a changes page", () => {
    setSite({ history: true })
    const versions = fakeVersions()
    const hasHistory = spyOn(history, "hasHistory").mockImplementation((n: Note) => n.key === "07_Project/Talk")
    try {
      const r = routes()
      expect(r.get("changes")).toEqual({ kind: "changes", lang: "vi-VN" })
      expect(r.get("07_Project/Talk/history")).toMatchObject({ kind: "history", lang: "vi-VN" })
      expect(r.has("03_Atomic/Queries/history")).toBe(false)
    } finally {
      versions.mockRestore()
      hasHistory.mockRestore()
    }
  })

  test("the fixture has no clashing URLs", () => {
    expect(routeProblems()).toEqual([])
  })

  test("pages whose URLs differ only in case are reported, the first claim kept", () => {
    setSite({ history: true })
    const vault = getVault()
    const lang = "vi-VN"
    const talk = note("07_Project/Talk")
    const zettel = note("03_Atomic/Zettelkasten")
    const fake = (key: string, slug: string): Note => ({ ...talk, key, slug, aliases: [], formerUrl: undefined })
    const folder = (dir: string) => ({ dir }) as unknown as FolderNode
    const notes = vault.notes[lang]
    const before = { notes: [...notes], talkAliases: talk.aliases, zettelAliases: zettel.aliases }
    const hasHistory = spyOn(history, "hasHistory").mockImplementation((n: Note) => n.key === "07_Project/Talk")
    try {
      // A second note of the same URL is the vault's to report; a note's own alias needs no redirect.
      notes.push(fake("zz/Twin", "07_project/talk"), fake("zz/Board", "07_project/map.canvas"), fake("zz/Log", "07_Project/Talk/History"))
      talk.aliases = ["talk"]
      zettel.aliases = ["queries"]
      vault.folders[lang].set("Tags", folder("Tags"))
      vault.folders[lang].set("Archive", folder("Archive"))
      const tag = [...vault.tags[lang].keys()][0]
      vault.tags[lang].set(tag.toUpperCase(), [])
      const messages = routeProblems().map((p) => `${p.level} ${p.file}: ${p.message}`)
      expect(messages).toEqual([
        "warning datme.yaml: the list of tags is not published: the page of folder Tags has the same URL /tags, regardless of case",
        "warning datme.yaml: the archive page is not published: the page of folder Archive has the same URL /archive, regardless of case",
        `warning datme.yaml: the page of tag ${tag.toUpperCase()} is not published: the page of tag ${tag} has the same URL /tags/${tag.toUpperCase()}, regardless of case`,
        "warning 07_Project/Talk.md: the history of 07_Project/Talk.md is not published: note zz/Log.md has the same URL /07_Project/Talk/history, regardless of case",
        "warning 07_Project/Map.canvas: canvas 07_Project/Map.canvas is not published: note zz/Board.md has the same URL /07_Project/Map.canvas, regardless of case",
        "warning 03_Atomic/Zettelkasten.md: a redirect to 03_Atomic/Zettelkasten.md is not published: note 03_Atomic/Queries.md has the same URL /03_Atomic/queries, regardless of case",
      ])
      expect(messages.some((m) => m.includes("zz/Twin"))).toBe(false)
      expect(messages.some((m) => m.includes("a redirect to 07_Project/Talk.md"))).toBe(false)
      expect(routes().get("07_project/talk")).toBeUndefined()
    } finally {
      notes.splice(0, notes.length, ...before.notes)
      talk.aliases = before.talkAliases
      zettel.aliases = before.zettelAliases
      vault.folders[lang].delete("Tags")
      vault.folders[lang].delete("Archive")
      vault.tags[lang].delete([...vault.tags[lang].keys()][0].toUpperCase())
      hasHistory.mockRestore()
    }
  })

  test("redirects list aliases and old URLs, and hand WebFinger to Bridgy Fed when asked", () => {
    const plain = redirectsFile()
    expect(plain).toContain("/07_Project/Poem /poems/rain 301")
    expect(plain.endsWith("\n")).toBe(true)
    expect(plain).not.toContain("fed.brid.gy")
    setSite({ activitypub: "bridgy" })
    expect(redirectsFile()).toContain(BRIDGY_REDIRECTS[0])
  })
})

describe("series", () => {
  test("a series named by a link is introduced by that note, its parts in order", () => {
    const s = allSeries("vi-VN").get("[[Blog post|Writing datme]]")!
    expect(s.name).toBe("Writing datme")
    expect(s.intro?.key).toBe("07_Project/Blog post")
    expect(s.parts.map((n) => n.key)).toEqual(["07_Project/Blog post", "03_Atomic/Code"])
    expect(allSeries("vi-VN")).toBe(allSeries("vi-VN"))
  })

  test("a note knows its neighbours in its series", () => {
    const place = seriesOf(note("03_Atomic/Code"))!
    expect(place.index).toBe(1)
    expect(place.prev?.key).toBe("07_Project/Blog post")
    expect(place.next).toBeUndefined()
    expect(seriesOf(note("07_Project/Talk"))).toBeUndefined()
    const talk = note("07_Project/Talk")
    expect(seriesOf({ ...talk, source: { ...talk.source, fm: { ...talk.source.fm, series: "Alone" } } })).toBeUndefined()
  })
})

describe("theme", () => {
  test("the vault's stylesheet, when it is a file", () => {
    expect(customCssFile()).toBe(path.join(site.vault, "datme.css"))
    setSite({ theme: { ...site.theme, css: "missing.css" } })
    expect(customCssFile()).toBeUndefined()
    setSite({ theme: { ...site.theme, css: "07_Project" } })
    expect(customCssFile()).toBeUndefined()
    setSite({ theme: { ...site.theme, css: "" } })
    expect(customCssFile()).toBeUndefined()
  })

  test("Google Fonts for each configured family, once", () => {
    expect(fontsHref()).toBe("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700;800&display=swap")
    setSite({ theme: { ...site.theme, fonts: { heading: "Source Serif", body: "Source Serif", code: "Iosevka" } } })
    expect(fontsHref()).toBe(
      "https://fonts.googleapis.com/css2?family=Source+Serif:wght@400;600;700;800&family=Iosevka:wght@400;600;700;800&display=swap",
    )
    setSite({ theme: { ...site.theme, fonts: {} } })
    expect(fontsHref()).toBeUndefined()
  })

  test("variables for the accent per scheme and for each font", () => {
    const css = themeCss()
    expect(css).toContain(":root:root, :root[data-look][data-look]{--accent:#7c3aed")
    expect(css).toContain(':root[data-theme="dark"][data-theme="dark"]{--accent:#c4b5fd')
    expect(css).toContain('--font-heading:"Fraunces", Georgia, serif')
    setSite({ theme: { ...site.theme, accent: "teal", fonts: { body: "Lora", code: "Iosevka" } } })
    const one = themeCss()
    expect(one).toContain("--accent:teal")
    expect(one).toContain(':root[data-theme="dark"][data-theme="dark"]{--accent:teal')
    expect(one).toContain('--font-read:"Lora", Georgia, serif')
    expect(one).toContain('--font-mono:"Iosevka", ui-monospace, monospace')
    setSite({ theme: { ...site.theme, accent: undefined, fonts: { body: "Lora" } } })
    expect(themeCss()).toBe(':root:root, :root[data-look][data-look]{--font-read:"Lora", Georgia, serif}')
    setSite({ theme: { ...site.theme, accent: undefined, fonts: {} } })
    expect(themeCss()).toBe("")
  })
})

describe("note types", () => {
  test("known types have their icon and label; unknown ones a tag", () => {
    expect(typeInfo("person", "en-US")).toEqual({ icon: "🧑‍🔬", label: "Person" })
    expect(typeInfo("recipe", "vi-VN")).toEqual({ icon: "🏷️", label: "recipe" })
  })
})

describe("the Astro integration", () => {
  type Hooks = ReturnType<typeof vaultWatcher>["hooks"]
  type BuildDone = NonNullable<Hooks["astro:build:done"]>
  type ServerSetup = NonNullable<Hooks["astro:server:setup"]>
  const hooks = vaultWatcher().hooks

  test("is datme's", () => {
    expect(vaultWatcher().name).toBe("datme")
  })

  test("in dev, a file of a sibling folder with the same prefix reloads nothing", () => {
    const handlers: Record<string, (file: string) => void> = {}
    const sent: unknown[] = []
    const server = { watcher: { add: () => {}, on: (ev: string, fn: (file: string) => void) => void (handlers[ev] = fn) }, hot: { send: (m: unknown) => void sent.push(m) } }
    hooks["astro:server:setup"]!({ server } as unknown as Parameters<ServerSetup>[0])
    const g = globalThis as { __vaultVersion?: number }
    const before = g.__vaultVersion
    try {
      handlers.change(site.vault + "-archive/Old.md")
      expect(sent).toEqual([])
    } finally {
      if (before === undefined) delete g.__vaultVersion
      else g.__vaultVersion = before
    }
  })

  test("Vite's watcher is told to leave out what datme leaves out", () => {
    type ConfigSetup = NonNullable<Hooks["astro:config:setup"]>
    const updates: unknown[] = []
    hooks["astro:config:setup"]!({ updateConfig: (c: unknown) => void updates.push(c) } as unknown as Parameters<ConfigSetup>[0])
    expect(updates).toEqual([{ vite: { server: { watch: { ignored: [ignoredInVault] } } } }])
  })

  test("the dev watcher leaves out dotfiles and ignored folders of the vault, whatever the separators", () => {
    setSite({ ignore: [...site.ignore, "Drafts"] })
    const v = site.vault
    expect(ignoredInVault(path.join(v, "03_Atomic/Queries.md"))).toBe(false)
    expect(ignoredInVault(path.join(v, ".obsidian/workspace.json"))).toBe(true)
    expect(ignoredInVault(path.join(v, "03_Atomic/.hidden.md"))).toBe(true)
    expect(ignoredInVault(path.join(v, "drafts/Idea.md"))).toBe(true)
    expect(ignoredInVault("/elsewhere/Drafts/Idea.md")).toBe(false)
    expect(ignoredInVault(v + "-other/Drafts/x.md")).toBe(false)
    setSite({ vault: "C:\\Notes\\" })
    expect(ignoredInVault("C:\\Notes\\Drafts\\Idea.md")).toBe(true)
    expect(ignoredInVault("C:\\Notes\\Ideas\\Idea.md")).toBe(false)
  })

  test("after a build: CNAME, redirects, the static actor, the Pagefind index and _headers with script hashes", async () => {
    const out = path.join(tmp, "build-all")
    fs.mkdirSync(path.join(out, "a"), { recursive: true })
    fs.writeFileSync(path.join(out, "a", "index.html"), '<html><body data-pagefind-body><h1>Hi</h1><script>console.log(1)</script></body></html>')
    fs.writeFileSync(path.join(out, "plain.txt"), "not a page")
    setSite({
      cname: true,
      redirects: true,
      activitypub: { username: "garden" },
      search: { engine: "pagefind", meaning: false },
      headers: { csp: true },
    })
    await hooks["astro:build:done"]!({ dir: pathToFileURL(out + "/") } as unknown as Parameters<BuildDone>[0])
    expect(fs.readFileSync(path.join(out, "CNAME"), "utf8")).toBe(new URL(site.url!).host + "\n")
    expect(fs.readFileSync(path.join(out, "_redirects"), "utf8")).toContain("/poems/rain 301")
    expect(JSON.parse(fs.readFileSync(path.join(out, ".well-known/webfinger"), "utf8")).subject).toContain("garden@")
    expect(fs.existsSync(path.join(out, "activitypub/actor.json"))).toBe(true)
    const box = JSON.parse(fs.readFileSync(path.join(out, "activitypub/outbox.json"), "utf8"))
    expect(box.orderedItems.length).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(out, "pagefind"))).toBe(true)
    expect(fs.readFileSync(path.join(out, "_headers"), "utf8")).toMatch(/Content-Security-Policy: .*'sha256-/)
  }, 120_000)

  test("with every extra off, it writes nothing", async () => {
    const out = path.join(tmp, "build-none")
    fs.mkdirSync(out, { recursive: true })
    setSite({ cname: false, redirects: false, activitypub: undefined, headers: false })
    await hooks["astro:build:done"]!({ dir: pathToFileURL(out + "/") } as unknown as Parameters<BuildDone>[0])
    expect(fs.readdirSync(out)).toEqual([])
  })

  test("bridgy needs no static actor, a header file without CSP needs no hashes, and empty redirects are not written", async () => {
    const out = path.join(tmp, "build-bridgy")
    fs.mkdirSync(out, { recursive: true })
    setSite({ cname: true, url: undefined, redirects: true, activitypub: "bridgy", headers: { csp: false } })
    const empty = spyOn(await import("../src/lib/routes"), "redirectsFile").mockReturnValue("")
    try {
      await hooks["astro:build:done"]!({ dir: pathToFileURL(out + "/") } as unknown as Parameters<BuildDone>[0])
    } finally {
      empty.mockRestore()
    }
    expect(fs.readdirSync(out)).toEqual(["_headers"])
    expect(fs.readFileSync(path.join(out, "_headers"), "utf8").split("\n\n")[0]).not.toContain("Content-Security-Policy")
  })

  test("in dev, notes are watched and a change rebuilds the index and reloads the page", () => {
    const watched: string[] = []
    const handlers: Record<string, (file: string) => void> = {}
    const sent: unknown[] = []
    const server = {
      watcher: { add: (p: string) => void watched.push(p), on: (ev: string, fn: (file: string) => void) => void (handlers[ev] = fn) },
      hot: { send: (msg: unknown) => void sent.push(msg) },
    }
    setSite({ ignore: [...site.ignore, "07_Project"] })
    hooks["astro:server:setup"]!({ server } as unknown as Parameters<ServerSetup>[0])
    expect(watched).toEqual([site.vault])
    expect(Object.keys(handlers).sort()).toEqual(["add", "change", "unlink"])
    const g = globalThis as { __vaultVersion?: number }
    const before = g.__vaultVersion
    try {
      handlers.change("/elsewhere/x.md")
      handlers.change(path.join(site.vault, ".git/HEAD"))
      handlers.change(path.join(site.vault, "07_Project/Talk.md"))
      expect(sent).toEqual([])
      handlers.add(path.join(site.vault, "New.md"))
      expect(sent).toEqual([{ type: "full-reload" }])
      expect(g.__vaultVersion).toBe((before ?? 0) + 1)
    } finally {
      if (before === undefined) delete g.__vaultVersion
      else g.__vaultVersion = before
    }
  })
})
