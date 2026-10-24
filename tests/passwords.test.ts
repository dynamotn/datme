import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { inGit, MIN_PASSWORD_LENGTH, passwordProblems, weakness } from "../src/lib/passwords"

const note = (rel: string, fm: Record<string, unknown>, body = "") => ({ rel, fm, body })

describe("password strength", () => {
  test("a long passphrase holds up", () => {
    expect(weakness("plum moth ladder quietly")).toBeUndefined()
    expect(weakness("x".repeat(MIN_PASSWORD_LENGTH))).toBeUndefined()
  })

  test("a short password is weak", () => {
    expect(weakness("tulip-42")).toBe(`is shorter than ${MIN_PASSWORD_LENGTH} characters`)
    // Characters, not UTF-16 units, are counted.
    expect(weakness("🌱".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(`is shorter than ${MIN_PASSWORD_LENGTH} characters`)
  })

  test("a common password is weak whatever its case, spacing or trailing digits", () => {
    for (const pw of ["garden", "Password", "password123456", "correct horse battery staple", "P@ssw0rd!", "Open Sesame"]) {
      expect(weakness(pw)).toBe("is among the passwords tried first")
    }
  })

  test("only digits is weak, however long", () => {
    expect(weakness("1234 5678 9012 3456")).toBe("is only digits")
  })
})

describe("password warnings", () => {
  const env = { DATME_LOCK_FRIENDS: "garden", DATME_LOCK_FAMILY: "plum moth ladder quietly" }

  test("a weak password, written out or in a group's variable, is a warning naming the note but never the password", () => {
    const problems = passwordProblems(
      [
        note("Diary.md", { password: "garden" }),
        note("Trip.md", {}, "Public.\n<!--lock:@friends-->\nhidden\n<!--lock:*-->\n<!--lock:kiwi9-->\nmore\n<!--lock:*-->"),
        note("Numbers.md", { password: 1234 }),
      ],
      env,
      false,
    )
    expect(problems).toEqual([
      {
        level: "warning",
        file: "Diary.md",
        message:
          "password is among the passwords tried first: a published page can be tried offline without limit, so a long passphrase of several words holds better",
      },
      {
        level: "warning",
        file: "Trip.md",
        message:
          "locked part 1 @friends (DATME_LOCK_FRIENDS) is among the passwords tried first: a published page can be tried offline without limit, so a long passphrase of several words holds better",
      },
      {
        level: "warning",
        file: "Trip.md",
        message: `locked part 2 is shorter than ${MIN_PASSWORD_LENGTH} characters: a published page can be tried offline without limit, so a long passphrase of several words holds better`,
      },
      {
        level: "warning",
        file: "Numbers.md",
        message: "password is only digits: a published page can be tried offline without limit, so a long passphrase of several words holds better",
      },
    ])
    const text = JSON.stringify(problems)
    expect(text).not.toContain('"garden')
    expect(text).not.toContain("kiwi9")
    expect(text).not.toContain("1234")
  })

  test("strong passwords, unset groups and notes without a password say nothing", () => {
    const problems = passwordProblems(
      [
        note("Strong.md", { password: "plum moth ladder quietly" }),
        note("Family.md", { password: "@family" }),
        note("Nobody.md", { password: "@nobody" }),
        note("Open.md", { password: "" }),
        note("Plain.md", {}, "Nothing locked."),
      ],
      env,
      true,
    )
    // Only the password written out in a vault kept in git.
    expect(problems.map((p) => p.file)).toEqual(["Strong.md"])
  })

  test("in a git repository, passwords written in a note are a warning that suggests a group", () => {
    const sources = [
      note("Diary.md", { password: "plum moth ladder quietly" }),
      note("Trip.md", { password: "@family" }, "<!--lock:river otter lantern blue-->\na\n<!--lock:*-->\n<!--lock:copper kettle meadow-->\nb\n<!--lock:*-->"),
      note("Club.md", { password: "@family" }),
    ]
    expect(passwordProblems(sources, env, true)).toEqual([
      {
        level: "warning",
        file: "Diary.md",
        message:
          'a password is written in the note, so the vault\'s git history keeps it in plain text; a group (password: "@friends", <!--lock:@friends-->) reads it from a DATME_LOCK_… environment variable instead',
      },
      {
        level: "warning",
        file: "Trip.md",
        message:
          '2 passwords are written in the note, so the vault\'s git history keeps them in plain text; a group (password: "@friends", <!--lock:@friends-->) reads it from a DATME_LOCK_… environment variable instead',
      },
    ])
    // Outside git, the same passwords are only checked for strength.
    expect(passwordProblems(sources, env, false)).toEqual([])
  })

  test("a directory is in git when git says so", () => {
    expect(inGit(import.meta.dir)).toBe(true)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "datme-nogit-"))
    try {
      expect(inGit(outside)).toBe(false)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})
