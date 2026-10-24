/**
 * Warnings about the passwords of protected notes and locked parts, for
 * `datme check`. A static page can be tried offline without limit, so a short
 * or common password falls in seconds whatever the PBKDF2 rounds; and one
 * written in a note sits in plain text in the vault, and in its git history.
 * A warning names the note and the part, never the password.
 */
import { execFileSync } from "node:child_process"
import { resolvePassword, splitLocked } from "./locked"
import type { Problem } from "./vault"

/** The fewest characters a password should have. */
export const MIN_PASSWORD_LENGTH = 12

/**
 * Passwords an attacker tries first, lowercased and without spaces or
 * punctuation; a password is matched with its trailing digits left off too.
 */
const COMMON = new Set([
  "password",
  "passw0rd",
  "pssw0rd",
  "qwerty",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1qaz2wsx",
  "1qaz2wsx3edc",
  "qazwsx",
  "abc",
  "abcdef",
  "abcdefgh",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "administrator",
  "root",
  "login",
  "changeme",
  "default",
  "secret",
  "mysecret",
  "topsecret",
  "supersecret",
  "private",
  "opensesame",
  "trustno1",
  "monkey",
  "dragon",
  "master",
  "shadow",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman",
  "starwars",
  "whatever",
  "freedom",
  "hello",
  "helloworld",
  "test",
  "guest",
  "garden",
  "digitalgarden",
  "notes",
  "obsidian",
  "datme",
  "correcthorsebatterystaple",
])

/** Why a password is easy to guess, as the end of a sentence; undefined when it holds up. */
export function weakness(password: string): string | undefined {
  const plain = password.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
  if (/^\d+$/.test(plain)) return "is only digits"
  if (COMMON.has(plain) || COMMON.has(plain.replace(/\d+$/, ""))) return "is among the passwords tried first"
  if ([...password].length < MIN_PASSWORD_LENGTH) return `is shorter than ${MIN_PASSWORD_LENGTH} characters`
  return undefined
}

/** Whether a directory is inside a git work tree. */
export function inGit(dir: string): boolean {
  try {
    // stderr ignored: outside a repository git prints "fatal: not a git repository".
    execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { stdio: ["ignore", "pipe", "ignore"] })
    return true
  } catch {
    return false
  }
}

/**
 * Warnings for the passwords of published notes, as written: each that is easy
 * to guess (a group's when its variable is set), and, in a vault kept in git,
 * each note that writes a password out instead of naming a group.
 */
export function passwordProblems(sources: { rel: string; fm: Record<string, unknown>; body: string }[], env: NodeJS.ProcessEnv, git: boolean): Problem[] {
  const problems: Problem[] = []
  for (const s of sources) {
    const specs = [
      ...(s.fm.password != null && s.fm.password !== "" ? [{ what: "password", spec: String(s.fm.password) }] : []),
      ...splitLocked(s.body).parts.map((p, i) => ({ what: `locked part ${i + 1}`, spec: p.password })),
    ]
    let written = 0
    for (const { what, spec } of specs) {
      const { password, variable } = resolvePassword(spec, env)
      if (!variable) written++
      const weak = password && weakness(password)
      if (!weak) continue
      problems.push({
        level: "warning",
        file: s.rel,
        message: `${what}${variable ? ` ${spec} (${variable})` : ""} ${weak}: a published page can be tried offline without limit, so a long passphrase of several words holds better`,
      })
    }
    if (written && git) {
      problems.push({
        level: "warning",
        file: s.rel,
        message: `${written === 1 ? "a password is" : `${written} passwords are`} written in the note, so the vault's git history keeps ${written === 1 ? "it" : "them"} in plain text; a group (password: "@friends", <!--lock:@friends-->) reads it from a DATME_LOCK_… environment variable instead`,
      })
    }
  }
  return problems
}
