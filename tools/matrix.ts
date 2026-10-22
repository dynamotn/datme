/**
 * The style × layout matrix in a real browser: builds tests/fixtures/layouts
 * once per built-in style (see tests/look-matrix-site.ts), serves each site and
 * opens every layout's page in Playwright's Chromium, at 1280 and 390 px wide.
 * It fails on a page that scrolls sideways, on content of a layout that the
 * style hides, and on text of a layout below WCAG AA contrast against the
 * colours behind it, light and dark. The unit suite checks the same pages'
 * markup and axe rules (tests/look-matrix.test.ts); this takes a minute or two
 * more, so it runs on its own:
 *
 *   bun run matrix                     every style
 *   bun run matrix wiki zine           some styles
 *   bun run matrix --shots /tmp/sheet  also a contact sheet per page, every style side by side
 *
 * Needs `bunx playwright install chromium` once.
 */
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { chromium, type Page } from "playwright"
import { STYLES, type Style } from "../src/site.config"
import { buildMatrix, MATRIX_PAGES, OWN_STYLE, type MatrixPage } from "../tests/look-matrix-site"

const args = process.argv.slice(2)
const shotsAt = args.indexOf("--shots")
const shots = shotsAt >= 0 ? path.resolve(args.splice(shotsAt, 2)[1] ?? "") : undefined
const unknown = args.filter((a) => !(STYLES as readonly string[]).includes(a))
if (unknown.length) throw new Error(`unknown style ${unknown.join(", ")}: one of ${STYLES.join(", ")}`)
const styles = args.length ? (args as Style[]) : [...STYLES]
const WIDTHS = [1280, 390] as const

const started = Date.now()
const dir = await buildMatrix(styles)
console.log(`Built ${styles.length} sites in ${((Date.now() - started) / 1000).toFixed(1)} s`)

/** One server per style: the sites link their assets from the root. */
const servers = new Map(
  styles.map((style) => {
    const site = path.join(dir, style)
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const p = decodeURIComponent(new URL(req.url).pathname)
        for (const candidate of [p, path.join(p, "index.html"), `${p}.html`]) {
          const file = Bun.file(path.join(site, candidate))
          if (!candidate.endsWith("/") && (await file.exists())) return new Response(file)
        }
        return new Response("not found", { status: 404 })
      },
    })
    return [style, server] as const
  }),
)

interface Finding {
  style: Style
  page: string
  layout: string
  problem: string
}
const findings: Finding[] = []

/**
 * What one page shows at the current width, measured in the page: whether it scrolls sideways (and the
 * outermost elements that stick out), which kept selectors have nothing visible, and the text of the layout
 * that falls below AA against its background, when asked to.
 */
function inspect({ keep, contrast }: { keep: string[]; contrast: boolean }) {
  const width = document.documentElement.clientWidth
  const describe = (el: Element) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : "") +
    [...el.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("")
  const scrolls = document.scrollingElement!.scrollWidth > width + 1
  const sticking: string[] = []
  if (scrolls) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= width + 1) continue
      // Inside a box that scrolls or clips on its own, which fits, it moves nothing.
      let clipped = false
      for (let a = el.parentElement; a && !clipped; a = a.parentElement)
        clipped = getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= width + 1
      const parent = el.parentElement!
      if (clipped || (parent !== document.body && parent.getBoundingClientRect().right > width + 1)) continue
      sticking.push(`${describe(el)} (${Math.round(r.right)} px)`)
      if (sticking.length === 4) break
    }
  }
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  }
  const hidden = keep.filter((sel) => ![...document.querySelectorAll(sel)].some(seen))

  const low: string[] = []
  if (contrast) {
    type Rgba = [number, number, number, number]
    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    /** Any CSS colour as sRGB with alpha, through the canvas, which knows oklch() and color-mix(). */
    const rgba = (css: string): Rgba => {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = css
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3])
      return a === 0 ? [0, 0, 0, 0] : ([0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a) as Rgba)
    }
    const lum = ([r, g, b]: Rgba) => {
      const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
    }
    /** The colour behind an element: the backgrounds of it and its ancestors, from the canvas up; pictures not counted. */
    const ground = (el: Element): Rgba => {
      const chain: Element[] = []
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
      let bg: Rgba = [255, 255, 255, 1]
      for (const e of chain) bg = over(rgba(getComputedStyle(e).backgroundColor), bg)
      return bg
    }
    const scope = document.querySelectorAll('article[class*="layout-"], .collection, ' + keep.join(", "))
    const done = new Set<Element>()
    for (const area of scope) {
      for (const el of [area, ...area.querySelectorAll("*")]) {
        if (done.has(el) || el.closest("svg, pre, code, .sr-only, [aria-hidden=true]")) continue
        done.add(el)
        // Words and numbers only: a separator dot or the empty stars of a rating are decoration.
        const text = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && /[\p{L}\p{N}]/u.test(n.textContent!))
        if (!text || !seen(el)) continue
        const cs = getComputedStyle(el)
        // Text filled with a picture or gradient has no colour of its own to measure.
        if (cs.backgroundClip === "text" || cs.getPropertyValue("-webkit-background-clip") === "text") continue
        let opacity = 1
        for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
        const bg = ground(el)
        const fg = rgba(cs.color)
        const ink = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg)
        const [hi, lo] = [lum(ink), lum(bg)].sort((a, b) => b - a)
        const ratio = (hi + 0.05) / (lo + 0.05)
        const size = parseFloat(cs.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
        if (ratio < (large ? 3 : 4.5)) low.push(`${describe(el)} "${el.textContent!.trim().slice(0, 24)}" ${ratio.toFixed(2)}:1`)
      }
    }
  }
  return { scrolls, sticking, hidden, low: [...new Set(low)] }
}

