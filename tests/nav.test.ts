import { describe, expect, test } from "bun:test"
import { navLinks } from "../src/lib/nav"

describe("navLinks", () => {
  test("resolves notes like wikilinks and skips missing ones", () => {
    expect(navLinks("vi-VN")).toEqual([
      { label: "Trang chủ", url: "/" },
      { label: "Về Luhmann", url: "/06_Reference/Niklas-Luhmann" },
      { label: "Thẻ", url: "/tags" },
    ])
  })

  test("uses the language's URLs and labels", () => {
    expect(navLinks("en-US").map((l) => l.url)).toEqual(["/en-US", "/en-US/06_Reference/Niklas-Luhmann-(sociologist)", "/en-US/tags"])
    expect(navLinks("en-US")[1].label).toBe("About Luhmann")
  })
})
