import { afterAll, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fsAllow } from "../src/lib/fs-allow"

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-allow-")))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

test("the dev server may serve the work folder and the real package and packages it links to, nothing above", () => {
  const pkg = path.join(tmp, "pkg")
  const work = path.join(tmp, "work")
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true })
  fs.mkdirSync(path.join(tmp, "modules"))
  fs.mkdirSync(work)
  fs.symlinkSync(path.join(pkg, "src"), path.join(work, "src"))
  fs.symlinkSync(path.join(tmp, "modules"), path.join(work, "node_modules"))
  expect(fsAllow(work)).toEqual([work, pkg, path.join(tmp, "modules")])
})