/** Opens one page of one style and records what is wrong with it, at each width and, at the widest, in each scheme. */
async function check(page: Page, style: Style, mp: MatrixPage): Promise<Buffer | undefined> {
  const url = `http://localhost:${servers.get(style)!.port}/${mp.page}`
  const report = (problem: string) => findings.push({ style, page: mp.page || "/", layout: mp.layout, problem })
  let shot: Buffer | undefined
  // Loaded afresh at each width, as a phone would: scripts size some parts (the calendar of a journal) on load.
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(url, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))))
    for (const scheme of width === WIDTHS[0] ? (["light", "dark"] as const) : (["light"] as const)) {
      await page.evaluate((scheme) => (document.documentElement.dataset.theme = scheme), scheme)
      const seen = await page.evaluate(inspect, { keep: mp.keep, contrast: width === WIDTHS[0] })
      if (seen.scrolls) report(`scrolls sideways at ${width} px: ${seen.sticking.join(", ")}`)
      for (const sel of seen.hidden) report(`${sel} is not visible at ${width} px (${scheme})`)
      if (seen.low.length)
        report(`low contrast (${scheme}): ${seen.low.slice(0, 4).join("; ")}${seen.low.length > 4 ? ` and ${seen.low.length - 4} more` : ""}`)
      if (shots && width === WIDTHS[0] && scheme === "light") shot = await page.screenshot({ type: "jpeg", quality: 70 })
    }
  }
  return shot
}

const browser = await chromium.launch()
const sheets = new Map<string, { style: Style; shot: Buffer }[]>()
try {
  // No service worker: the offline cache would fetch the whole site behind each page.
  const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" })
  // Only the local sites: map tiles and other outside requests would keep pages loading.
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort())
  const jobs = styles.flatMap((style) => MATRIX_PAGES.filter((mp) => !OWN_STYLE[mp.layout] || style === styles[0]).map((mp) => ({ style, mp })))
  const worker = async () => {
    const page = await context.newPage()
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const shot = await check(page, job.style, job.mp).catch((err: Error) => {
        findings.push({ style: job.style, page: job.mp.page || "/", layout: job.mp.layout, problem: `not checked: ${err.message.split("\n")[0]}` })
        return undefined
      })
      if (shot) sheets.set(job.mp.page, [...(sheets.get(job.mp.page) ?? []), { style: job.style, shot }])
    }
    await page.close()
  }
  const total = jobs.length
  await Promise.all(Array.from({ length: 8 }, worker))
  console.log(`Checked ${total} pages (${styles.length} styles × ${MATRIX_PAGES.length} pages) in ${((Date.now() - started) / 1000).toFixed(1)} s`)
} finally {
  await browser.close()
  for (const server of servers.values()) server.stop(true)
  fs.rmSync(dir, { recursive: true, force: true })
}

if (shots) {
  fs.mkdirSync(shots, { recursive: true })
  const [w, h, cols] = [320, 225, 6]
  for (const [page, list] of sheets) {
    list.sort((a, b) => styles.indexOf(a.style) - styles.indexOf(b.style))
    const tiles = await Promise.all(list.map(async ({ shot }) => sharp(shot).resize(w, h, { position: "top" }).toBuffer()))
    const name = (page.replace(/\/+$/, "").replace(/\//g, "-") || "home") + ".jpg"
    await sharp({ create: { width: w * cols, height: h * Math.ceil(tiles.length / cols), channels: 3, background: "#888" } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
      .jpeg({ quality: 75 })
      .toFile(path.join(shots, name))
  }
  console.log(`Contact sheets in ${shots}, styles in the order ${styles.join(", ")}`)
}
for (const f of findings) console.log(`✗ ${f.style} · ${f.layout} (${f.page}): ${f.problem}`)
if (findings.length) {
  console.log(`${findings.length} problem(s)`)
  process.exit(1)
}
console.log("No problems")
