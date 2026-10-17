import { describe, expect, test } from "bun:test"
import { resolveLook, lookOf, pickOption, CHROMES } from "../src/lib/look"
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
