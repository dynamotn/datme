/**
 * The style × layout matrix: tests/fixtures/layouts, which has a note in every
 * layout and a folder for every collection, built once per built-in style with
 * that style site-wide. Shared by tests/look-matrix.test.ts (markup and axe)
 * and tools/matrix.ts (overflow, visibility and contrast in Chromium).
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { STYLES, type Style } from "../src/site.config"

const root = path.resolve(import.meta.dir, "..")
const fixture = path.join(root, "tests/fixtures/layouts")

/** A page of the matrix: its layout, and selectors of what the layout shows, each of which must be there. */
export interface MatrixPage {
  page: string
  layout: string
  keep: string[]
}

/** The page of every layout, then the folder page of every collection, then the home. */
export const MATRIX_PAGES: MatrixPage[] = [
  { page: "CV", layout: "cv", keep: [".cv-head", ".cv-section"] },
  { page: "Covers", layout: "gallery", keep: [".gallery-item"] },
  { page: "Life", layout: "timeline", keep: [".life-event"] },
  { page: "Links", layout: "links", keep: [".link-hub", ".hub-head"] },
  { page: "Uses", layout: "uses", keep: [".uses-grid"] },
  { page: "Now", layout: "now", keep: [".now-stamp"] },
  { page: "FAQ", layout: "faq", keep: [".faq-item"] },
  { page: "Quotes", layout: "quotes", keep: [".quote-card"] },
  { page: "Paper", layout: "paper", keep: [".paper-authors", ".paper-abstract", ".paper-cite"] },
  { page: "Decision", layout: "decision", keep: [".adr-status", ".adr-section"] },
  { page: "Changelog", layout: "changelog", keep: [".release", ".change-tag"] },
  { page: "Interview", layout: "dialogue", keep: [".dialogue-line", ".dialogue-who"] },
  { page: "Smart-Notes-highlights", layout: "highlights", keep: [".highlight-card"] },
  { page: "Terms", layout: "glossary", keep: [".glossary-entry", ".glossary-letters"] },
  { page: "Japan-trip", layout: "trip", keep: [".trip-stop"] },
  { page: "Course", layout: "syllabus", keep: [".lesson", ".syllabus-progress"] },
  { page: "Poem", layout: "poem", keep: [".stanza"] },
  { page: "Letter", layout: "letter", keep: [".letter-salutation", ".letter-closing"] },
  { page: "Note-apps", layout: "compare", keep: [".compare-table"] },
  { page: "Packing", layout: "checklist", keep: [".checklist-progress", ".task-list-item"] },
  { page: "Pancakes", layout: "recipe-card", keep: [".recipe-ingredients", ".recipe-steps"] },
  { page: "Map-of-content", layout: "hub", keep: [".hub-sections"] },
  { page: "Lore/Aria", layout: "lore", keep: [".lore-tree"] },
  { page: "Projects/Projects", layout: "projects", keep: [".project-card"] },
  { page: "Books", layout: "books", keep: [".book"] },
  { page: "Movies", layout: "movies", keep: [".book"] },
  { page: "Talks/Talks", layout: "talks", keep: [".talk"] },
  { page: "Recipes/Recipes", layout: "recipes", keep: [".project-card"] },
  { page: "Places", layout: "places", keep: [".project-card"] },
  { page: "Games", layout: "shelf", keep: [".book"] },
  { page: "Journal/Journal", layout: "daily", keep: [".activity-grid", ".talk"] },
  { page: "Clippings/Clippings", layout: "bookmarks", keep: [".bookmark"] },
  { page: "People/People", layout: "people", keep: [".person"] },
  { page: "Snippets/Snippets", layout: "snippets", keep: [".snippet"] },
  { page: "Podcast/Podcast", layout: "episodes", keep: [".episode"] },
  { page: "Courses/Courses", layout: "courses", keep: [".course"] },
  { page: "Wishlist/Wishlist", layout: "wishlist", keep: [".wish"] },
  { page: "Quotebook/By-source", layout: "quotebook", keep: [".quote-card"] },
  { page: "Questions/Questions", layout: "questions", keep: [".question"] },
  { page: "Digest/Digest", layout: "digest", keep: [".digest-week"] },
  ...(
    [
      ["Projects", "projects", ".project-card"],
      ["Talks", "talks", ".talk"],
      ["Recipes", "recipes", ".project-card"],
      ["Journal", "daily", ".talk"],
      ["Clippings", "bookmarks", ".bookmark"],
      ["People", "people", ".person"],
      ["Snippets", "snippets", ".snippet"],
      ["Podcast", "episodes", ".episode"],
      ["Courses", "courses", ".course"],
      ["Wishlist", "wishlist", ".wish"],
      ["Quotebook", "quotebook", ".quote-card"],
      ["Questions", "questions", ".question"],
      ["Digest", "digest", ".digest-week"],
    ] as const
  ).map(([page, layout, keep]) => ({ page: `${page}/`, layout: `${layout} folder`, keep: [keep] })),
  { page: "", layout: "home", keep: ["main"] },
]

/** The built file of a matrix page. */
export const pageFile = (page: string) => path.join(page, "index.html")

/** Layouts that bring a style of their own, which the site's style does not change. */
export const OWN_STYLE: Record<string, Style> = { cv: "resume", links: "classic", gallery: "darkroom" }

const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" }

/**
 * Builds the fixture once per style, a few at a time, and returns the folder holding a site per style.
 * Each vault is a copy with the style set site-wide; the build cache stays off, as builds running side
 * by side would prune each other's entries.
 */
export async function buildMatrix(styles: readonly Style[] = STYLES, parallel = Math.max(2, Math.min(6, os.availableParallelism() >> 1))): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-matrix-"))
  const config = fs.readFileSync(path.join(fixture, "datme.yaml"), "utf8")
  const queue = [...styles]
  const worker = async () => {
    for (let style = queue.shift(); style; style = queue.shift()) {
      const vault = path.join(dir, "vaults", style)
      fs.cpSync(fixture, vault, { recursive: true, preserveTimestamps: true })
      fs.writeFileSync(path.join(vault, "datme.yaml"), `${config}appearance:\n  style: ${style}\n`)
      // A build stopped by a signal from outside, as on a busy machine, gets a second go.
      for (let tries = 1; ; tries++) {
        const proc = Bun.spawn(["bun", "bin/datme.ts", "build", vault, "--out", path.join(dir, style)], { cwd: root, env, stdout: "pipe", stderr: "pipe" })
        const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
        if (code === 0) break
        const killed = proc.signalCode ?? (code > 128 ? `exit ${code}` : undefined)
        if (!killed || tries === 2) throw new Error(`${style}: ${killed ?? ""} ${stderr || stdout}`)
      }
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker))
  return dir
}
