import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { StringDecoder } from "node:string_decoder"
import { parseYaml } from "./yaml"
import { site, type Lang } from "../site.config"
import { pickOption, CHROMES } from "./look"
import { langPrefix, t } from "./i18n"
import { sluggify, slugTag, slugToUrl, urlToSlug } from "./slug"
import { preprocess, DOC, assetUrl } from "./obsidian"
import { flashcards, isDeck } from "./flashcards"
import { isKanban, kanban } from "./kanban"
import { resolvePassword, splitLocked } from "./locked"
import { isSlides, isTheme, slideDirectives } from "./slides"
import { keepIndent, markProsCons } from "./layout-source"
import { cite, parseBibtex, type BibEntry } from "./citations"
import { citationPlaces, FM_RE, propertyPlace, yamlErrorPlace, type Place } from "./positions"
import { CONFIG_FILES } from "./config-files"
import { contentLanguage, fallbackOf, filterLanguage, textLanguages } from "./vault-languages"
import { fold, linkResolver, MD_EXT, orNone, toArray } from "./vault-links"
import { buildDocs, drawingRenderer } from "./vault-drawings"
import { deriveIndexes } from "./vault-indexes"
import { LAYOUTS, type Note, type Problem, type SourceNote, type Vault } from "./vault-types"

export * from "./vault-types"
export { contentLanguage, fallbackOf, filterLanguage, textLanguages } from "./vault-languages"
export { countNotes } from "./vault-indexes"

/** Whether a vault-relative path is in an ignored folder; regardless of case, so Templates is ignored like templates. */
export function isIgnored(rel: string): boolean {
  const lower = rel.toLowerCase()
  return site.ignore.some((ig) => {
    const i = ig.toLowerCase()
    return lower === i || lower.startsWith(i + "/")
  })
}

function walk(dir: string, out: { md: string[]; files: string[]; broken?: string[] }, rel = ""): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (isIgnored(childRel) || entry.name.startsWith(".")) continue
    const abs = path.join(dir, entry.name)
    let isDir = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(abs).isDirectory()
      } catch {
        // pointing nowhere: skipped, and reported by the vault
        out.broken?.push(childRel)
        continue
      }
    }
    if (isDir) walk(abs, out, childRel)
    else if (MD_EXT.test(entry.name)) out.md.push(childRel)
    else out.files.push(childRel)
  }
}

/** Vault-relative paths of every markdown file datme reads, published or not. */
export function markdownFiles(): string[] {
  const found = { md: [] as string[], files: [] as string[] }
  walk(site.vault, found)
  return found.md
}

export function parseFrontmatter(src: string): { fm: Record<string, unknown>; body: string; error?: string } {
  // A byte order mark, as some Windows editors write, would hide the frontmatter.
  src = src.replace(/^\uFEFF/, "")
  const m = src.match(FM_RE)
  if (!m) return { fm: {}, body: src }
  let fm: Record<string, unknown> = {}
  let error: string | undefined
  try {
    const parsed = parseYaml(m[1], { json: true })
    if (parsed && typeof parsed === "object") fm = parsed as Record<string, unknown>
  } catch (e) {
    // malformed frontmatter: treat the note as having none
    error = (e as Error).message.split("\n")[0]
  }
  return { fm, body: src.slice(m[0].length), error }
}

function toDate(v: unknown): Date | undefined {
  if (v == null || v === "") return undefined
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Whether a note's frontmatter allows publishing it under the given mode. */
/** The date a note is scheduled to appear, from `publish_date` (or `publishDate`). */
export function scheduledFor(fm: Record<string, unknown>): Date | undefined {
  return toDate(fm.publish_date ?? fm.publishDate)
}

const flag = (v: unknown) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined)

/** A draft, or a note scheduled for later: what `--drafts` builds on top of the rest. */
export function isDraft(fm: Record<string, unknown>, now = new Date()): boolean {
  const at = scheduledFor(fm)
  return flag(fm.draft) === true || (at != null && at > now)
}

export function isPublished(fm: Record<string, unknown>, mode: "explicit" | "all", now = new Date(), drafts = false): boolean {
  // A scheduled note waits for its day; the next build after it publishes the note.
  if (!drafts && isDraft(fm, now)) return false
  const publish = flag(fm.publish)
  return mode === "explicit" ? publish === true : publish !== false
}

/** Language a note is written in: its `lang` frontmatter when the site has it, else the site's default. */
export function sourceLangOf(fm: Record<string, unknown>): Lang {
  return typeof fm.lang === "string" && site.langs.includes(fm.lang) ? fm.lang : site.defaultLang
}

