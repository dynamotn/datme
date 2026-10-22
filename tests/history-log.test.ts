import { describe, expect, test } from "bun:test"
import { parseBlobs, parseFileLog } from "../src/lib/history"

const Z = "0".repeat(40)
const sha = (c: string) => c.repeat(40)
/** One commit of `git log --format=%x01%H %ct --raw --no-abbrev -z`, newest commits first. */
const commit = (time: number, ...entries: string[][]) => `\x01${sha("f")} ${time}\0\n` + entries.map((e) => e.join("\0") + "\0").join("")
const entry = (status: string, blob: string, ...paths: string[]) => [`:100644 100644 ${Z} ${blob} ${status}`, ...paths]

describe("reading the vault's git log in one pass", () => {
  test("each file's commits, newest first, following renames as --follow does", () => {
    const log = [
      commit(40, entry("M", sha("4"), "notes/B.md"), entry("M", sha("5"), "Other.md")),
      commit(30, entry("R087", sha("3"), "A.md", "notes/B.md")),
      commit(20, entry("M", sha("2"), "A.md")),
      commit(10, entry("A", sha("1"), "A.md")),
    ].join("")
    const chains = parseFileLog(log)
    expect(chains.get("notes/B.md")).toEqual([
      { time: 40_000, path: "notes/B.md", blob: sha("4") },
      { time: 30_000, path: "notes/B.md", blob: sha("3") },
      { time: 20_000, path: "A.md", blob: sha("2") },
      { time: 10_000, path: "A.md", blob: sha("1") },
    ])
    expect(chains.get("Other.md")).toEqual([{ time: 40_000, path: "Other.md", blob: sha("5") }])
  })

  test("a deletion has no text; a file made again at a freed name keeps the older commits there", () => {
    const log = [
      commit(40, entry("A", sha("4"), "A.md")),
      commit(30, entry("R100", sha("3"), "A.md", "B.md")),
      commit(20, entry("D", Z, "C.md")),
      commit(10, entry("A", sha("1"), "A.md"), entry("A", sha("2"), "C.md")),
    ].join("")
    const chains = parseFileLog(log)
    expect(chains.get("A.md")!.map((c) => c.time)).toEqual([40_000, 10_000])
    expect(chains.get("B.md")!.map((c) => c.time)).toEqual([30_000, 10_000])
    expect(chains.get("C.md")!.map((c) => c.time)).toEqual([10_000])
  })

  test("a renamed-from path no longer feeds the file that left it", () => {
    // B.md was renamed to D.md; an older, unrelated B.md is not D's past.
    const log = [
      commit(30, entry("R100", sha("3"), "C.md", "D.md")),
      commit(20, entry("R100", sha("2"), "B.md", "C.md")),
      commit(10, entry("M", sha("1"), "D.md")),
    ].join("")
    const chains = parseFileLog(log)
    expect(chains.get("D.md")!.map((c) => c.path)).toEqual(["D.md", "C.md"])
  })

  test("commits without changes, such as merges, and an empty log add nothing", () => {
    expect(parseFileLog("")).toEqual(new Map())
    expect(parseFileLog(`\x01${sha("f")} 10\0`)).toEqual(new Map())
    expect(parseFileLog("garbage")).toEqual(new Map())
  })
})

describe("reading blobs in one batch", () => {
  test("texts by object id, missing objects and other types left out", () => {
    const text = "---\npublish: true\n---\nHà Nội 🌱\n"
    const bytes = Buffer.byteLength(text)
    const out = Buffer.concat([
      Buffer.from(`${sha("1")} blob ${bytes}\n${text}\n`),
      Buffer.from(`${sha("2")} missing\n`),
      Buffer.from(`${sha("3")} tree 3\nabc\n`),
      Buffer.from(`${sha("4")} blob 0\n\n`),
    ])
    expect(parseBlobs(out)).toEqual(
      new Map([
        [sha("1"), text],
        [sha("4"), ""],
      ]),
    )
    expect(parseBlobs(Buffer.from("truncated"))).toEqual(new Map())
  })
})
