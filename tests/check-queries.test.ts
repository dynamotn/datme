import { beforeAll, expect, test } from "bun:test"
import { probeVault } from "./vault-probe"

const fence = (q: string) => "```dataview\n" + q + "\n```"
let result: { problems: { level: string; file: string; message: string }[]; all: number }

beforeAll(() => {
  result = probeVault(
    {
      "Good.md": `---\npublish: true\nrating: 3\n---\n${fence("LIST FROM \"\"")}\n\nRated \`= this.rating\`.\n`,
      "Broken.md": `---\npublish: true\n---\n${fence("TABLE rating FROM WHERE")}\n`,
      "Calendar.md": `---\npublish: true\n---\n${fence("CALENDAR file.ctime")}\n`,
      "Inline.md": "---\npublish: true\n---\nTotal `= (this.a +`.\n\nNot a query: `=x`, and `code`.\n",
      "Private.md": `---\npublish: false\n---\n${fence("TABLE FROM WHERE")}\n`,
    },
    `import { checkVault } from "$src/lib/check"
const all = checkVault()
console.log(JSON.stringify({ all: all.length, problems: all.filter((p) => p.message.startsWith("Dataview")) }))`,
  ).result
}, 60_000)

test("a query that cannot run is an error of its note, so check and --strict catch it before it goes live", () => {
  const broken = result.problems.filter((p) => p.file === "Broken.md")
  expect(broken).toHaveLength(1)
  expect(broken[0].level).toBe("error")
  expect(broken[0].message).toContain("TABLE rating FROM WHERE")
})

test("a query datme does not support yet is a warning", () => {
  expect(result.problems.filter((p) => p.file === "Calendar.md").map((p) => p.level)).toEqual(["warning"])
})

test("inline queries are checked too; working queries and private notes say nothing", () => {
  expect(result.problems.filter((p) => p.file === "Inline.md").map((p) => p.level)).toEqual(["error"])
  expect(result.problems.map((p) => p.file).sort()).toEqual(["Broken.md", "Calendar.md", "Inline.md"])
})
