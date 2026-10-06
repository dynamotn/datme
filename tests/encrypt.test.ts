import { describe, expect, test } from "bun:test"
import { encrypt } from "../src/lib/encrypt"
import { decrypt } from "../src/scripts/decrypt"

describe("note encryption", () => {
  test("the browser decrypts what the build encrypted", async () => {
    const payload = await encrypt("<p>Ghi chú bí mật</p>", "correct horse", 100_000)
    expect(payload).not.toContain("bí mật")
    expect(await decrypt(payload, "correct horse", 100_000)).toBe("<p>Ghi chú bí mật</p>")
  })

  test("a wrong password or iteration count yields nothing", async () => {
    const payload = await encrypt("secret", "pw", 100_000)
    expect(await decrypt(payload, "PW", 100_000)).toBeNull()
    expect(await decrypt(payload, "pw", 100_001)).toBeNull()
  })

  test("every encryption uses a fresh salt and IV", async () => {
    expect(await encrypt("same", "pw", 100_000)).not.toBe(await encrypt("same", "pw", 100_000))
  })
})
