import { afterEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cli, notesForTag, releaseNotes } from "../tools/release-notes"

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something to come.

## [3.2.0] - 2026-10-23

### Added

- A \`terminal\` style.

### Fixed

- A fix.

## [3.0.0-rc.1] - 2026-10-17

### Changed

- A candidate.

## [2.0.0] - 2026-10-01

## [1.0.0] - 2026-09-01

- The first one.
`

describe("releaseNotes", () => {
  test("is the section of the version, without its heading or the next one", () => {
    expect(releaseNotes(CHANGELOG, "3.2.0")).toBe("### Added\n\n- A `terminal` style.\n\n### Fixed\n\n- A fix.")
  })

  test("finds pre-releases and the last section of the file", () => {
    expect(releaseNotes(CHANGELOG, "3.0.0-rc.1")).toBe("### Changed\n\n- A candidate.")
    expect(releaseNotes(CHANGELOG, "1.0.0")).toBe("- The first one.")
  })

  test("fails for a version without a section, or with an empty one", () => {
    expect(() => releaseNotes(CHANGELOG, "9.9.9")).toThrow("no section for 9.9.9")
    expect(() => releaseNotes(CHANGELOG, "2.0.0")).toThrow("section of 2.0.0 in CHANGELOG.md is empty")
  })

  test("does not take a version for the start of a longer one", () => {
    expect(() => releaseNotes(CHANGELOG, "3.0.0")).toThrow("no section for 3.0.0")
  })

  test("reads datme's own changelog for its current version", () => {
    const root = path.resolve(import.meta.dir, "..")
    const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    expect(releaseNotes(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version)).toStartWith("### ")
  })
})

test("notesForTag drops the v of the tag and links the package on npm", () => {
  expect(notesForTag(CHANGELOG, "v3.0.0-rc.1")).toBe(
    "### Changed\n\n- A candidate.\n\n---\n\nnpm: https://www.npmjs.com/package/@dynamotn/datme/v/3.0.0-rc.1\n",
  )
})

describe("cli", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })
  const root = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-notes-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), CHANGELOG)
    return dir
  }

  test("prints the notes of the tag and succeeds", () => {
    const out = spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      expect(cli(["v3.2.0"], root())).toBe(0)
      expect(out).toHaveBeenCalledWith(notesForTag(CHANGELOG, "v3.2.0"))
    } finally {
      out.mockRestore()
    }
  })

  test("fails with a message when the tag is missing or has no notes", () => {
    const err = spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(cli([], root())).toBe(1)
      expect(err).toHaveBeenLastCalledWith("usage: bun tools/release-notes.ts <tag>")
      expect(cli(["v2.0.0"], root())).toBe(1)
      expect(err).toHaveBeenLastCalledWith("the section of 2.0.0 in CHANGELOG.md is empty")
    } finally {
      err.mockRestore()
    }
  })

  test("reads the repository's changelog by default", () => {
    const out = spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      expect(cli(["v3.2.0"])).toBe(0)
    } finally {
      out.mockRestore()
    }
  })
})
