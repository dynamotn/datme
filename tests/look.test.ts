import { describe, expect, test } from "bun:test"
import { resolveLook, lookOf, pickOption, CHROMES, frameOf, startsDark, isGarden, LAYOUT_LOOKS, explainDir, explainLook, explainFrame, explainTags, explainStage, explainDefault, defaultLook, inDays, monthDayOf } from "../src/lib/look"
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

describe("explainTags", () => {
  const rules = { tags: { poem: "classic" as const, "poem/haiku": "garden" as const, til: "notebook" as const } }
  test("the note's first tag with a style wins, whatever the order of the config", () => {
    expect(explainTags(["draft", "til", "poem"], rules)).toEqual({ value: "notebook", rule: { kind: "tags", tag: "til" } })
    expect(explainTags(["Poem", "til"], rules)).toEqual({ value: "classic", rule: { kind: "tags", tag: "poem" } })
  })
  test("a nested tag takes its parent's style, unless it has its own", () => {
    expect(explainTags(["poem/sonnet"], rules)?.rule).toEqual({ kind: "tags", tag: "poem" })
    expect(explainTags(["poem/haiku/spring"], rules)).toEqual({ value: "garden", rule: { kind: "tags", tag: "poem/haiku" } })
    expect(explainTags(["poems"], rules)).toBeUndefined()
  })
  test("no tag, or no rule, gives nothing", () => {
    expect(explainTags([], rules)).toBeUndefined()
    expect(explainTags(["poem"], { tags: {} })).toBeUndefined()
  })
  test("in explainLook, tags come after the note and its layout, before its folder", () => {
    // The fixture styles no tag: a note's tags leave it to its folder.
    expect(explainLook({ dir: "07_Project", tags: ["poem"] }).rule).toEqual({ kind: "classic", folder: "07_Project" })
    expect(lookOf({ dir: "03_Atomic", layout: "cv", tags: ["poem"] })).toBe("resume")
  })
})

describe("explainStage", () => {
  const rules = { stages: { "01_Fleeting": "notebook" as const, "03_Atomic": "manuscript" as const } }
  test("the note's stage picks its style", () => {
    expect(explainStage("03_Atomic", rules)).toEqual({ value: "manuscript", rule: { kind: "stages", stage: "03_Atomic" } })
    expect(explainStage("07_Project", rules)).toBeUndefined()
    expect(explainStage(undefined, rules)).toBeUndefined()
  })
  test("in explainLook, the stage comes after the tags, before the folder", () => {
    const appearance = { ...base, folders: { "03_Atomic": "garden" as const }, tags: { poem: "classic" as const }, stages: rules.stages }
    expect(explainLook({ dir: "03_Atomic", stage: "03_Atomic" }, appearance).rule).toEqual({ kind: "stages", stage: "03_Atomic" })
    expect(explainLook({ dir: "03_Atomic", stage: "03_Atomic", tags: ["poem"] }, appearance).rule).toEqual({ kind: "tags", tag: "poem" })
    expect(explainLook({ dir: "03_Atomic" }, appearance).rule).toEqual({ kind: "folders", folder: "03_Atomic" })
  })
})

describe("explainDefault", () => {
  const appearance = { ...base, languages: { "vi-VN": "lacquer" as const } }
  test("a language's own style, else the site style", () => {
    expect(explainDefault("vi-VN", appearance)).toEqual({ value: "lacquer", rule: { kind: "languages", lang: "vi-VN" } })
    expect(explainDefault("en-US", appearance)).toEqual({ value: "notebook", rule: { kind: "site" } })
    expect(explainDefault(undefined, appearance)).toEqual({ value: "notebook", rule: { kind: "site" } })
    expect(explainDefault("vi-VN", base)).toEqual({ value: "notebook", rule: { kind: "site" } })
    // The fixture styles no language.
    expect(defaultLook("vi-VN")).toBe("notebook")
  })
  test("folders, stages and tags still win over the language", () => {
    const rules = { ...appearance, folders: { Writing: "classic" as const }, tags: { poem: "garden" as const }, stages: { Seeds: "notebook" as const } }
    expect(explainDir("Notes", rules, "vi-VN").rule).toEqual({ kind: "languages", lang: "vi-VN" })
    expect(explainDir("Writing", rules, "vi-VN").value).toBe("classic")
    expect(explainLook({ dir: "Notes", lang: "vi-VN" }, rules).value).toBe("lacquer")
    expect(explainLook({ dir: "Notes", lang: "vi-VN", stage: "Seeds" }, rules).value).toBe("notebook")
    expect(explainLook({ dir: "Notes", lang: "vi-VN", tags: ["poem"] }, rules).value).toBe("garden")
    expect(explainLook({ dir: "Notes", lang: "en-US" }, rules).rule).toEqual({ kind: "site" })
  })
})

describe("appearance.schedule", () => {
  const day = (md: string) => new Date(`2027-${md}T12:00:00`)
  const appearance = {
    ...base,
    languages: { "vi-VN": "lacquer" as const },
    schedule: [
      { style: "garden" as const, from: "12-24", to: "01-02" },
      { style: "classic" as const, from: "01-01", to: "01-31" },
    ],
  }
  test("a day of the year, in local time", () => {
    expect(monthDayOf(day("01-05"))).toBe("01-05")
    expect(monthDayOf(day("12-31"))).toBe("12-31")
  })
  test("a range includes both ends and may wrap the year", () => {
    expect(inDays("01-20", "01-20", "02-20")).toBe(true)
    expect(inDays("02-20", "01-20", "02-20")).toBe(true)
    expect(inDays("02-21", "01-20", "02-20")).toBe(false)
    expect(inDays("12-30", "12-24", "01-02")).toBe(true)
    expect(inDays("01-02", "12-24", "01-02")).toBe(true)
    expect(inDays("06-01", "12-24", "01-02")).toBe(false)
  })
  test("the first entry covering the build day replaces the site and language styles", () => {
    expect(explainDefault("vi-VN", appearance, day("12-25"))).toEqual({ value: "garden", rule: { kind: "schedule", from: "12-24", to: "01-02" } })
    expect(explainDefault("en-US", appearance, day("01-01")).value).toBe("garden")
    expect(explainDefault("en-US", appearance, day("01-15")).value).toBe("classic")
    expect(explainDefault("vi-VN", appearance, day("03-01")).rule).toEqual({ kind: "languages", lang: "vi-VN" })
    expect(explainDefault(undefined, appearance, day("03-01")).rule).toEqual({ kind: "site" })
  })
})

describe("startsDark", () => {
  test("darkroom, terminal, blueprint and lacquer start dark, the others light", () => {
    const dark = ["darkroom", "terminal", "blueprint", "lacquer"]
    for (const s of STYLES) expect(startsDark(s)).toBe(dark.includes(s))
  })
})

describe("isGarden", () => {
  test("the herbarium and the paddy fields show the garden, pressed or terraced; the other styles do not", () => {
    expect(STYLES.filter(isGarden)).toEqual(["garden", "herbarium", "paddy"])
  })
})
