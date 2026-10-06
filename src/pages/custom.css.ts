import fs from "node:fs"
import { customCssFile } from "~/lib/theme"

/** The vault's own stylesheet (datme.yaml theme.css), empty when there is none. */
export const GET = () => {
  const file = customCssFile()
  return new Response(file ? fs.readFileSync(file, "utf8") : "", { headers: { "content-type": "text/css; charset=utf-8" } })
}