/** Calls `onLine` with each line of an open file, read a chunk at a time, so its size is no limit. */
export function eachLine(fd: number, onLine: (line: string) => void, chunk = 1 << 20): void {
  const buf = Buffer.alloc(chunk)
  // A character split between two chunks is decoded whole, with the second.
  const decoder = new StringDecoder("utf8")
  let rest = ""
  for (let pos = 0; ; ) {
    const n = fs.readSync(fd, buf, 0, chunk, pos)
    if (n === 0) break
    pos += n
    const lines = (rest + decoder.write(buf.subarray(0, n))).split("\n")
    rest = lines.pop()!
    for (const line of lines) onLine(line)
  }
  onLine(rest + decoder.end())
}

/** Where problems of the vault's git repository are reported. */
const GIT_FILE = ".git"

/**
 * Calls `onLine` with each line `git <args>` prints in the vault, and throws if git fails.
 * The output goes to a file and is read back a chunk at a time: a buffer would cap how long it can be.
 */
export function gitLines(args: string[], onLine: (line: string) => void): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-git-"))
  const fd = fs.openSync(path.join(tmp, "log"), "w+")
  try {
    const p = spawnSync("git", ["-C", site.vault, "-c", "core.quotepath=off", ...args], { encoding: "utf8", stdio: ["ignore", fd, "pipe"] })
    if (p.status !== 0) throw new Error(p.error?.message || p.stderr.trim().split("\n")[0] || `exit code ${p.status}`)
    eachLine(fd, onLine)
  } finally {
    fs.closeSync(fd)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Created/updated dates from git history, keyed by vault-relative path. A vault
 * outside any repository has none, as expected; a git that fails, or a shallow
 * clone whose history is cut, is reported, since every note would get a wrong date.
 */
function gitDates(report: (level: Problem["level"], file: string, message: string) => void): Map<string, { created: Date; updated: Date }> {
  const dates = new Map<string, { created: Date; updated: Date }>()
  // stderr ignored: outside a repository git would print "fatal: not a git repository".
  const run = (...args: string[]) => execFileSync("git", ["-C", site.vault, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  let top: string
  try {
    top = run("rev-parse", "--show-toplevel")
  } catch {
    // not a git repository: fall back to the filesystem
    return dates
  }
  try {
    if (run("rev-parse", "--is-shallow-repository") === "true") {
      report(
        "warning",
        GIT_FILE,
        "shallow clone: notes older than the clone get its date; fetch the whole history (GIT_DEPTH: 0 on GitLab, fetch-depth: 0 on GitHub)",
      )
    }
    // git names files with "/", on Windows too.
    const prefix = path.relative(top, site.vault).split(path.sep).join("/")
    let ts = 0
    gitLines(["log", "--format=%x00%ct", "--name-only", "--", "*.md"], (line) => {
      if (line.startsWith("\0")) {
        ts = Number(line.slice(1)) * 1000
        return
      }
      if (!line) return
      const rel = prefix ? path.posix.relative(prefix, line) : line
      const d = new Date(ts)
      const cur = dates.get(rel)
      if (!cur) dates.set(rel, { created: d, updated: d })
      else cur.created = d
    })
  } catch (e) {
    dates.clear()
    report("warning", GIT_FILE, `dates come from file times: git failed (${(e as Error).message})`)
  }
  return dates
}

/** A markdown file as last read: its frontmatter (without the password), the password's spec, and its body. */
interface ParsedFile {
  /** Size, times and inode of the file when it was read; another value means it changed. */
  stamp: string
  fm: Record<string, unknown>
  spec?: string
  body: string
  error?: string
}

/** What the vault is asked while one note is indexed in one language, and the answer it gave. */
type Dep = [kind: "note" | "asset" | "drawing" | "private" | "garden" | "password" | "git", args: unknown[], answer: unknown]
/** What indexing one note in one language did to the rest of the index: problems reported, files published. */
type Effect = [kind: "report" | "link" | "citation" | "asset" | "doc", args: unknown[]]

/** One note indexed in one language, with what it depended on, so a later build can take it as it is. */
interface Unit {
  source: SourceNote
  deps: Dep[]
  effects: Effect[]
  /** The note before its links get URLs and a clashing permalink is dropped; each build works on a copy. */
  note: Note
}

/**
 * What one build of the vault index keeps for the next, in `datme dev`: each
 * markdown file as parsed, and each note as indexed in each language with what
 * it asked of the rest of the vault. A note is indexed again when its file
 * changed or when one of those answers did (a link now resolving elsewhere, a
 * picture removed, a commit dating it); a note drawing a drawing or reading a
 * transcript always is. Anything else changing, the config above all, starts
 * over from nothing. Links, backlinks, tags and folders are always worked out
 * again from the notes.
 */
export interface IndexCache {
  /** The config and the files it reads, as of the last build. */
  fingerprint?: string
  files: Map<string, ParsedFile>
  sources: Map<string, SourceNote>
  units: Map<string, Unit>
  /** Counts of the last build: files read, notes indexed again and notes reused. */
  stats: { read: number; built: number; reused: number }
}

export function newIndexCache(): IndexCache {
  return { files: new Map(), sources: new Map(), units: new Map(), stats: { read: 0, built: 0, reused: 0 } }
}

/** Size, times and inode of a file: what changes when it is written, moved over or replaced. */
function stampOf(st: fs.Stats): string {
  return `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.birthtimeMs}:${st.ino}`
}

/** The stamps of a file or of every file under a folder; "" for nothing there. */
function stampsUnder(abs: string): string {
  let st: fs.Stats
  try {
    st = fs.statSync(abs)
  } catch {
    return ""
  }
  if (!st.isDirectory()) return stampOf(st)
  return fs
    .readdirSync(abs)
    .sort()
    .map((name) => `${name}=${stampsUnder(path.join(abs, name))}`)
    .join(";")
}

/**
 * Builds the vault index. With a cache, as `datme dev` keeps between edits, it
 * reads only the files that changed and reuses each note whose file and answers
 * from the rest of the vault are the same; the index is the same as one built afresh.
 */
export function buildVault(version: number, cache: IndexCache = newIndexCache()): Vault {
  const found = { md: [] as string[], files: [] as string[], broken: [] as string[] }
  walk(site.vault, found)

  const problems: Problem[] = []
  const report = (level: Problem["level"], file: string, message: string, place?: Place) => void problems.push({ level, file, message, ...place })
  // What is read once per language, such as a drawing inside another or a transcript, is reported once.
  const reported = new Set<string>()
  const reportOnce: typeof report = (level, file, message) => {
    const id = `${file}\0${message}`
    if (!reported.has(id)) report(level, file, message)
    reported.add(id)
  }
  // A note's file as written, read again only to tell where its problems are.
  const sourceTexts = new Map<string, string>()
  const readSource = (abs: string) => sourceTexts.get(abs) ?? sourceTexts.set(abs, fs.readFileSync(abs, "utf8")).get(abs)!
  // The config's own, such as a theme pack that could not be used.
  for (const w of site.warnings) report("warning", w.file, w.message)
  // A note behind a broken symlink would otherwise vanish from the site unseen.
  for (const rel of found.broken) report("warning", rel, "broken symlink: what it points to is missing, so it is skipped")

  // Every bibliography of the config, merged; a later file wins for a key both define.
  const bib = new Map<string, BibEntry>()
  for (const rel of site.bibliography) {
    try {
      for (const e of parseBibtex(fs.readFileSync(path.join(site.vault, rel), "utf8"))) bib.set(e.key, e)
    } catch {
      report("error", "datme.yaml", `bibliography "${rel}" cannot be read`)
    }
  }

  // The config, and what it is read from, decide everything below: when any of it changed, nothing is reused.
  const fingerprint = JSON.stringify([
    site,
    [...bib],
    CONFIG_FILES.map((f) => stampsUnder(path.join(site.vault, f))),
    stampsUnder(path.join(site.vault, ".datme")),
    site.pack ? stampsUnder(site.pack.dir) : "",
  ])
  if (cache.fingerprint !== fingerprint) Object.assign(cache, newIndexCache(), { fingerprint })
  const stats = { read: 0, built: 0, reused: 0 }
  const files = new Map<string, ParsedFile>()

  const sources = new Map<string, SourceNote>()
  let homeTarget: string | undefined
  for (const rel of found.md) {
    const abs = path.join(site.vault, rel)
    const stamp = stampOf(fs.statSync(abs))
    let parsed = cache.files.get(rel)
    if (parsed?.stamp !== stamp) {
      const { fm, body, error } = parseFrontmatter(fs.readFileSync(abs, "utf8"))
      // The password never stays in the frontmatter, so nothing can render it by accident.
      const spec = fm.password != null && fm.password !== "" ? String(fm.password) : undefined
      delete fm.password
      parsed = { stamp, fm, spec, body, error }
      stats.read++
    }
    files.set(rel, parsed)
    const { fm, spec, body, error } = parsed
    // Without its frontmatter a note cannot say `publish: true`, so it silently disappears.
    if (error) report("warning", rel, `frontmatter is not valid YAML, so it is ignored: ${error}`, yamlErrorPlace(fs.readFileSync(abs, "utf8")))
    if (!isPublished(fm, site.publish, new Date(), site.drafts)) {
      const at = scheduledFor(fm)
      if (at && at > new Date() && isPublished({ ...fm, publish_date: undefined, publishDate: undefined }, site.publish)) {
        report("info", rel, `scheduled: published from ${at.toISOString().slice(0, 10)}`)
      }
      continue
    }
    const { password, variable } = spec ? resolvePassword(spec) : {}
    // A note whose group password is missing would otherwise go out in the clear.
    if (spec && !password) {
      report(
        "error",
        rel,
        `password ${spec} needs the ${variable} environment variable; the note is not published`,
        propertyPlace(fs.readFileSync(abs, "utf8"), ["password"]),
      )
      continue
    }
    const key = rel.replace(MD_EXT, "")
    const isHome = fold(rel) === fold(site.home)
    if (isHome) {
      try {
        homeTarget = path.relative(site.vault, fs.realpathSync(abs)).split(path.sep).join("/").replace(MD_EXT, "")
      } catch {
        // not a symlink
      }
    }
    // The same file read the same way is the same source, so the notes made from it can be reused.
    const before = cache.sources.get(key)
    sources.set(
      key,
      before && before.fm === fm && before.isHome === isHome && before.password === password && before.file === abs
        ? before
        : {
            key,
            file: abs,
            stem: path.posix.basename(key),
            dir: path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel),
            fm,
            raw: body,
            isHome,
            password,
          },
    )
  }
  const home = [...sources.values()].find((s) => s.isHome)
  // A symlinked home note would otherwise be published twice.
  if (home && homeTarget && homeTarget !== home.key) sources.delete(homeTarget)

  const links = linkResolver({ found, sources, home, homeTarget, report, readSource })
  const { resolveNote, resolveAsset, resolveDrawing, privateLink, gardenLink, linkProblem, privateLinks } = links
  const drawDrawing = drawingRenderer(links, report, reportOnce)

  /** A vault file as text, such as the transcript of a video. */
  function readText(rel: string): string | undefined {
    try {
      return fs.readFileSync(path.join(site.vault, rel), "utf8")
    } catch (e) {
      const why = (e as NodeJS.ErrnoException).code ?? (e as Error).message
      reportOnce("warning", rel, `transcript cannot be read (${why}), so its player shows no captions`)
      return undefined
    }
  }

  const missingCitations = new Set<string>()
  function missingCitation(relFile: string, key: string): void {
    if (missingCitations.has(`${relFile}\0${key}`)) return
    missingCitations.add(`${relFile}\0${key}`)
    const places = citationPlaces(readSource(sources.get(relFile.replace(MD_EXT, ""))!.file), key)
    for (const place of orNone(places)) report("error", relFile, `citation @${key} is not in the bibliography`, place)
  }

  const git = gitDates(report)
  const assets = new Set<string>()
  const docRefs = new Set<string>(site.publish === "all" ? found.files.filter((f) => DOC.test(f)) : [])
  const notes = {} as Vault["notes"]
  const byKey = {} as Vault["byKey"]

  // A note indexed in a language asks the rest of the vault through `ask` and changes the index through `did`:
  // both are noted, so the next build can tell whether the answers still hold and replay what it did.
  let rec: { deps: Dep[]; effects: Effect[]; pure: boolean } | undefined
  const effects = {
    report,
    link: linkProblem,
    citation: missingCitation,
    asset: (a: string) => void assets.add(a),
    doc: (d: string) => void docRefs.add(d),
  } satisfies Record<Effect[0], (...args: never[]) => void>
  const datesOf = (file: string) => {
    const d = git.get(file)
    return d && `${d.created.getTime()}:${d.updated.getTime()}`
  }
  const answers: Record<Dep[0], (...args: never[]) => unknown> = {
    note: (target: string, fromDir: string) => resolveNote(target, fromDir)?.key,
    asset: resolveAsset,
    drawing: resolveDrawing,
    private: privateLink,
    garden: (name: string, target: string, lang: Lang) => JSON.stringify(gardenLink(name, target, lang)),
    password: (spec: string) => JSON.stringify(resolvePassword(spec)),
    git: datesOf,
  }
  function ask<T>(kind: Dep[0], args: unknown[], answer: T, noted: unknown = answer): T {
    rec?.deps.push([kind, args, noted])
    return answer
  }
  function did<K extends Effect[0]>(kind: K, ...args: Parameters<(typeof effects)[K]>): void {
    rec?.effects.push([kind, args])
    ;(effects[kind] as (...a: unknown[]) => void)(...args)
  }
  /** What a note gets of the vault while it is indexed: every answer noted, and drawings and transcripts never reused. */
  const unitNote = (target: string, fromDir: string) => {
    const hit = resolveNote(target, fromDir)
    return ask("note", [target, fromDir], hit, hit?.key)
  }
  const unitAsset = (target: string, fromDir: string) => ask("asset", [target, fromDir], resolveAsset(target, fromDir))
  const unitDrawing = (target: string, fromDir: string) => ask("drawing", [target, fromDir], resolveDrawing(target, fromDir))
  const unitPassword = (spec: string) => {
    const r = resolvePassword(spec)
    return ask("password", [spec], r, JSON.stringify(r))
  }
  const impure =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (rec) rec.pure = false
      return fn(...args)
    }
  const unitDraw = impure(drawDrawing)
  const unitReadText = impure(readText)
  /** A note as the next build gets it: the parts a build changes afterwards are its own. */
  const copyNote = (n: Note): Note => ({
    ...n,
    lockedParts: n.lockedParts.map((p) => ({ ...p })),
    translation: n.translation && { ...n.translation },
  })
  const units = new Map<string, Unit>()

  for (const lang of site.langs) {
    notes[lang] = []
    byKey[lang] = new Map()
    for (const s of sources.values()) {
      const id = `${lang}\0${s.key}`
      const unit = cache.units.get(id)
      if (unit && unit.source === s && unit.deps.every(([kind, args, answer]) => (answers[kind] as (...a: unknown[]) => unknown)(...args) === answer)) {
        for (const [kind, args] of unit.effects) (effects[kind] as (...a: unknown[]) => void)(...args)
        // Whether a scheduled note is still a draft depends on the day, not on the vault.
        const note = { ...copyNote(unit.note), draft: site.drafts && isDraft(s.fm) }
        units.set(id, unit)
        stats.reused++
        notes[lang].push(note)
        byKey[lang].set(s.key, note)
        continue
      }
      rec = { deps: [], effects: [], pure: true }
      const titleField = s.fm.title
      const titleMap = titleField && typeof titleField === "object" ? (titleField as Record<string, string>) : undefined
      const langTitle = titleMap?.[lang]
      // A title such as 2024 reads as a number in YAML.
      const title = langTitle ?? (typeof titleField === "string" || typeof titleField === "number" ? String(titleField) : s.stem)
      const slugBase = s.isHome ? "index" : sluggify(path.posix.join(s.dir, langTitle ?? s.stem))
      // `permalink` (one value, or one per language) replaces the path-based URL; the old one redirects.
      const permalinkField = s.fm.permalink
      const permalink =
        typeof permalinkField === "string"
          ? permalinkField
          : permalinkField && typeof permalinkField === "object"
            ? (permalinkField as Record<string, string>)[lang]
            : undefined
      const customSlug = !s.isHome && permalink ? sluggify(String(permalink).replace(/^\/+|\/+$/g, "")) : ""
      const slug = langPrefix(lang) + (customSlug || slugBase)
      // An empty tag, such as "" or a bare "#", would link to the list of tags.
      const tags = [...new Set(toArray(s.fm.tags ?? s.fm.tag).map((x) => slugTag(x.replace(/^#/, ""))))].filter(Boolean)
      const relFile = s.key + ".md"
      const stat = fs.statSync(s.file)
      const dates = ask("git", [relFile], git.get(relFile), datesOf(relFile))
      const created = toDate(s.fm.created ?? s.fm.date) ?? dates?.created ?? stat.birthtime
      const updated = toDate(s.fm.updated ?? s.fm.modified ?? s.fm.lastmod) ?? dates?.updated ?? stat.mtime

      const fmPlace = (keys: string[]) => propertyPlace(readSource(s.file), keys)
      // A picture or sound property: a URL, or a file of the vault that is then published.
      const fileProp = (field: string, v: unknown = s.fm[field], keys = [field]): { href: string; file?: string } | undefined => {
        if (typeof v !== "string" || !v) return undefined
        const b = v.replace(/^!?\[\[|\]\]$/g, "").replace(/\|.*$/, "")
        if (/^https?:\/\//.test(b)) return { href: b }
        const asset = unitAsset(b, s.dir)
        if (asset) {
          did("asset", asset)
          return { href: assetUrl(asset), file: asset }
        }
        if (lang === site.defaultLang) did("report", "error", relFile, `${field} "${b}" is not in the vault`, fmPlace(keys))
        return undefined
      }
      // A protected note's pictures and sound are part of what its password guards, so they are not published.
      const banner = s.password ? undefined : fileProp("banner")?.href
      const cover = s.password ? undefined : (fileProp("cover")?.href ?? fileProp("avatar")?.href)
      const audio = s.password ? undefined : fileProp("audio")
      // So is a certificate: a file of the vault named by a protected note stays out of the site.
      const certificate = s.password ? undefined : fileProp("certificate")
      const layoutField = typeof s.fm.layout === "string" ? s.fm.layout.trim().toLowerCase() : undefined
      const layout = LAYOUTS.find((l) => l === layoutField)
      // `layout: none` keeps the usual page, and `datme check` from suggesting a layout.
      if (layoutField && layoutField !== "none" && !layout && lang === site.defaultLang) {
        did("report", "warning", relFile, `layout "${s.fm.layout}" is not one of ${LAYOUTS.join(", ")}, so the note is laid out as usual`, fmPlace(["layout"]))
      }
      // A dialogue's `speakers` map names to pictures, published like a cover; a protected dialogue keeps them.
      const speakers =
        layout === "dialogue" && !s.password && s.fm.speakers && typeof s.fm.speakers === "object" && !Array.isArray(s.fm.speakers)
          ? Object.fromEntries(
              Object.entries(s.fm.speakers as Record<string, unknown>).flatMap(([name, v]) => {
                const src = fileProp(`speakers.${name}`, v, ["speakers", name])?.href
                return src ? [[name, src]] : []
              }),
            )
          : undefined
      // A letter signed with a picture publishes it like a cover; a protected letter keeps it. A signature in words stays a property.
      const sig = typeof s.fm.signature === "string" ? s.fm.signature.trim() : ""
      const signature =
        layout === "letter" && !s.password && (/^!?\[\[/.test(sig) || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(sig))
          ? fileProp("signature", sig)?.href
          : undefined
      const { value: style, invalid: badStyle } = pickOption(s.fm.style, site.styles)
      if (badStyle && lang === site.defaultLang) {
        did("report", "warning", relFile, `style "${badStyle}" is not one of ${site.styles.join(", ")}, so the note keeps its usual style`, fmPlace(["style"]))
      }
      const { value: chrome, invalid: badChrome } = pickOption(s.fm.chrome, CHROMES)
      if (badChrome && lang === site.defaultLang) {
        did("report", "warning", relFile, `chrome "${badChrome}" is not one of ${CHROMES.join(", ")}, so the note keeps its usual frame`, fmPlace(["chrome"]))
      }
      const pos = (v: unknown) => (v != null && v !== "" ? `${Number(v) * 100}%` : "50%")

      // An untranslated note shows its fallback language's blocks, not only its shared text.
      const sourceLang = sourceLangOf(s.fm)
      const texts = textLanguages(s.raw)
      // A note without language blocks is all source-language text.
      const contentLang = s.raw.includes("<!--lang:") ? contentLanguage(s.raw, lang, fallbackOf(s.fm, sourceLang), texts) : sourceLang
      // Locked parts leave the note first, so nothing below can read them.
      const { md: filtered, parts } = splitLocked(filterLanguage(s.raw, contentLang))
      const deck = isDeck(tags, filtered, site.conventions.flashcardTags)
      const board = isKanban(s.fm)
      const slides = isSlides(s.fm)
      let body = deck ? flashcards(filtered, t(lang).showAnswer) : board ? kanban(filtered, t(lang).kanbanBoard) : filtered
      // A poem keeps the indentation of its lines; a comparison reads pros and cons from + and - items.
      if (layout === "poem") body = keepIndent(body)
      if (layout === "compare") body = markProsCons(body)
      if (body.includes("@")) {
        const cited = cite(body, bib, t(lang).references)
        body = cited.md
        for (const key of cited.missing) did("citation", relFile, key)
      }
      // How every piece of the note's markdown is made ready: its text, its locked parts, a poem's translation.
      const prepare = {
        lang,
        dir: s.dir,
        resolveNote: unitNote,
        resolveAsset: unitAsset,
        drawDrawing: unitDraw,
        drawingPage: unitDrawing,
        readText: unitReadText,
        privateLink: (target: string, fromDir: string, alias: string | undefined) =>
          ask("private", [target, fromDir, alias, lang], privateLink(target, fromDir, alias, lang)),
        gardenLink: (name: string, target: string) => {
          const found = gardenLink(name, target, lang)
          return ask("garden", [name, target, lang], found, JSON.stringify(found))
        },
      }
      const pre = preprocess(body, { ...prepare, slides })
      // A protected note's files travel inside its ciphertext, and the canvases and bases it links stay unpublished.
      if (!s.password) {
        for (const a of pre.assets) did("asset", a)
        for (const d of pre.docs) did("doc", d)
      }
      // A locked part's links stay out of backlinks and the graph, and its files out of the site.
      const lockedParts = parts.map((part) => {
        const { password, variable } = unitPassword(part.password)
        if (!password) {
          if (lang === site.defaultLang) {
            did("report", "error", relFile, `locked part ${part.password} needs the ${variable} environment variable; it is left out`)
          }
          return { md: "" }
        }
        const p = preprocess(part.md, prepare)
        for (const problem of p.problems) did("link", relFile, problem)
        return { password, md: p.md }
      })
      const directives = slides
        ? slideDirectives(s.fm, (target) => {
            const asset = unitAsset(target, s.dir)
            if (asset) did("asset", asset)
            return asset && assetUrl(asset)
          })
        : undefined
      for (const p of pre.problems) did("link", relFile, p)
      // A poem beside its translation: the blocks of its `bilingual` language (the original's, on that language's
      // own page), made ready like the note's text. A protected poem keeps them.
      const asked = layout === "poem" && typeof s.fm.bilingual === "string" ? s.fm.bilingual.trim() : ""
      // The original is the language the note says it is in, served on this site or not.
      const original = typeof s.fm.lang === "string" ? s.fm.lang : sourceLang
      const pairLang = asked && (asked !== contentLang ? asked : original !== contentLang ? original : "")
      if (asked && !texts.includes(asked) && lang === site.defaultLang) {
        did("report", "warning", relFile, `bilingual "${asked}" has no <!--lang:${asked}--> block holding text, so the poem is shown alone`)
      }
      let translation: Note["translation"]
      if (pairLang && texts.includes(pairLang) && !s.password) {
        const other = preprocess(keepIndent(splitLocked(filterLanguage(s.raw, pairLang)).md), prepare)
        for (const a of other.assets) did("asset", a)
        // A locked part of the translation stays out, as it does of the note.
        translation = { lang: pairLang, md: other.md.replace(/<div class="locked-part" data-lock="\d+"><\/div>/g, "") }
      }

      const { typePrefix, blogTags, mapTags } = site.conventions
      const types = tags.filter((x) => x.startsWith(typePrefix)).map((x) => x.slice(typePrefix.length))
      const cw = s.fm.cw ?? s.fm.contentWarning
      const warning = typeof cw === "string" && cw.trim() ? cw.trim() : undefined
      const note: Note = {
        key: s.key,
        lang,
        slug,
        url: slugToUrl(slug),
        formerUrl: customSlug ? slugToUrl(langPrefix(lang) + slugBase) : undefined,
        title,
        aliases: toArray(s.fm.aliases ?? s.fm.alias),
        tags,
        created,
        updated,
        banner,
        bannerPos: `${pos(s.fm.banner_x)} ${pos(s.fm.banner_y)}`,
        cover: cover ?? banner,
        audio,
        certificate,
        layout,
        speakers,
        signature,
        translation,
        style,
        chrome,
        // A board or a deck needs the width of the page.
        cssclasses: [...toArray(s.fm.cssclasses ?? s.fm.cssclass), ...(board ? ["kanban-board"] : []), ...(slides ? ["slide-deck"] : [])],
        // The warning stands in for the description: every excerpt starts from it.
        description: warning ?? (typeof s.fm.description === "string" ? s.fm.description : undefined),
        warning,
        // A `stage` property naming a configured stage wins over the top-level folder.
        stage: typeof s.fm.stage === "string" && site.stages[s.fm.stage] ? s.fm.stage : site.stages[s.dir.split("/")[0]] ? s.dir.split("/")[0] : undefined,
        types,
        isBlog: tags.some((x) => blogTags.includes(x)),
        isMoc: tags.some((x) => mapTags.includes(x)),
        sourceLang,
        translated: lang === sourceLang || texts.includes(lang),
        contentLang,
        // A poem keeps its line breaks unless it says otherwise.
        hardBreaks:
          typeof s.fm.lineBreaks === "boolean"
            ? s.fm.lineBreaks
            : layout === "poem" ||
              site.lineBreaks.all ||
              types.some((ty) => site.lineBreaks.types.includes(ty)) ||
              site.lineBreaks.folders.some((f) => s.dir === f || s.dir.startsWith(f + "/")),
        isHome: s.isHome,
        unlisted: flag(s.fm.unlisted) === true,
        draft: site.drafts && isDraft(s.fm),
        protected: s.password != null,
        dir: s.dir,
        md: pre.md,
        links: pre.links,
        assets: [...new Set(pre.assets)],
        deck,
        lockedParts,
        slides: directives,
        source: s,
      }
      if (rec.pure) units.set(id, { source: s, deps: rec.deps, effects: rec.effects, note: copyNote(note) })
      rec = undefined
      stats.built++
      notes[lang].push(note)
      byKey[lang].set(s.key, note)
    }
  }
  Object.assign(cache, { files, sources, units, stats })

  // Links are resolved to keys during preprocessing; URLs need the slugs computed above.
  function noteUrl(key: string, lang: Lang): string {
    return byKey[lang]?.get(key)?.url ?? "#"
  }
  const docs = buildDocs(docRefs, { links, drawDrawing, readText, assets, report })

  // A permalink that collides with another note's URL is ignored, so no page is lost.
  for (const lang of site.langs) {
    const taken = new Map<string, Note>()
    for (const n of notes[lang]) if (!n.formerUrl) taken.set(n.url, n)
    for (const n of notes[lang]) {
      if (!n.formerUrl) continue
      const other = taken.get(n.url)
      if (other) {
        console.warn(`[datme] permalink of ${n.key} clashes with ${other.key}; keeping ${n.formerUrl}`)
        n.url = n.formerUrl
        // formerUrl already carries the language prefix.
        n.slug = urlToSlug(n.formerUrl)
        n.formerUrl = undefined
      } else taken.set(n.url, n)
    }
  }

  const fillUrls = (md: string, lang: Lang) => md.replace(/\u0001URL:([^\u0001]+)\u0001/g, (_, k) => noteUrl(k, lang))
  for (const lang of site.langs) {
    for (const n of notes[lang]) {
      n.md = fillUrls(n.md, lang)
      for (const part of n.lockedParts) part.md = fillUrls(part.md, lang)
      if (n.translation) n.translation.md = fillUrls(n.translation.md, lang)
    }
    for (const d of docs.values()) {
      for (const id of Object.keys(d.texts[lang] ?? {})) d.texts[lang][id] = fillUrls(d.texts[lang][id], lang)
    }
  }

  // Two notes with the same URL: one page silently replaces the other.
  for (const lang of site.langs) {
    const byUrl = new Map<string, Note>()
    for (const n of notes[lang]) {
      const other = byUrl.get(n.url.toLowerCase())
      if (other) report("error", n.key + ".md", `has the same URL ${n.url} as ${other.key}.md, so only one of them is published`)
      else byUrl.set(n.url.toLowerCase(), n)
    }
  }

  const { backlinks, tags, trees, folders } = deriveIndexes(notes)

  if (sources.size === 0) {
    console.warn(
      site.publish === "explicit"
        ? `[datme] no note in ${site.vault} has \`publish: true\`; add it to the notes to share, or set \`publish: all\` in datme.yaml`
        : `[datme] no publishable note found in ${site.vault}`,
    )
  }

  // Marp themes are CSS files anywhere in the vault, read only when a deck may use one.
  const slideThemes = Object.values(notes).some((ns) => ns.some((n) => n.slides))
    ? found.files
        .filter((f) => /\.css$/i.test(f))
        .flatMap((f) => {
          const css = fs.readFileSync(path.join(site.vault, f), "utf8")
          return isTheme(css) ? [css] : []
        })
    : []

  return {
    version,
    problems,
    docs,
    home,
    sources,
    notes,
    byKey,
    backlinks,
    tags,
    trees,
    folders,
    assets,
    slideThemes,
    privateLinks,
    resolveNote,
    resolveAsset,
    privateLink,
  }
}

let cached: Vault | undefined
/** Kept between builds by `datme dev`, which indexes the vault again after each edit; a build indexes it once. */
const indexCache = process.env.DATME_DEV ? newIndexCache() : undefined

/**
 * Where a build keeps its vault index for every copy of this module in the process:
 * `datme build` checks the vault with the CLI's copy, then Astro renders the pages with
 * the copy it bundles, and both would otherwise index the whole vault.
 */
const SHARED = Symbol.for("datme.vault")

/** The vault index, rebuilt in dev whenever the watcher bumps the version. */
export function getVault(): Vault {
  const version = (globalThis as { __vaultVersion?: number }).__vaultVersion ?? 0
  if (!cached || cached.version !== version) cached = indexCache ? buildVault(version, indexCache) : sharedVault(version)
  return cached
}

/** The index another copy of this module built, when it was built for the same version with the same config. */
function sharedVault(version: number): Vault {
  const g = globalThis as { [SHARED]?: { key: string; vault: Vault } }
  const key = JSON.stringify([version, site])
  if (g[SHARED]?.key !== key) g[SHARED] = { key, vault: buildVault(version) }
  return g[SHARED].vault
}

/**
 * Values built from the vault, kept for its current version only: when `datme dev`
 * rebuilds the vault after an edit, the values of the old one are dropped, not piled up.
 */
export function vaultMemo<V>(): { get(key: string, make: () => V): V; readonly size: number } {
  const values = new Map<string, V>()
  let version: number | undefined
  return {
    get(key, make) {
      const now = getVault().version
      if (now !== version) {
        values.clear()
        version = now
      }
      if (!values.has(key)) values.set(key, make())
      return values.get(key)!
    },
    get size() {
      return values.size
    },
  }
}

export function listed(lang: Lang): Note[] {
  return getVault().notes[lang].filter((n) => !n.unlisted)
}

export function byRecent(list: Note[], field: "created" | "updated" = "updated"): Note[] {
  return [...list].sort((a, b) => (b[field]?.getTime() ?? 0) - (a[field]?.getTime() ?? 0))
}
