import { expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

// CI runs on Linux, as another user: a path into one machine's home directory
// fails there (EACCES on mkdir /Users) while passing on the machine it came from.
// Made-up vault paths such as "/home/me/Notes", only ever passed as strings, are fine.
const root = path.resolve(import.meta.dir, "..")
const HOME_PATH = /["'`](\/Users\/[^/"'`\s]+\/|[^"'`\s]*\/\.claude\/)/

function* sources(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "fixtures" || e.name === "node_modules") continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* sources(p)
    else if (/\.(ts|mjs|astro)$/.test(e.name)) yield p
  }
}

test("no test or source file depends on one machine's home directory", () => {
  const found: string[] = []
  for (const dir of ["tests", "src", "bin"]) {
    for (const file of sources(path.join(root, dir))) {
      const lines = fs.readFileSync(file, "utf8").split("\n")
      lines.forEach((line, i) => {
        if (HOME_PATH.test(line) && !line.includes("HOME_PATH")) found.push(`${path.relative(root, file)}:${i + 1}`)
      })
    }
  }
  expect(found).toEqual([])
})
