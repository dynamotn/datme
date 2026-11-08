import fs from "node:fs"
import path from "node:path"

/**
 * What the dev server may serve from disk (`/@fs/`): the work folder and the
 * real places it links to. Left to Vite, the allow list is the workspace root
 * above the work folder, which in a shared /tmp is anyone's to declare.
 */
export function fsAllow(work: string): string[] {
  const real = (name: string) => fs.realpathSync(path.join(work, name))
  return [work, path.dirname(real("src")), real("node_modules")]
}
