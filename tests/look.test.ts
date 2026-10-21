import { describe, expect, test } from "bun:test"
import { resolveLook, lookOf, pickOption, CHROMES, frameOf, startsDark, isGarden, LAYOUT_LOOKS, explainDir, explainLook, explainFrame } from "../src/lib/look"
import { LAYOUTS } from "../src/lib/vault"
import { STYLES } from "../src/site.config"

const base = { style: "notebook" as const, classic: [] as string[], folders: {} }

describe("resolveLook", () => {
  test("without rules, the site style", () => {
    expect(resolveLook("Notes", base)).toBe("notebook")
    expect(resolveLook("", { ...base, style: "garden" })).toBe("garden")
  })
  test("classic folders flip notebook and classic; under garden they are classic", () => {
    expect(resolveLook("Writing/Poems", { ...base, classic: ["Writing"] })).toBe("classic")
    expect(resolveLook("Writing", { ...base, style: "classic", classic: ["Writing"] })).toBe("notebook")
    expect(resolveLook("Writing", { ...base, style: "garden", classic: ["Writing"] })).toBe("classic")
    expect(resolveLook("Writings", { ...base, classic: ["Writing"] })).toBe("notebook")
  })
  test("a style per folder, subfolders included; the longest match wins across both lists", () => {
    const a = { ...base, classic: ["A/B"], folders: { A: "garden" as const } }
    expect(resolveLook("A", a)).toBe("garden")
    expect(resolveLook("A/C", a)).toBe("garden")
    expect(resolveLook("A/B/D", a)).toBe("classic")
  })
  test("on a tie, folders win over classic", () => {
    expect(resolveLook("A", { ...base, classic: ["A"], folders: { A: "garden" } })).toBe("garden")
  })
})

describe("lookOf", () => {
  test("follows the fixture's classic folders", () => {
    expect(lookOf({ dir: "07_Project" })).toBe("classic")
    expect(lookOf({ dir: "07_Project/Poems" })).toBe("classic")
    expect(lookOf({ dir: "07_Projects" })).toBe("notebook")
    expect(lookOf(undefined)).toBe("notebook")
  })
})

describe("pickOption", () => {
  test("normalises like layout", () => {
    expect(pickOption(" Garden ", STYLES)).toEqual({ value: "garden" })
    expect(pickOption("MINIMAL", CHROMES)).toEqual({ value: "minimal" })
  })
  test("flags unknown strings and ignores the rest", () => {
    expect(pickOption("fancy", STYLES)).toEqual({ invalid: "fancy" })
    expect(pickOption("full-norail", CHROMES)).toEqual({ invalid: "full-norail" })
    expect(pickOption(undefined, STYLES)).toEqual({})
    expect(pickOption(3, STYLES)).toEqual({})
    expect(pickOption("", STYLES)).toEqual({})
  })
})

describe("lookOf with notes", () => {
  test("note style beats layout, layout beats folders", () => {
    expect(lookOf({ dir: "07_Project", layout: "cv" })).toBe("resume")
    expect(lookOf({ dir: "07_Project", layout: "cv", style: "garden" })).toBe("garden")
    expect(lookOf({ dir: "07_Project", layout: "projects" })).toBe("classic") // folder rule, layout has no style
    expect(lookOf({ dir: "03_Atomic", layout: "gallery" })).toBe("darkroom")
    expect(lookOf({ dir: "03_Atomic", style: "garden" })).toBe("garden")
  })
})

describe("frameOf", () => {
  test("note chrome beats the layout default, which beats full", () => {
    expect(frameOf({ layout: "cv" })).toBe("minimal")
    expect(frameOf({ layout: "cv", chrome: "full" })).toBe("full")
    expect(frameOf({ layout: "timeline" })).toBe("full-norail")
    expect(frameOf({ layout: "faq" })).toBe("full")
    expect(frameOf({ chrome: "minimal" })).toBe("minimal")
    expect(frameOf({})).toBe("full")
    expect(frameOf(undefined)).toBe("full")
  })
  test("every layout has a row, and rows only use known values", () => {
    for (const l of LAYOUTS) expect(LAYOUT_LOOKS[l]).toBeDefined()
    for (const row of Object.values(LAYOUT_LOOKS)) {
      if (row.style) expect(STYLES).toContain(row.style)
      expect([...CHROMES, "full-norail"]).toContain(row.frame)
    }
  })
})

describe("explainDir, explainLook and explainFrame", () => {
  test("name the folder rule that won, or the site style", () => {
    expect(explainDir("Notes", base)).toEqual({ value: "notebook", rule: { kind: "site" } })
    const a = { ...base, classic: ["A/B"], folders: { A: "garden" as const } }
    expect(explainDir("A/C", a)).toEqual({ value: "garden", rule: { kind: "folders", folder: "A" } })
    expect(explainDir("A/B/D", a)).toEqual({ value: "classic", rule: { kind: "classic", folder: "A/B" } })
  })
  test("name the note, its layout or its folder, in that order", () => {
    expect(explainLook({ dir: "03_Atomic", style: "garden", layout: "cv" }).rule).toEqual({ kind: "note" })
    expect(explainLook({ dir: "03_Atomic", layout: "cv" })).toEqual({ value: "resume", rule: { kind: "layout", layout: "cv" } })
    expect(explainLook({ dir: "07_Project", layout: "projects" }).rule).toEqual({ kind: "classic", folder: "07_Project" })
    expect(explainLook(undefined)).toEqual({ value: "notebook", rule: { kind: "site" } })
  })
  test("name the note's chrome, its layout's or the default", () => {
    expect(explainFrame({ chrome: "full", layout: "cv" })).toEqual({ value: "full", rule: { kind: "note" } })
    expect(explainFrame({ layout: "cv" })).toEqual({ value: "minimal", rule: { kind: "layout", layout: "cv" } })
    expect(explainFrame(undefined)).toEqual({ value: "full", rule: { kind: "default" } })
  })
})

describe("startsDark", () => {
  test("darkroom, terminal, blueprint and lacquer start dark, the others light", () => {
    const dark = ["darkroom", "terminal", "blueprint", "lacquer"]
    for (const s of STYLES) expect(startsDark(s)).toBe(dark.includes(s))
  })
})

describe("isGarden", () => {
  test("the herbarium shows the garden, pressed; the other styles do not", () => {
    expect(STYLES.filter(isGarden)).toEqual(["garden", "herbarium"])
  })
})
