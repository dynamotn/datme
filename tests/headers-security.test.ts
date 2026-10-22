import { describe, expect, test } from "bun:test"
import { contentSecurityPolicy, headersFile } from "../src/lib/headers"
import { resolveConfig } from "../src/site.config"

const headers = (config: Record<string, unknown>) => headersFile(resolveConfig(config, "/v"))
/** The headers of one rule of a _headers file. */
const rule = (file: string, path: string) => file.split(/\n(?=\S)/).find((block) => block.startsWith(path + "\n")) ?? ""

describe("_headers hardening", () => {
  test("HTTPS sites ask browsers to keep to HTTPS", () => {
    expect(rule(headers({ site: { url: "https://garden.example" } }), "/*")).toContain("  Strict-Transport-Security: max-age=31536000\n")
    expect(headers({ site: { url: "http://garden.example" } })).not.toContain("Strict-Transport-Security")
    expect(headers({})).not.toContain("Strict-Transport-Security")
  })

  test("the CSP lets Giscus load its stylesheet", () => {
    const site = resolveConfig({ headers: { csp: true }, comments: { provider: "giscus", repo: "a/b", repoId: "R", category: "C", categoryId: "D" } }, "/v")
    const style = contentSecurityPolicy(site, [])
      .split("; ")
      .find((d) => d.startsWith("style-src "))
    expect(style).toContain("https://giscus.app")
  })

  test("vault files that a browser could run as a page open inert, sandboxed", () => {
    const file = headers({})
    for (const ext of ["svg", "html", "htm", "xml", "xhtml"]) {
      expect(rule(file, `/assets/*.${ext}`)).toContain("  Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox\n")
    }
    // PDFs, pictures and media keep loading in the pages that embed them.
    expect(file).not.toContain("/assets/*\n")
  })
})
