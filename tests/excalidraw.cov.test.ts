import { describe, expect, test } from "bun:test"
import { renderScene, type ExElement, type FileView, type Scene } from "../src/lib/excalidraw"

const scene = (elements: ExElement[]): Scene => ({ background: "#ffffff", files: {}, exportOptions: {}, elements })
const photo = (): FileView => ({ kind: "image", href: "/assets/p&q.png" })

describe("freehand strokes", () => {
  test("a stroke is filled as one closed outline in its stroke colour", () => {
    const svg = renderScene(
      scene([
        {
          id: "f",
          type: "freedraw",
          x: 0,
          y: 0,
          width: 40,
          height: 10,
          strokeColor: "#e03131",
          points: [
            [0, 0],
            [10, 5],
            [40, 10],
          ],
          pressures: [0.2, 0.9, 0.4],
          simulatePressure: false,
        },
      ]),
    )
    const path = svg.match(/<path d="(M [^"]+ Z)" fill="#e03131"\/>/)
    expect(path).not.toBeNull()
    // Each point is followed by the midpoint to the next, as quadratic curves.
    expect(path![1]).toMatch(/^M -?\d+\.\d{2} -?\d+\.\d{2} Q( -?\d+\.\d{2}){4,}/)
  })

  test("a stroke without pressures or colour takes the defaults, and one without points draws nothing", () => {
    const svg = renderScene(
      scene([
        {
          id: "f",
          type: "freedraw",
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          points: [
            [0, 0],
            [20, 20],
          ],
        },
        { id: "g", type: "freedraw", x: 50, y: 50, width: 0, height: 0 },
      ]),
    )
    expect(svg.match(/fill="#1e1e1e"\/>/g)).toHaveLength(1)
  })
})

describe("images", () => {
  test("a cropped image shows only its window of the picture", () => {
    const svg = renderScene(
      scene([
        {
          id: "i",
          type: "image",
          x: 0,
          y: 0,
          width: 50,
          height: 25,
          fileId: "f1",
          crop: { x: 10, y: 20, width: 100, height: 50, naturalWidth: 400, naturalHeight: 300 },
        },
      ]),
      { resolveFile: photo },
    )
    expect(svg).toContain(
      '<svg viewBox="10 20 100 50" width="50" height="25" preserveAspectRatio="none"><image href="/assets/p&amp;q.png" width="400" height="300"/></svg>',
    )
  })

  test("a flipped image is mirrored in place, a crop of no size is ignored", () => {
    const svg = renderScene(
      scene([
        {
          id: "h",
          type: "image",
          x: 0,
          y: 0,
          width: 50,
          height: 25,
          fileId: "f1",
          scale: [-1, 1],
          crop: { x: 0, y: 0, width: 0, height: 10, naturalWidth: 1, naturalHeight: 1 },
        },
        { id: "v", type: "image", x: 100, y: 0, width: 50, height: 25, fileId: "f1", scale: [1, -1] },
        {
          id: "c",
          type: "image",
          x: 200,
          y: 0,
          width: 50,
          height: 25,
          fileId: "f1",
          scale: [-1, -1],
          crop: { x: 1, y: 2, width: 3, height: 4, naturalWidth: 5, naturalHeight: 6 },
        },
      ]),
      { resolveFile: photo },
    )
    expect(svg).toContain('<image href="/assets/p&amp;q.png" width="50" height="25" preserveAspectRatio="none" transform="translate(50 0) scale(-1 1)"/>')
    expect(svg).toContain('preserveAspectRatio="none" transform="translate(0 25) scale(1 -1)"/>')
    expect(svg).toContain('<svg viewBox="1 2 3 4" width="50" height="25" preserveAspectRatio="none" transform="translate(50 25) scale(-1 -1)"><image')
  })

  test("a rounded image is clipped to its rounded box, under the drawing's own prefix", () => {
    const svg = renderScene(scene([{ id: "r", type: "image", x: 0, y: 0, width: 50, height: 20, fileId: "f1", roundness: { type: 3 } }]), {
      resolveFile: photo,
      idPrefix: "d1",
    })
    expect(svg).toContain(
      '<clipPath id="d1-r-r"><rect width="50" height="20" rx="2"/></clipPath><image href="/assets/p&amp;q.png" width="50" height="20" preserveAspectRatio="none" clip-path="url(#d1-r-r)"/>',
    )
  })
})

describe("elements with nothing to show", () => {
  test("embeds and unknown elements leave no trace", () => {
    const rect: ExElement = { id: "r", type: "rectangle", x: 0, y: 0, width: 50, height: 50, seed: 1 }
    const alone = renderScene(scene([rect]))
    const svg = renderScene(
      scene([rect, { id: "e", type: "embeddable", x: 10, y: 10, width: 20, height: 20 }, { id: "w", type: "laser", x: 5, y: 5, width: 20, height: 20 }]),
    )
    expect(svg).toBe(alone)
  })
})
