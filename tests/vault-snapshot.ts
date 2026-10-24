/**
 * A vault index as plain data, for comparing two of them: maps and sets become
 * lists in their own order, dates ISO strings, and functions are left out.
 * The version is left out too: an index built incrementally and one built
 * afresh are the same index whatever build number they carry.
 */
import { buildVault, type IndexCache, type Vault } from "../src/lib/vault"

export function snapshot(vault: Vault): string {
  const { version: _, ...rest } = vault
  return JSON.stringify(rest, function (key, value) {
    // `this[key]` is the value before toJSON, so a Date is still a Date here.
    const raw = (this as Record<string, unknown>)[key]
    if (raw instanceof Date) return `Date(${raw.toISOString()})`
    if (value instanceof Map) return { map: [...value] }
    if (value instanceof Set) return { set: [...value] }
    if (typeof value === "function") return undefined
    return value
  })
}

/**
 * Builds the vault with `cache`, as `datme dev` does after an edit, and afresh;
 * returns both snapshots, which must be the same.
 */
export function incrementalAndFresh(cache: IndexCache, version: number): { incremental: string; fresh: string; vault: Vault } {
  const vault = buildVault(version, cache)
  return { incremental: snapshot(vault), fresh: snapshot(buildVault(version)), vault }
}
