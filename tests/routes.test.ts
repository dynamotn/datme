import { beforeAll, describe, expect, test } from "bun:test"
import { probeVault } from "./vault-probe"

describe("routes", () => {
  // Static hosts and macOS or Windows disks see Archive and archive as one path.
  let probe: { result: any; stderr: string }
  beforeAll(() => {
    probe = probeVault(
      {
        "Archive.md": "---\npublish: true\n---\nThe archive note.\n",
        "notes.md": "---\npublish: true\n---\nA note named like a folder.\n",
        "Notes/Inside.md": "---\npublish: true\ntags: [PKM]\n---\nIn the folder.\n",
        "Other.md": "---\npublish: true\ntags: [pkm]\naliases: [inside note]\n---\nAnother.\n",
      },
      `import { routes } from "$src/lib/routes"
import { checkVault } from "$src/lib/check"
const pages = routes()
console.log(JSON.stringify({
  keys: [...pages.keys()],
  archive: pages.get("Archive")?.kind ?? null,
  problems: checkVault().filter((p) => p.level === "warning").map((p) => p.file + ": " + p.message),
}))`,
    )
  }, 60_000)

  test("a slug is claimed once, whatever its case: the first claim keeps it", () => {
    const lower = probe.result.keys.map((k: string) => k.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
    expect(probe.result.archive).toBe("note")
    expect(probe.result.keys).not.toContain("archive")
    expect(probe.result.keys).toContain("notes")
    expect(probe.result.keys).not.toContain("Notes")
  })

  test("datme check warns about each page lost to a clash", () => {
    const problems: string[] = probe.result.problems
    expect(problems.some((p) => p.startsWith("Archive.md: ") && p.includes("/archive"))).toBe(true)
    expect(problems.some((p) => p.includes("folder Notes") && p.includes("notes.md"))).toBe(true)
    expect(problems.some((p) => p.includes("tag pkm") && p.includes("tag PKM"))).toBe(true)
  })
})
