import { describe, expect, test } from "bun:test"
import { splitLocked, withoutLocked, lockedPlaceholder, resolvePassword, groupVariable } from "../src/lib/locked"
import { inlineAssets } from "../src/lib/inline-assets"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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

  test("@group passwords come from the environment, never from the vault", () => {
    expect(groupVariable("close-friends")).toBe("DATME_LOCK_CLOSE_FRIENDS")
    expect(resolvePassword("plain words")).toEqual({ password: "plain words" })
    expect(resolvePassword("@friends", { DATME_LOCK_FRIENDS: "s3cret" })).toEqual({ password: "s3cret", variable: "DATME_LOCK_FRIENDS" })
    expect(resolvePassword("@friends", { DATME_LOCK_FRIENDS: "" })).toEqual({ password: undefined, variable: "DATME_LOCK_FRIENDS" })
  })

  test("markdown copies drop the parts entirely", () => {
    expect(withoutLocked("a\n<!--lock:pw-->\nsecret\n<!--lock:*-->\nb")).not.toMatch(/secret|locked-part/)
  })
})

describe("files of encrypted content", () => {
  test("private files become data URIs without their resized copies; public ones stay links", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-inline-"))
    fs.writeFileSync(path.join(dir, "a.png"), "PNG")
    const html = '<img src="/assets/a.png" srcset="/assets/a.png.w480.webp 480w" sizes="100vw"><img src="/assets/b.png" srcset="x"><a href="/assets/a.png">a</a>'
    const out = inlineAssets(html, dir, (rel) => rel === "b.png")
    expect(out.html).toBe(
      '<img src="data:image/png;base64,UE5H"><img src="/assets/b.png" srcset="x"><a href="data:image/png;base64,UE5H">a</a>',
    )
    expect(out.inlined).toEqual(["a.png"])
  })
})

describe("locked parts of a note", () => {
  const vault = getVault()
  const note = vault.byKey["en-US"].get("07_Project/Blog post")!

  test("their text and links stay out of the note, backlinks and the markdown copy", () => {
    expect(note.lockedParts).toHaveLength(3)
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
    // A file other notes publish stays a link; one only the part uses travels inside it.
    expect(html).toContain('src="/assets/_assets/images/diagram.png"')
    expect(html).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="" loading="lazy"/)
    expect(vault.assets.has("_assets/images/vault-key.png")).toBe(false)
  })

  test("a group part opens with the password from the environment; an unset group is left out and reported", async () => {
    const r = await renderNote(note)
    const forms = [...r.html.matchAll(/data-payload="([^"]+)" data-iterations="(\d+)"/g)]
    expect(forms).toHaveLength(2)
    expect(await decrypt(forms[1][1], "tester-password", Number(forms[1][2]))).toContain("Only testers read this group secret.")
    expect(r.html).not.toContain('data-lock="2"')
    expect(vault.problems).toContainEqual({
      level: "error",
      file: "07_Project/Blog post.md",
      message: "locked part @nobody needs the DATME_LOCK_NOBODY environment variable; it is left out",
    })
  })

  test("a note whose group password is unset is not published at all", () => {
    expect(vault.sources.has("06_Reference/Club")).toBe(false)
    expect(vault.problems).toContainEqual({
      level: "error",
      file: "06_Reference/Club.md",
      message: "password @nobody needs the DATME_LOCK_NOBODY environment variable; the note is not published",
    })
  })

  test("a protected note's own files are not published, only carried in its ciphertext", async () => {
    expect(vault.assets.has("_assets/images/secret-map.png")).toBe(false)
    const { renderSecret } = await import("../src/lib/markdown")
    const secret = vault.byKey["en-US"].get("06_Reference/Secret")!
    expect((await renderSecret(secret)).html).toContain("data:image/png;base64,")
  })
})
