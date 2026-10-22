/**
 * Screenshots of the documentation garden: builds docs/, serves it, and
 * captures a few views for the README with Playwright's Chromium into
 * docs/assets/screenshots/; then serves docs/ with `datme dev` and captures a
 * note in every built-in style, light and dark, for docs/themes.md, into
 * docs/assets/screenshots/styles/ as small WebP files; and captures the
 * example of every page layout under docs/examples/ for docs/layouts-text.md
 * and docs/collections.md, into docs/assets/screenshots/layouts/. Run with
 * `bun run screenshots` (or `bun run screenshots readme` / `styles` /
 * `layouts` for one set) after `bunx playwright install chromium`.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { chromium, type Browser, type Page } from "playwright"
import { STYLES } from "../src/site.config"
import { LAYOUTS } from "../src/lib/vault"
import { parseYaml } from "../src/lib/yaml"

const root = path.resolve(import.meta.dir, "..")
const outDir = path.join(root, "docs/assets/screenshots")
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" }
/** The note every style is shown on: callouts, math, a table and code. */
const STYLE_PAGE = "/showcase/Callouts-and-math"
/** The path the docs are published under, from the path of their site.url: "/datme", or "" at the root. */
const { site: docsSite } = parseYaml(fs.readFileSync(path.join(root, "docs/datme.yaml"), "utf8")) as { site: { url: string } }
const docsPath = new URL(docsSite.url).pathname.replace(/\/+$/, "")
/** The example note of each layout under docs/examples/, by its path there. */
const LAYOUT_EXAMPLES: Record<(typeof LAYOUTS)[number], string> = {
  cv: "cv",
  gallery: "gallery",
  timeline: "timeline",
  links: "links",
  uses: "uses",
  now: "now",
  faq: "faq",
  quotes: "quotes",
  paper: "paper",
  decision: "decision",
  changelog: "changelog",
  dialogue: "dialogue",
  highlights: "highlights",
  glossary: "glossary",
  trip: "trip",
  syllabus: "syllabus",
  poem: "poem",
  letter: "letter",
  compare: "compare",
  checklist: "checklist",
  "recipe-card": "recipe-card",
  hub: "hub",
  lore: "lore",
  projects: "Projects",
  books: "Books",
  movies: "Movies",
  talks: "Talks",
  recipes: "Recipes",
  places: "Travel",
  shelf: "Games",
  daily: "Journal",
  bookmarks: "Clippings",
  people: "People",
  snippets: "Snippets",
  episodes: "Podcast",
  courses: "Courses",
  wishlist: "Wishlist",
  quotebook: "Quotebook",
  questions: "Questions",
  digest: "Digest",
}

const SETS = ["readme", "styles", "layouts"] as const
const only = process.argv[2]
if (only && !SETS.includes(only as (typeof SETS)[number])) throw new Error(`unknown set ${only}: ${SETS.join(", ")}`)
const wanted = (set: (typeof SETS)[number]) => !only || only === set

const browser = await chromium.launch()
try {
  if (wanted("readme")) await readmeShots(browser)
  if (wanted("styles")) await styleShots(browser)
  if (wanted("layouts")) await layoutShots(browser)
} finally {
  await browser.close()
}

/** A page in a colour scheme, as if the reader had picked it with the toggle. */
async function openPage(browser: Browser, url: string, theme: "light" | "dark", width = 1440, height = 900): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme })
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme)
  await page.goto(url, { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  return page
}

/** Builds docs/ into a temporary folder and serves it; `stop` stops the server and removes the build. */
function serveBuiltDocs(): { base: string; stop: () => void } {
  const site = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-shots-")), "site")

  const build = Bun.spawnSync(["bun", "bin/datme.ts", "build", "docs", "--out", site, "--fresh"], {
    cwd: root,
    env,
    stdout: "inherit",
    stderr: "inherit",
  })
  if (build.exitCode !== 0) throw new Error("datme build docs failed")

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      // Pages and assets are linked under the path of site.url, as the build is published.
      const full = decodeURIComponent(new URL(req.url).pathname)
      const p = full.startsWith(docsPath) ? full.slice(docsPath.length) || "/" : full
      for (const candidate of [p, path.join(p, "index.html"), `${p}.html`]) {
        const file = Bun.file(path.join(site, candidate))
        if ((await file.exists()) && !candidate.endsWith("/")) return new Response(file)
      }
      return new Response(Bun.file(path.join(site, "404.html")), { status: 404 })
    },
  })
  return {
    base: `http://localhost:${server.port}${docsPath}`,
    stop: () => {
      server.stop()
      fs.rmSync(path.dirname(site), { recursive: true, force: true })
    },
  }
}

