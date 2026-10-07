/**
 * Locked parts of a note, written like language blocks:
 *
 *     <!--lock:password-->
 *     only for those who know the password
 *     <!--lock:*-->
 *
 * A part is taken out of the note before anything else reads it, so its text
 * never reaches search, excerpts, feeds, the graph or the markdown copies; the
 * page gets it encrypted with its password, to be unlocked in the browser.
 */

export interface LockedPart {
  password: string
  /** The part's markdown, as written. */
  md: string
}

const MARK = /^\s*<!--lock:(.*)-->\s*$/

/** The HTML that stands in for locked part `i` until it is encrypted into the page. */
export const lockedPlaceholder = (i: number) => `<div class="locked-part" data-lock="${i}"></div>`

/**
 * Split the locked parts out of a note. An unclosed part runs to the end of
 * the note; markers inside code fences are left alone, like language markers.
 */
export function splitLocked(src: string): { md: string; parts: LockedPart[] } {
  const out: string[] = []
  const parts: LockedPart[] = []
  let inFence = false
  let part: LockedPart | undefined
  for (const line of src.split("\n")) {
    const m = inFence ? null : line.match(MARK)
    if (m) {
      if (part) parts.push(part)
      part = undefined
      const password = m[1].trim()
      if (password && password !== "*") {
        part = { password, md: "" }
        // Blank lines keep the placeholder a block of its own.
        out.push("", lockedPlaceholder(parts.length), "")
      }
      continue
    }
    if (line.includes("```")) inFence = !inFence
    if (part) part.md += (part.md ? "\n" : "") + line
    else out.push(line)
  }
  if (part) parts.push(part)
  return { md: out.join("\n"), parts }
}

/** The environment variable holding the password of a group: `@close-friends` → DATME_LOCK_CLOSE_FRIENDS. */
export const groupVariable = (group: string) => `DATME_LOCK_${group.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`

/**
 * The password a note or part names: written out, or `@group` for one kept in
 * the environment (a CI secret), so it never sits in the vault. A group whose
 * variable is unset or empty gives no password, and its content is left out.
 */
export function resolvePassword(spec: string, env: NodeJS.ProcessEnv = process.env): { password?: string; variable?: string } {
  const group = spec.match(/^@([\w-]+)$/)?.[1]
  if (!group) return { password: spec }
  const variable = groupVariable(group)
  return { password: env[variable] || undefined, variable }
}

/** A note with its locked parts left out entirely, for copies that cannot be locked. */
export function withoutLocked(src: string): string {
  return splitLocked(src).md.replace(/<div class="locked-part" data-lock="\d+"><\/div>/g, "")
}
