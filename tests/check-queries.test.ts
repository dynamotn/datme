import { beforeAll, expect, test } from "bun:test"
import { probeVault } from "./vault-probe"
import { queryText } from "../src/lib/check"
import { queryProblem } from "../src/lib/dataview-render"

const fence = (q: string) => "```dataview\n" + q + "\n```"
let result: { problems: { level: string; file: string; message: string }[]; all: number }

beforeAll(() => {
  result = probeVault(
    {
      "Good.md": `---\npublish: true\nrating: 3\n---\n${fence('LIST FROM ""')}\n\nRated \`= this.rating\`.\n`,
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

test("a problem names its query by the first line, cut short", () => {
  expect(queryText("  LIST\nFROM x")).toBe("LIST")
  expect(queryText("TABLE " + "a, ".repeat(30))).toMatch(/^TABLE a, .{50}…$/)
  expect(queryText("TABLE " + "a, ".repeat(30))).toHaveLength(60)
})

test("each query on its own: fine, broken, unsupported, inline", () => {
  expect(queryProblem("LIST", "en-US", "index")).toBeUndefined()
  expect(queryProblem("   ", "en-US", "index")).toBeUndefined()
  expect(queryProblem("TABLE FROM WHERE", "en-US", "index")?.level).toBe("error")
  expect(queryProblem("CALENDAR file.ctime", "en-US", "index")).toMatchObject({ level: "warning", message: expect.stringContaining("not supported yet") })
  expect(queryProblem("this.title", "en-US", "index", true)).toBeUndefined()
  expect(queryProblem("(this.a +", "en-US", "index", true)?.level).toBe("error")
  // Anything but a query's own mistake is datme's, and is not dressed up as one.
  expect(() => queryProblem("LIST", "xx-XX" as never, "index")).toThrow(TypeError)
})
