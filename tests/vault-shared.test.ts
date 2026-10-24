import { afterEach, describe, expect, test } from "bun:test"
import { site } from "../src/site.config"
import { getVault, type Vault } from "../src/lib/vault"

// Where every copy of the vault module in a process finds the index of a build.
const SHARED = Symbol.for("datme.vault")
const g = globalThis as { __vaultVersion?: number; [SHARED]?: { key: string; vault: Vault } }
const versionBefore = g.__vaultVersion

afterEach(() => {
  if (versionBefore === undefined) delete g.__vaultVersion
  else g.__vaultVersion = versionBefore
})

describe("the vault index of a build", () => {
  test("is left where another copy of the module, such as the bundle Astro renders the pages with, takes it", () => {
    g.__vaultVersion = 9_200_001
    const checked = getVault()
    expect(g[SHARED]).toEqual({ key: JSON.stringify([9_200_001, site]), vault: checked })
  })

  test("is taken from another copy that built it for the same version and config", () => {
    g.__vaultVersion = 9_200_002
    const built = { version: 9_200_002 } as Vault
    g[SHARED] = { key: JSON.stringify([9_200_002, site]), vault: built }
    expect(getVault()).toBe(built)
  })

  test("is built again when the other copy's config differs", () => {
    g.__vaultVersion = 9_200_003
    const other = { version: 9_200_003 } as Vault
    g[SHARED] = { key: JSON.stringify([9_200_003, { ...site, title: { "en-US": "Another garden" } }]), vault: other }
    const own = getVault()
    expect(own).not.toBe(other)
    expect(own.notes["en-US"].length).toBeGreaterThan(0)
  })
})
