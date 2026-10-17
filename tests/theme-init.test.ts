import { expect, test } from "bun:test"
import { initialTheme } from "../src/lib/theme-init"

test("a stored choice wins, then the page's default, then the site, then the system", () => {
  expect(initialTheme("light", "dark", "dark", true)).toBe("light")
  expect(initialTheme(null, "dark", "light", false)).toBe("dark")
  expect(initialTheme(null, undefined, "light", true)).toBe("light")
  expect(initialTheme(null, undefined, undefined, true)).toBe("dark")
  expect(initialTheme("bogus", undefined, undefined, false)).toBe("light")
})
