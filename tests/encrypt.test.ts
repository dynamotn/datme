import { describe, expect, test } from "bun:test"
import { encrypt } from "../src/lib/encrypt"
import { decrypt, decryptWith, passwordKey, payloadKey, saltOf } from "../src/scripts/decrypt"

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

  test("a damaged payload or iteration count yields nothing instead of throwing", async () => {
    const payload = await encrypt("secret", "pw", 1000)
    expect(await decrypt("not base64!", "pw", 1000)).toBeNull()
    expect(await decrypt(payload, "pw", NaN)).toBeNull()
  })

  test("every encryption uses a fresh salt and IV", async () => {
    expect(await encrypt("same", "pw", 100_000)).not.toBe(await encrypt("same", "pw", 100_000))
  })

  test("a payload's key opens it without the password, and opens nothing else", async () => {
    const payload = await encrypt("<p>kept</p>", "pw", 1000)
    const other = await encrypt("<p>other</p>", "pw", 1000)
    const key = (await payloadKey(payload, await passwordKey("pw"), 1000))!
    expect(Buffer.from(key, "base64")).toHaveLength(32)
    expect(await decryptWith(payload, key)).toBe("<p>kept</p>")
    // Every payload has its own salt, so its own key.
    expect(saltOf(other)).not.toBe(saltOf(payload))
    expect(await decryptWith(other, key)).toBeNull()
    expect(await payloadKey("not base64!", await passwordKey("pw"), 1000)).toBeNull()
  })
})
