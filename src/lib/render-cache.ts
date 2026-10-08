import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { site } from "../site.config"

/**
 * A disk cache for the slow parts of a build: rendered notes and social cards.
 * The CLI enables it with DATME_CACHE for `build` and `preview`, and prunes
 * the entries a build did not touch, so the cache stays the size of one build.
 * Nothing derived from a protected note is ever written here.
 */
const dir = process.env.DATME_CACHE || undefined

const salts = new Map<string, string>()
/**
 * Anything that changes the output: datme's version, the config, and the code
 * of the module producing the value (`import.meta.url` of the caller), which
 * after bundling changes whenever datme's code does.
 */
function saltOf(source: string): string {
  let salt = salts.get(source)
  if (!salt) {
    const h = crypto.createHash("sha256")
    h.update(process.env.DATME_VERSION ?? "")
    h.update(JSON.stringify(site))
    try {
      h.update(fs.readFileSync(fileURLToPath(source)))
    } catch {
      // not a file: the version and the config still key the cache
    }
    salt = h.digest("hex")
    salts.set(source, salt)
  }
  return salt
}

function fileOf(kind: string, source: string, parts: string[]): string {
  const key = crypto.createHash("sha256").update(saltOf(source)).update(JSON.stringify(parts)).digest("hex")
  return path.join(dir!, kind, key.slice(0, 2), key.slice(2))
}

/** A cached value, marked as used by this build; undefined on a miss or when caching is off. */
export function readCache(kind: string, source: string, parts: string[]): Buffer | undefined {
  if (!dir) return undefined
  const file = fileOf(kind, source, parts)
  try {
    const data = fs.readFileSync(file)
    const now = new Date()
    fs.utimesSync(file, now, now)
    return data
  } catch {
    return undefined
  }
}

export function writeCache(kind: string, source: string, parts: string[], data: string | Uint8Array): void {
  if (!dir) return
  const file = fileOf(kind, source, parts)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Written aside then renamed, so a build killed midway never leaves half a file.
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, file)
  } catch {
    // a read-only or full disk only makes the next build slower
  }
}

/** How many notes a build reused from the cache and rendered, for `datme build --verbose`. */
export interface CacheStats {
  /** Reused, with nothing outside the note in their key. */
  reused: number
  /** Reused, keyed by the notes they embed and the pages their queries read too. */
  reusedWithDeps: number
  rendered: number
  /** Rendered because they are never cached: protected, or reading the time or files. */
  uncached: number
}

/** The counts of this process; shared through globalThis, since Astro loads its own copy of this module. */
export function cacheStats(): CacheStats {
  const g = globalThis as { __datmeCacheStats?: CacheStats }
  return (g.__datmeCacheStats ??= { reused: 0, reusedWithDeps: 0, rendered: 0, uncached: 0 })
}

/** One line such as "Notes: 40 reused (12 with embeds or queries), 3 rendered, 1 never cached". */
export function formatCacheStats(s: CacheStats): string {
  const reused = s.reused + s.reusedWithDeps
  const total = reused + s.rendered + s.uncached
  const rate = total ? Math.round((reused / total) * 100) : 0
  return `Notes: ${reused} reused (${s.reusedWithDeps} with embeds or queries), ${s.rendered} rendered, ${s.uncached} never cached; ${rate}% from the cache`
}
