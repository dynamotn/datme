import Chart from "chart.js/auto"
import type { ChartSpec } from "../lib/charts"

const charts = new Map<HTMLCanvasElement, Chart>()

/** A translucent version of a #rrggbb colour; other colour syntaxes stay opaque. */
const translucent = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c + "cc" : c)

/** Series colours: the theme's accent first, then a palette readable in both themes. */
function palette(): string[] {
  const css = getComputedStyle(document.documentElement)
  const accent = css.getPropertyValue("--accent").trim() || "#2d6a4f"
  return [accent, "#d97706", "#2563eb", "#db2777", "#7c3aed", "#059669", "#dc2626", "#0891b2"]
}

function draw(fig: HTMLElement) {
  const canvas = fig.querySelector("canvas")!
  charts.get(canvas)?.destroy()
  const spec = JSON.parse(fig.dataset.chart!) as ChartSpec
  const colors = palette()
  const css = getComputedStyle(document.documentElement)
  const ink = css.getPropertyValue("--ink-2").trim() || "#444"
  const grid = css.getPropertyValue("--line").trim() || "#ddd"
  const round = spec.type === "pie" || spec.type === "doughnut" || spec.type === "polarArea"
  const chart = new Chart(canvas, {
    type: spec.type,
    data: {
      labels: spec.labels,
      datasets: spec.series.map((s, i) => ({
        label: s.title,
        data: s.data,
        // Round charts colour each slice; the others colour each series.
        backgroundColor: round ? spec.labels.map((_, j) => colors[j % colors.length]) : spec.fill || spec.type === "bar" ? translucent(colors[i % colors.length]) : colors[i % colors.length],
        borderColor: round ? "transparent" : colors[i % colors.length],
        fill: spec.fill,
        tension: spec.tension,
      })),
    },
    options: {
      indexAxis: spec.indexAxis,
      responsive: true,
      color: ink,
      plugins: { legend: { labels: { color: ink } } },
      scales: round
        ? {}
        : {
            x: { stacked: spec.stacked, ticks: { color: ink }, grid: { color: grid } },
            y: { stacked: spec.stacked, beginAtZero: spec.beginAtZero, ticks: { color: ink }, grid: { color: grid } },
          },
    },
  })
  charts.set(canvas, chart)
}

/** Draw every chart of the page, again when the theme changes its colours. */
export function setupCharts(): void {
  document.querySelectorAll<HTMLElement>("figure.chart[data-chart]").forEach(draw)
}

export function teardownCharts(): void {
  charts.forEach((c) => c.destroy())
  charts.clear()
}
