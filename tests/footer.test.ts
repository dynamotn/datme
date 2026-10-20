import { describe, expect, test } from "bun:test"
import { brandParts, profileOf } from "../src/lib/footer"
import { BRAND_ICONS } from "../src/lib/brand-icons"

describe("profileOf", () => {
  test("knows a service by its host, with or without www and on a subdomain", () => {
    expect(profileOf("https://github.com/me")).toEqual({ href: "https://github.com/me", title: "GitHub", path: BRAND_ICONS.github.path })
    expect(profileOf("https://www.linkedin.com/in/me").title).toBe("LinkedIn")
    expect(profileOf("https://me.substack.com").title).toBe("Substack")
    expect(profileOf("https://twitter.com/me").title).toBe("X")
    expect(profileOf("https://zalo.me/0123").title).toBe("Zalo")
  })
  test("tells a Mastodon profile by its /@user path or the host of the fediverse handle", () => {
    expect(profileOf("https://mastodon.social/@me").title).toBe("Mastodon")
    expect(profileOf("https://fosstodon.org/@me/").title).toBe("Mastodon")
    expect(profileOf("https://social.example/users/me", "@me@social.example").title).toBe("Mastodon")
    expect(profileOf("https://social.example/users/me", "@me@other.example").title).toBe("social.example")
  })
  test("an unknown site keeps its host as its name and has no logo", () => {
    expect(profileOf("https://www.example.org/about")).toEqual({ href: "https://www.example.org/about", title: "example.org" })
    expect(profileOf("not a url")).toEqual({ href: "not a url", title: "not a url" })
  })
  test("every logo is one path on a 24×24 box", () => {
    for (const icon of Object.values(BRAND_ICONS)) expect(icon.path).toMatch(/^[Mm][\d.\s,a-zA-Z-]+$/)
  })
})

describe("brandParts", () => {
  test("a name written like a domain keeps its ending apart", () => {
    expect(brandParts("duyet.net")).toEqual(["duyet", ".net"])
    expect(brandParts("notes.dynamotn.dev")).toEqual(["notes.dynamotn", ".dev"])
  })
  test("any other name stays whole", () => {
    expect(brandParts("My garden")).toEqual(["My garden", ""])
    expect(brandParts("Mr. Smith's notes")).toEqual(["Mr. Smith's notes", ""])
    expect(brandParts("datme")).toEqual(["datme", ""])
    expect(brandParts(".dotfiles")).toEqual([".dotfiles", ""])
    expect(brandParts("trailing.")).toEqual(["trailing.", ""])
  })
})
