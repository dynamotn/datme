import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { clientDataSizes, formatBytes, formatClientData } from "../src/lib/client-data"

const out = fs.mkdtempSync(path.join(os.tmpdir(), "datme-client-data-"))
afterAll(() => fs.rmSync(out, { recursive: true, force: true }))
const write = (p: string, bytes: number) => {
  fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true })
  fs.writeFileSync(path.join(out, p), "x".repeat(bytes))
}

describe("sizes of the client data", () => {
  test("bytes read as a person would", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(999)).toBe("999 B")
    expect(formatBytes(1000)).toBe("1.0 kB")
    expect(formatBytes(5330)).toBe("5.3 kB")
    expect(formatBytes(573_016)).toBe("573 kB")
    expect(formatBytes(11_819_330)).toBe("11.8 MB")
  })

  test("per language: every file under /static, largest first, and the neighbourhood files on their own", () => {
    write("static/contentIndex.en-US.json", 12_000)
    write("static/graph.en-US.json", 3000)
    write("static/explorer.en-US.html", 500)
    write("static/contentIndex.vi-VN.json", 100)
    write("static/graph/en-US/a.json", 300)
    write("static/graph/en-US/b.json", 900)
    write("index.html", 99)
    const sizes = clientDataSizes(out)
    expect(sizes).toEqual([
      {
        lang: "en-US",
        total: 15_500,
        files: [
          { name: "contentIndex.en-US.json", bytes: 12_000 },
          { name: "graph.en-US.json", bytes: 3000 },
          { name: "explorer.en-US.html", bytes: 500 },
        ],
        hoods: { count: 2, total: 1200, largest: 900 },
      },
      { lang: "vi-VN", total: 100, files: [{ name: "contentIndex.vi-VN.json", bytes: 100 }], hoods: { count: 0, total: 0, largest: 0 } },
    ])
    expect(formatClientData(sizes)).toBe(
      [
        "Client data, per language:",
        "  en-US: 15.5 kB in 3 files; 2 neighbourhood files for the local graph, 600 B on average, 900 B at most",
        "    contentIndex.en-US.json  12.0 kB",
        "    graph.en-US.json  3.0 kB",
        "    explorer.en-US.html  500 B",
        "  vi-VN: 100 B in 1 file",
        "    contentIndex.vi-VN.json  100 B",
      ].join("\n"),
    )
  })

  test("only the three largest files are listed", () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.xx.json`, bytes: 10 - i }))
    const text = formatClientData([{ lang: "xx", total: 40, files, hoods: { count: 0, total: 0, largest: 0 } }])
    expect(text.split("\n")).toHaveLength(5)
    expect(text).not.toContain("f3.xx.json")
  })

  test("a build without client data says so", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "datme-client-data-"))
    try {
      expect(clientDataSizes(empty)).toEqual([])
      expect(formatClientData([])).toBe("Client data, per language: none")
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })
})
