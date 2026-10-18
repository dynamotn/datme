import fs from "node:fs"
import path from "node:path"

function findRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir
  }
}

/** Root of the datme package, found from this file, never from the cwd. */
export const PACKAGE_ROOT = findRoot(import.meta.dirname)
