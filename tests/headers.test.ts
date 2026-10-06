import { describe, expect, test } from "bun:test"
import crypto from "node:crypto"
import { contentSecurityPolicy, headersFile, inlineScriptHashes } from "../src/lib/headers"
import { resolveConfig } from "../src/site.config"

const sha = (s: string) => `'sha256-${crypto.createHash("sha256").update(s).digest("base64")}'`

describe("inline script hashes", () => {
  test("only scripts that run inline, each once", () => {
    const page = `<script>a()</script><script type="module">b()</script><script src="/x.js"></script>
<script type="application/ld+json">{"a":1}</script><script>a()</script><script>  </script>`
    expect(inlineScriptHashes([page, page])).toEqual([sha("a()"), sha("b()")].sort())
  })
})

describe("CSP", () => {
  test("lets in what the configured features load, and the inline scripts by hash", () => {
    const site = resolveConfig(
      {
        site: { url: "https://notes.example" },
        analytics: { provider: "plausible" },
        comments: { provider: "giscus", repo: "a/b", repoId: "R", category: "C", categoryId: "D" },
        webmentions: {},
        headers: { csp: true },
      },
      "/v",
    )
    const csp = contentSecurityPolicy(site, ["'sha256-abc'"])
    expect(csp).toContain("script-src 'self' 'sha256-abc' https://platform.twitter.com https://plausible.io https://giscus.app")
    expect(csp).toContain("connect-src 'self' https://plausible.io https://webmention.io")
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://platform.twitter.com https://syndication.twitter.com https://giscus.app")
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'")
    expect(headersFile(site, ["'sha256-abc'"])).toContain(`  Content-Security-Policy: ${csp}\n`)
  })

  test("off by default, and the whole file can be turned off", () => {
    expect(resolveConfig({}, "/v").headers).toEqual({ csp: false })
    expect(resolveConfig({ headers: false }, "/v").headers).toBe(false)
    expect(headersFile(resolveConfig({}, "/v"))).not.toContain("Content-Security-Policy")
  })
})
