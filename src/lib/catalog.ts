/** The class a note at the root of the vault is filed under, as general works open a library's catalogue. */
export const ROOT_CLASS = "00.GEN"

/** The letters a folder is filed by: the first three of its name, without accents, in capitals. */
function letters(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "D")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 3)
    .toUpperCase()
}

/**
 * A library call number for a folder: its top folder's class, the number it
 * starts with (as in `03 Atoms`) or else its place among `tops`, two digits
 * at least, then a dot and three letters of its name; a subfolder adds its
 * own name after a middle dot. `03 Atoms/Code` is `03.ATO · Code`.
 */
export function callNumber(dir: string, tops: readonly string[]): string {
  if (!dir) return ROOT_CLASS
  const parts = dir.split("/")
  const top = parts[0]
  const own = top.match(/^(\d+)[\s._-]*(.*)$/)
  const number = own ? own[1] : String(Math.max(tops.indexOf(top), 0) + 1)
  const code = letters(own ? own[2] : top)
  const cls = number.padStart(2, "0") + (code ? "." + code : "")
  return parts.length > 1 ? `${cls} · ${parts.at(-1)}` : cls
}
