import { describe, expect, test } from "bun:test"
import { parseChart, renderChart, ChartError } from "../src/lib/charts"
import { renderMarkdown } from "../src/lib/markdown"

const yaml = `type: line
labels: [Mon, Tue, Wed]
series:
  - title: Notes
    data: [1, 2, oops]
  - title: Links
    data: [3, 4, 5]
tension: 0.4
stacked: true
width: 60%`

describe("charts", () => {
  test("the Charts plugin YAML becomes a spec; bad numbers become gaps", () => {
    expect(parseChart(yaml)).toEqual({
      type: "line",
      labels: ["Mon", "Tue", "Wed"],
      series: [
        { title: "Notes", data: [1, 2, null] },
        { title: "Links", data: [3, 4, 5] },
      ],
      stacked: true,
      fill: false,
      tension: 0.4,
      beginAtZero: false,
      indexAxis: "x",
      width: "60%",
    })
  })

  test("mistakes are explained instead of drawn", () => {
    expect(() => parseChart("type: sankey\nlabels: []\nseries: [{data: []}]")).toThrow('unknown chart type "sankey"')
    expect(() => parseChart("labels: [a]")).toThrow(ChartError)
    expect(renderChart("type: [")).toContain('<p class="dataview dv-error">Chart: invalid YAML')
  })

  test("a canvas for the eye and a data table for screen readers and paper", async () => {
    const html = await renderMarkdown("```chart\n" + yaml + "\n```", "en-US", "x")
    const attr = html.match(/<figure class="chart" style="max-width:60%" data-chart="([^"]+)">/)![1]
    expect(JSON.parse(attr.replace(/&#x22;/g, '"').replace(/&quot;/g, '"'))).toMatchObject({ type: "line", labels: ["Mon", "Tue", "Wed"] })
    expect(html).not.toContain("table-wrap")
    expect(html).toContain('<canvas role="img" aria-label="Notes, Links"></canvas>')
    expect(html).toContain('<tr><th scope="row">Wed</th><td></td><td>5</td></tr>')
  })

  test("a width that is not a plain CSS length is dropped", () => {
    expect(parseChart('labels: [a]\nseries: [{data: [1]}]\nwidth: "1px;background:url(x)"').width).toBeUndefined()
  })
})
