import { describe, expect, test } from "bun:test"
import { allTrails, isTrail, trailSteps, trailsOf } from "../src/lib/trails"
import { getVault } from "../src/lib/vault"

const vault = getVault()
const en = vault.byKey["en-US"]

describe("trails", () => {
  test("`trail: true` makes a note a trail", () => {
    expect(isTrail({ trail: true })).toBe(true)
    expect(isTrail({ trail: "true" })).toBe(true)
    expect(isTrail({})).toBe(false)
  })

  test("each list item that starts with a published note is a stop, with the guide's words", () => {
    const trail = allTrails("en-US").get("05_Structure/First walk")!
    expect(trail.steps.map((s) => [s.note.key, s.says])).toEqual([
      ["03_Atomic/Zettelkasten", "where it all starts"],
      ["06_Reference/Niklas Luhmann", "the man behind the slip box"],
      ["03_Atomic/Code", ""],
      ["07_Project/Poem", "in another list is a stop too"],
    ])
  })

  test("a stop knows the stops around it", () => {
    const [place] = trailsOf(en.get("06_Reference/Niklas Luhmann")!)
    expect(place.index).toBe(1)
    expect(place.prev?.key).toBe("03_Atomic/Zettelkasten")
    expect(place.next?.key).toBe("03_Atomic/Code")
    expect(trailsOf(en.get("08_Journal/Garden plans")!)).toEqual([])
  })

  test("links that do not start an item, and notes that are not published, are not stops", () => {
    const zk = en.get("03_Atomic/Zettelkasten")!
    const link = (key: string) => `<a href="#" class="internal" data-key="${key}">x</a>`
    const byKey = new Map([["Z", zk]])
    expect(trailSteps(`1. See ${link("Z")}\n2. ${link("Missing")}\n  - ${link("Z")} nested`, byKey)).toEqual([])
  })
})
