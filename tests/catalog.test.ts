import { describe, expect, test } from "bun:test"
import { callNumber, ROOT_CLASS } from "../src/lib/catalog"

describe("callNumber", () => {
  const tops = ["Atlas", "03 Atoms", "Đà Lạt", "Wiki"]

  test("a numbered top folder keeps its number, then three letters of its name", () => {
    expect(callNumber("03 Atoms", tops)).toBe("03.ATO")
    expect(callNumber("7. Projects", tops)).toBe("07.PRO")
    expect(callNumber("120-Reading", tops)).toBe("120.REA")
  })

  test("a subfolder adds its own name after a middle dot", () => {
    expect(callNumber("03 Atoms/Code", tops)).toBe("03.ATO · Code")
    expect(callNumber("03_Atomic/Code", tops)).toBe("03.ATO · Code")
    expect(callNumber("03 Atoms/Code/Rust", tops)).toBe("03.ATO · Rust")
  })

  test("an unnumbered top folder is numbered by its place among the top folders", () => {
    expect(callNumber("Atlas", tops)).toBe("01.ATL")
    expect(callNumber("Wiki/People", tops)).toBe("04.WIK · People")
    // One the list does not hold, as a folder of another language, is filed first.
    expect(callNumber("Elsewhere", tops)).toBe("01.ELS")
  })

  test("letters lose their accents, and a name of digits alone keeps its number", () => {
    expect(callNumber("Đà Lạt", tops)).toBe("03.DAL")
    expect(callNumber("Été", ["Été"])).toBe("01.ETE")
    expect(callNumber("2026", ["2026"])).toBe("2026")
    expect(callNumber("日本語の本", ["日本語の本"])).toBe("01.日本語")
  })

  test("a note at the root is filed under general works", () => {
    expect(callNumber("", tops)).toBe(ROOT_CLASS)
    expect(ROOT_CLASS).toBe("00.GEN")
  })
})
