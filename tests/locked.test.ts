import { describe, expect, test } from "bun:test"
import { splitLocked, withoutLocked, lockedPlaceholder } from "../src/lib/locked"
import { getVault } from "../src/lib/vault"
import { renderNote } from "../src/lib/markdown"
import { noteMarkdown } from "../src/lib/llms"
import { decrypt } from "../src/scripts/decrypt"

describe("splitting locked parts", () => {
  test("parts between <!--lock:password--> and <!--lock:*--> leave the note for a placeholder", () => {
    const { md, parts } = splitLocked("a\n<!--lock:pw1-->\nsecret one\n<!--lock:*-->\nb\n<!--lock: pw2 -->\nsecret two")
    expect(parts).toEqual([
      { password: "pw1", md: "secret one" },
      { password: "pw2", md: "secret two" },
    ])
    expect(md).toBe(`a\n\n${lockedPlaceholder(0)}\n\nb\n\n${lockedPlaceholder(1)}\n`)
    expect(md).not.toContain("secret")
  })

  test("a new marker closes the part before it; markers in code fences are text", () => {
    const { md, parts } = splitLocked("<!--lock:a-->\none\n<!--lock:b-->\ntwo\n<!--lock:*-->\n```\n<!--lock:c-->\n```")
    expect(parts.map((p) => p.password)).toEqual(["a", "b"])
    expect(md).toContain("```\n<!--lock:c-->\n```")
  })

  test("markdown copies drop the parts entirely", () => {
    expect(withoutLocked("a\n<!--lock:pw-->\nsecret\n<!--lock:*-->\nb")).not.toMatch(/secret|locked-part/)
  })
})

describe("locked parts of a note", () => {
  const vault = getVault()
  const note = vault.byKey["en-US"].get("07_Project/Blog post")!

  test("their text and links stay out of the note, backlinks and the markdown copy", () => {
    expect(note.lockedParts).toHaveLength(1)
    expect(note.md).not.toContain("hidden treasure")
    expect(note.links.map((l) => l.key)).not.toContain("03_Atomic/Queries")
    expect(vault.backlinks["en-US"].get("03_Atomic/Queries")?.map((b) => b.note.key) ?? []).not.toContain("07_Project/Blog post")
    expect(noteMarkdown(note)).not.toMatch(/hidden treasure|open sesame/)
    expect(noteMarkdown(note)).toContain("After the door.")
  })

  test("the page holds only ciphertext, which the password opens", async () => {
    const r = await renderNote(note)
    expect(r.html).not.toMatch(/hidden treasure|open sesame|Behind the door/)
    expect(r.text).not.toContain("hidden treasure")
    expect(r.headings.map((h) => h.text)).not.toContain("Behind the door")
    const form = r.html.match(/<div class="locked-part" data-lock="0"><form class="locked" data-payload="([^"]+)" data-iterations="(\d+)">/)!
    expect(form).not.toBeNull()
    expect(r.html).toContain("This part is protected by a password.")
    expect(await decrypt(form[1], "wrong", Number(form[2]))).toBeNull()
    const html = (await decrypt(form[1], "open sesame", Number(form[2])))!
    expect(html).toContain("The hidden treasure is next to")
    expect(html).toMatch(/<a href="\/en-US\/03_Atomic\/[^"]+" class="internal" data-key="03_Atomic\/Queries">Queries<\/a>/)
    expect(html).toContain('src="/assets/_assets/images/diagram.png"')
  })
})
