import { describe, expect, test } from "bun:test"
import { graphCounts, parseGraph, renderGraph } from "../src/lib/contribution-graph"
import { extractTasks, type Engine, type Page } from "../src/lib/dataview"

const page = (key: string, over: Partial<Page>): Page => ({
  key,
  title: key,
  url: "/" + key,
  dir: "",
  stem: key,
  tags: [],
  explicitTags: [],
  fields: {},
  outlinks: [],
  inlinks: [],
  ...over,
})
const pages = [
  page("run-1", { tags: ["run"], created: new Date("2026-10-01T08:00:00Z"), fields: { km: 5, ran: "2026-10-02" } }),
  page("run-2", { tags: ["run"], created: new Date("2026-10-01T18:00:00Z"), fields: { km: 10, ran: "2026-10-03" } }),
  page("book", { created: new Date("2026-10-04T08:00:00Z"), tasks: extractTasks("- [x] read ✅ 2026-10-05\n- [ ] later ✅ 2026-10-05") }),
  page("old", { tags: ["run"], created: new Date("2025-01-01T08:00:00Z") }),
]
const engine: Engine = { pages, resolve: () => undefined }
const today = new Date("2026-10-07T12:00:00Z")

describe("contribution graphs", () => {
  test("defaults: every page by creation, the last 180 days", () => {
    expect(parseGraph("title: x", today)).toMatchObject({ title: "x", from: "2026-04-11", to: "2026-10-07", type: "PAGE", source: "" })
    expect(parseGraph("dateRangeType: FIXED_DATE_RANGE\nfromDate: 2026-01-01\ntoDate: 2026-03-31", today)).toMatchObject({ from: "2026-01-01", to: "2026-03-31" })
  })

  test("a Dataview source picks the pages; one per page, or a property's number", () => {
    const o = parseGraph("dataSource:\n  type: PAGE\n  value: '#run'", today)
    expect(Object.fromEntries(graphCounts(o, engine))).toEqual({ "2026-10-01": { count: 2, titles: ["run-1", "run-2"] } })
    const km = parseGraph(
      "dataSource:\n  value: '#run'\n  dateField: { type: PAGE_PROPERTY, value: ran }\n  countField: { type: PAGE_PROPERTY, value: km }",
      today,
    )
    expect([...graphCounts(km, engine)].map(([d, c]) => [d, c.count])).toEqual([["2026-10-02", 5], ["2026-10-03", 10]])
  })

  test("tasks count on the day they were done", () => {
    const o = parseGraph("dataSource: { type: ALL_TASK }", today)
    expect([...graphCounts(o, engine)].map(([d, c]) => [d, c.count])).toEqual([["2026-10-05", 1]])
  })

  test("a grid of Monday-first weeks, coloured by level or by the block's rules", () => {
    const html = renderGraph(
      "title: Runs\ndateRangeValue: 14\ndataSource: { value: '#run' }\ncellStyleRules:\n  - { color: '#ff0000', min: 2, max: 99 }\n  - { color: 'red;x', min: 1, max: 2 }",
      "en-US",
      engine,
      today,
    )
    expect(html).toContain('<figcaption class="panel-title">Runs <span>2</span></figcaption>')
    expect(html).toMatch(/<span class="day l4" style="background:#ff0000" title="Oct 1, 2026: 2 · run-1, run-2"><\/span>/)
    expect(html).not.toContain("red;x")
    // 24 Sep to 7 Oct 2026 spans Monday 21 Sep to Sunday 11 Oct: three weeks.
    expect(html).toContain("grid-template-columns: repeat(3, 1fr)")
    expect(renderGraph("dataSource: [oops", "en-US", engine, today)).toContain("dv-error")
  })
})