async function readmeShots(browser: Browser) {
  const { base, stop } = serveBuiltDocs()

  interface Shot {
    name: string
    url: string
    theme: "light" | "dark"
    /** Done after the page loads, before the capture. */
    act?: (page: Page) => Promise<void>
  }

  const shots: Shot[] = [
    { name: "home", url: "/", theme: "light" },
    { name: "note-dark", url: "/showcase/Callouts-and-math", theme: "dark" },
    {
      name: "graph",
      url: "/showcase/Showcase",
      theme: "dark",
      act: async (page) => {
        await page.keyboard.press("Control+g")
        await page.waitForTimeout(2500)
      },
    },
    { name: "slides", url: "/showcase/A-slide-deck", theme: "light" },
    { name: "drawing", url: "/showcase/Sketch.excalidraw", theme: "light" },
    {
      name: "search",
      url: "/",
      theme: "light",
      act: async (page) => {
        await page.keyboard.press("Control+k")
        await page.keyboard.type("garden", { delay: 60 })
        await page.waitForTimeout(800)
      },
    },
  ]

  fs.mkdirSync(outDir, { recursive: true })
  try {
    for (const shot of shots) {
      const page = await openPage(browser, base + shot.url, shot.theme)
      await shot.act?.(page)
      const file = path.join(outDir, `${shot.name}.png`)
      await page.screenshot({ path: file })
      console.log(`📸 ${path.relative(root, file)}`)
      await page.close()
    }
  } finally {
    stop()
  }
}

/**
 * The gallery of docs/themes.md: the same note previewed in every style with
 * `?style=`, which only `datme dev` reads, with the dev bar hidden.
 */
async function styleShots(browser: Browser) {
  // A port free now; Astro would move to the next one if it were taken, and the pages would be another server's.
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port
  probe.stop(true)
  const dev = Bun.spawn(["bun", "bin/datme.ts", "dev", "docs", "--port", String(port)], { cwd: root, env, stdout: "ignore", stderr: "inherit" })
  // `datme dev` serves the docs under the path of their site.url, as the build is published.
  const base = `http://localhost:${port}${docsPath}`
  const dir = path.join(outDir, "styles")
  fs.mkdirSync(dir, { recursive: true })
  try {
    for (let tries = 0; ; tries++) {
      const ok = await fetch(base + STYLE_PAGE).then(
        async (r) => r.ok && (await r.text()).includes("data-look="),
        () => false,
      )
      if (ok) break
      if (tries > 120) throw new Error("datme dev did not answer")
      await Bun.sleep(1000)
    }
    for (const style of STYLES) {
      for (const theme of ["light", "dark"] as const) {
        const page = await openPage(browser, `${base}${STYLE_PAGE}?style=${style}`, theme, 1200, 760)
        await page.addStyleTag({ content: ".dev-look, .dev-problems, astro-dev-toolbar { display: none !important }" })
        await page.waitForTimeout(300)
        const file = path.join(dir, `${style}-${theme}.webp`)
        await sharp(await page.screenshot())
          .webp({ quality: 72 })
          .toFile(file)
        console.log(`📸 ${path.relative(root, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`)
        await page.close()
      }
    }
  } finally {
    dev.kill()
  }
}

/**
 * The gallery of docs/layouts-text.md and docs/collections.md: the example
 * of every layout, from a build of docs/, in light mode (a gallery in dark,
 * as it opens), 1200 pixels wide, as small WebP files.
 */
async function layoutShots(browser: Browser) {
  const { base, stop } = serveBuiltDocs()
  const dir = path.join(outDir, "layouts")
  fs.mkdirSync(dir, { recursive: true })
  let total = 0
  try {
    for (const layout of LAYOUTS) {
      // A collection is the page of its folder; a note's URL has dashes for spaces.
      const url = `${base}/examples/${LAYOUT_EXAMPLES[layout].replaceAll(" ", "-")}`
      const page = await openPage(browser, url, layout === "gallery" ? "dark" : "light", 1200, 800)
      if (!(await page.$(`.layout-${layout}, .collection-${layout}`))) throw new Error(`${url} is not laid out as ${layout}`)
      // Map tiles come from OpenStreetMap after the page is idle; a map without them is still worth a picture.
      if (await page.$(".leaflet-container")) {
        await page.waitForSelector(".leaflet-tile-loaded", { timeout: 15_000 }).catch(() => console.warn(`no map tiles on ${url}`))
        await page.waitForTimeout(1500)
      }
      const file = path.join(dir, `${layout}.webp`)
      await sharp(await page.screenshot())
        .webp({ quality: 70 })
        .toFile(file)
      const size = fs.statSync(file).size
      total += size
      console.log(`📸 ${path.relative(root, file)} (${Math.round(size / 1024)} KB)`)
      await page.close()
    }
    console.log(`${LAYOUTS.length} layouts, ${Math.round(total / 1024)} KB`)
  } finally {
    stop()
  }
}
