import { describe, expect, test } from "bun:test"
import { flashcards, isDeck } from "../src/lib/flashcards"
import { renderMarkdown } from "../src/lib/markdown"

const cards = (md: string) => flashcards(md, "Show")
const html = (md: string) => renderMarkdown(cards(md), "en-US", "deck")

describe("isDeck", () => {
  test("a frontmatter tag or an inline #tag makes a deck, sub-tags included", () => {
    expect(isDeck(["flashcards"], "", ["flashcards"])).toBe(true)
    expect(isDeck(["flashcards/biology"], "", ["flashcards"])).toBe(true)
    expect(isDeck([], "Some text\n#flashcards/spanish\n", ["flashcards"])).toBe(true)
    expect(isDeck(["notes"], "about #flashcardsapp", ["flashcards"])).toBe(false)
  })
})

describe("flashcards", () => {
  test("Q::A becomes a card that keeps its markdown", async () => {
    const out = await html("What is **2+2**::It is $4$")
    expect(out).toContain('<details class="flashcard">')
    expect(out).toMatch(/<summary data-hint="Show">\s*<p>What is <strong>2\+2<\/strong><\/p>/)
    expect(out).toMatch(/<div class="flashcard-answer">\s*<p>It is <span class="katex">/)
  })

  test("Q:::A makes a card in both directions", () => {
    const out = cards("Hund:::dog")
    expect(out.match(/<details/g)).toHaveLength(2)
    expect(out.indexOf("Hund")).toBeLessThan(out.indexOf("dog"))
    expect(out.lastIndexOf("Hund")).toBeGreaterThan(out.lastIndexOf("dog"))
  })

  test("multi-line cards split at a line holding ?", async () => {
    const out = await html("Intro\n\nName the stages\nof mitosis\n?\nProphase\nMetaphase\n\nAfter")
    expect(out).toContain("<p>Intro</p>")
    expect(out).toMatch(/<summary data-hint="Show">\s*<p>Name the stages\nof mitosis<\/p>/)
    expect(out).toMatch(/<div class="flashcard-answer">\s*<p>Prophase\nMetaphase<\/p>/)
    expect(out).toContain("<p>After</p>")
  })

  test("?? reverses a multi-line card too", () => {
    expect(cards("front\n??\nback").match(/<details/g)).toHaveLength(2)
  })

  test("cards in a list stay in the list", async () => {
    const out = await html("- one::1\n- two::2")
    expect(out).toMatch(/<li>\s*<details class="flashcard"><summary data-hint="Show">one<\/summary>/)
    expect(out.match(/<li>/g)).toHaveLength(2)
  })

  test("separators inside code are not cards, but code inside a card is fine", () => {
    expect(cards("```cpp\nstd::vector<int> v;\n```")).not.toContain("<details")
    expect(cards("Use `a::b` here")).not.toContain("<details")
    expect(cards("What is `std::vector`?::A growable array")).toContain("<summary data-hint=\"Show\">\n\nWhat is `std::vector`?\n\n</summary>")
  })

  test("headings, quotes, tables and four colons are left alone", () => {
    for (const md of ["# Title::x", "> a::b", "| a::b |", "a::::b", "::b", "a::"]) expect(cards(md)).toBe(md)
  })
})
