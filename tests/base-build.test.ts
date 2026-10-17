import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: the fixture vault published under a path, as GitHub and GitLab
// project Pages serve a site (https://user.github.io/repo/).
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/vault")
const SITE = "https://x.dev/garden"
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")

function* files(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else yield path.relative(out, p)
  }
}

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-base-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out, "--site", SITE + "/"], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => {
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

describe("a site served under a path", () => {
  test("every link of every page stays under it", () => {
    const pages = [...files(out)].filter((f) => f.endsWith(".html"))
    expect(pages.length).toBeGreaterThan(50)
    const escaped = new Set<string>()
    for (const page of pages) {
      const html = read(page)
      for (const m of html.matchAll(/\b(href|src|srcset|content|action|poster)="(\/[^"]*)"/g)) {
        if (!m[2].startsWith("/garden/") && !m[2].startsWith("//")) escaped.add(`${page}: ${m[1]}="${m[2]}"`)
      }
      for (const m of html.matchAll(/https:\/\/x\.dev(\/[^"'<\s]*)?/g)) {
        if (!m[1]?.startsWith("/garden/")) escaped.add(`${page}: ${m[0]}`)
      }
    }
    expect([...escaped]).toEqual([])
  })

  test("wikilinks, tags, assets and social cards point under it", () => {
    const note = read("03_Atomic/Zettelkasten/index.html")
    expect(note).toContain('<link rel="canonical" href="https://x.dev/garden/03_Atomic/Zettelkasten/">')
    expect(note).toContain('<meta property="og:image" content="https://x.dev/garden/og/03_Atomic/Zettelkasten.png">')
    expect(note).toContain('href="/garden/06_Reference/Niklas-Luhmann"')
    expect(note).toMatch(/href="\/garden\/tags\/[^"]+"/)
    expect(note).toContain('<link rel="icon" href="/garden/favicon.svg"')
    expect(note).toContain('<link rel="manifest" href="/garden/manifest.webmanifest">')
    expect(note).toMatch(/<script type="module" src="\/garden\/_astro\//)
    expect(note).toContain('"url":"https://x.dev/garden/03_Atomic/Zettelkasten"')
    expect(read("index.html")).toContain('<a class="p-name u-url" href="https://x.dev/garden/">')
    expect([...files(out)].some((f) => f.startsWith("assets/"))).toBe(true)
    expect(read("index.html")).toContain('src="/garden/assets/_assets/images/diagram.png"')
  })

  test("aliases redirect, and the markdown and oEmbed copies sit next to their pages", () => {
    expect(read("03_Atomic/Slip-box/index.html")).toContain('content="0; url=/garden/03_Atomic/Zettelkasten"')
    expect(read("_redirects")).toContain("/garden/03_Atomic/Slip-box /garden/03_Atomic/Zettelkasten 301")
    expect(read("03_Atomic/Zettelkasten.md")).toContain("Zettelkasten")
    const oembed = JSON.parse(read("03_Atomic/Zettelkasten.oembed.json"))
    expect(oembed.provider_url).toBe("https://x.dev/garden/")
    expect(oembed.html).toContain('src="https://x.dev/garden/03_Atomic/Zettelkasten/embed"')
    expect(read("03_Atomic/Zettelkasten/embed/index.html")).toContain('href="https://x.dev/garden/03_Atomic/Zettelkasten"')
  })

  test("feeds, sitemap, robots.txt and llms.txt give full URLs under it", () => {
    const rss = read("index.xml")
    const links = [...rss.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(3)
    for (const l of links) expect(l).toStartWith("https://x.dev/garden/")
    const sitemap = read("sitemap-0.xml")
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toContain("https://x.dev/garden/03_Atomic/Zettelkasten/")
    for (const l of locs) expect(l).toStartWith("https://x.dev/garden/")
    // Pages kept out of search engines stay out of the sitemap: unlisted notes and redirects.
    expect(read("08_Journal/Unlisted/index.html")).toContain('<meta name="robots" content="noindex">')
    expect(locs.filter((l) => /Unlisted|Slip-box/.test(l))).toEqual([])
    expect(read("robots.txt")).toContain("Sitemap: https://x.dev/garden/sitemap-index.xml")
    const llms = read("llms.txt")
    expect(llms).toContain("(https://x.dev/garden/03_Atomic/Zettelkasten.md)")
    expect(llms).toContain("[Full text](https://x.dev/garden/llms-full.txt)")
    expect(read("llms-full.txt")).toContain("Source: https://x.dev/garden/03_Atomic/Zettelkasten")
    expect(read("03_Atomic/Zettelkasten/index.html")).toContain(encodeURIComponent("https://x.dev/garden/03_Atomic/Zettelkasten.md"))
  })

  test("the app installs and works offline within it", () => {
    const m = JSON.parse(read("manifest.webmanifest"))
    expect([m.start_url, m.scope]).toEqual(["/garden/", "/garden/"])
    const sw = read("sw.js")
    expect(sw).toContain('const PRECACHE = ["/garden/","/garden/en-US"]')
    expect(sw).toContain('url.pathname.startsWith("/garden/_astro/")')
    expect(read("_headers")).toContain("/garden/assets/*.svg\n")
    expect(read("_headers")).toContain("/garden/sw.js\n  Cache-Control: no-cache")
  })

  test("the scripts fetch the site's files through its path", () => {
    const js = [...files(out)].filter((f) => f.startsWith("_astro/") && f.endsWith(".js")).map(read).join("\n")
    expect(js).toContain("`/garden/`")
    // Every file the scripts ask for by name goes through the helper, never as a bare root path.
    expect(js).not.toMatch(/fetch\([`"']\/|register\([`"']\/|origin\}\/pagefind|[`"']\/static\/[^`"']*[`"']\)\.then/)
    for (const m of js.matchAll(/[`"']\/(static|pagefind|sw\.js)/g)) {
      expect(js.slice(Math.max(0, m.index - 3), m.index)).toMatch(/[\w$]\($/)
    }
  })
})
