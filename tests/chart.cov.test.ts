import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

interface Config {
  type: string
  data: { labels: string[]; datasets: { label: string; data: number[]; backgroundColor: unknown; borderColor: string; fill?: boolean; tension?: number }[] }
  options: { indexAxis?: string; color: string; scales: Record<string, { stacked?: boolean; beginAtZero?: boolean; grid: { color: string } }> }
}
const made: FakeChart[] = []
class FakeChart {
  destroyed = false
  constructor(
    public canvas: HTMLCanvasElement,
    public config: Config,
  ) {
    made.push(this)
  }
  destroy() {
    this.destroyed = true
  }
}
mock.module("chart.js/auto", () => ({ default: FakeChart }))

type Charts = typeof import("../src/scripts/chart")
let dom: Dom
let charts: Charts
beforeAll(async () => {
  dom = installDom("https://garden.example/charts")
  charts = await import("../src/scripts/chart")
})
afterAll(() => {
  dom.restore()
})

const figure = (spec: object) => `<figure class="chart" data-chart='${JSON.stringify(spec)}'><canvas></canvas></figure>`

describe("charts", () => {
  test("a line chart colours each series with the theme's accent first, on the theme's ink and grid", () => {
    made.length = 0
    dom.document.documentElement.style.setProperty("--accent", "#112233")
    dom.document.documentElement.style.setProperty("--ink-2", "#333")
    dom.document.documentElement.style.setProperty("--line", "#eee")
    dom.document.body.innerHTML = figure({
      type: "line",
      labels: ["a", "b"],
      series: [
        { title: "One", data: [1, 2] },
        { title: "Two", data: [3, 4] },
      ],
      stacked: true,
      beginAtZero: true,
      tension: 0.3,
    })
    charts.setupCharts()
    expect(made).toHaveLength(1)
    const { config, canvas } = made[0]
    expect(canvas).toBe(dom.document.querySelector("canvas")!)
    expect(config.type).toBe("line")
    expect(config.data.labels).toEqual(["a", "b"])
    expect(config.data.datasets.map((d) => [d.label, d.backgroundColor, d.borderColor])).toEqual([
      ["One", "#112233", "#112233"],
      ["Two", "#d97706", "#d97706"],
    ])
    expect(config.data.datasets[0].tension).toBe(0.3)
    expect(config.options.color).toBe("#333")
    expect(config.options.scales.x).toMatchObject({ stacked: true, grid: { color: "#eee" } })
    expect(config.options.scales.y).toMatchObject({ beginAtZero: true })
  })

  test("bars and filled areas are translucent; a colour of another syntax stays as it is", () => {
    made.length = 0
    dom.document.documentElement.style.setProperty("--accent", "rgb(1, 2, 3)")
    dom.document.body.innerHTML =
      figure({
        type: "bar",
        labels: ["a"],
        series: [
          { title: "One", data: [1] },
          { title: "Two", data: [2] },
        ],
        indexAxis: "y",
      }) + figure({ type: "line", labels: ["a"], series: [{ title: "One", data: [1] }], fill: true })
    charts.setupCharts()
    expect(made.map((c) => c.config.data.datasets.map((d) => d.backgroundColor))).toEqual([["rgb(1, 2, 3)", "#d97706cc"], ["rgb(1, 2, 3)"]])
    expect(made[0].config.options.indexAxis).toBe("y")
    expect(made[1].config.data.datasets[0].fill).toBe(true)
  })

  test("round charts colour each slice and have no axes; defaults stand in for missing theme colours", () => {
    made.length = 0
    const root = dom.document.documentElement
    for (const p of ["--accent", "--ink-2", "--line"]) root.style.removeProperty(p)
    const labels = Array.from({ length: 9 }, (_, i) => `l${i}`)
    dom.document.body.innerHTML = ["pie", "doughnut", "polarArea"]
      .map((type) => figure({ type, labels, series: [{ title: "S", data: labels.map(() => 1) }] }))
      .join("")
    charts.setupCharts()
    expect(made).toHaveLength(3)
    for (const c of made) {
      const [ds] = c.config.data.datasets
      expect(ds.borderColor).toBe("transparent")
      expect((ds.backgroundColor as string[])[0]).toBe("#2d6a4f")
      expect((ds.backgroundColor as string[])[8]).toBe("#2d6a4f")
      expect(c.config.options.scales).toEqual({})
      expect(c.config.options.color).toBe("#444")
    }
  })

  test("drawing again replaces a canvas's chart, and teardown destroys them all", () => {
    made.length = 0
    dom.document.body.innerHTML = figure({ type: "line", labels: ["a"], series: [{ title: "S", data: [1] }] })
    charts.setupCharts()
    charts.setupCharts()
    expect(made).toHaveLength(2)
    expect(made[0].destroyed).toBe(true)
    expect(made[1].destroyed).toBe(false)
    charts.teardownCharts()
    expect(made[1].destroyed).toBe(true)
    made.length = 0
    charts.teardownCharts()
    charts.setupCharts()
    expect(made).toHaveLength(1)
  })
})
