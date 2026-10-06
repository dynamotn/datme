import { describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { noteLd, serializeLd, websiteLd } from "../src/lib/jsonld"

const vi = getVault().byKey["vi-VN"]

describe("JSON-LD", () => {
  test("a note is an Article with absolute URLs, dates and its folders as breadcrumbs", () => {
    const note = vi.get("03_Atomic/Zettelkasten")!
    const [article, crumbs] = noteLd(note, { title: "Zettelkasten", description: "A method", image: "/og/x.png", words: 42 })
    expect(article).toMatchObject({
      "@type": "Article",
      headline: "Zettelkasten",
      url: "https://notes.dynamotn.dev/03_Atomic/Zettelkasten",
      image: "https://notes.dynamotn.dev/og/x.png",
      inLanguage: "vi-VN",
      datePublished: note.created!.toISOString(),
      wordCount: 42,
      author: { "@type": "Person", name: "Tester" },
    })
    const items = crumbs.itemListElement as { name: string; position: number }[]
    expect(items.map((i) => i.position)).toEqual([1, 2, 3])
    expect(items.at(-1)!.name).toBe("Zettelkasten")
  })

  test("blog notes are blog postings, protected ones are not free to read", () => {
    expect(noteLd(vi.get("07_Project/Blog post")!, { title: "x", words: 0 })[0]["@type"]).toBe("BlogPosting")
    expect(noteLd(vi.get("06_Reference/Secret")!, { title: "x", words: 0 })[0].isAccessibleForFree).toBe(false)
  })

  test("the home page describes the website", () => {
    expect(websiteLd("en-US")[0]).toMatchObject({ "@type": "WebSite", name: "Test garden", url: "https://notes.dynamotn.dev/en-US" })
  })

  test("serialized data cannot close its script tag", () => {
    expect(serializeLd({ name: "</script><b>" })).not.toContain("</script>")
  })
})
