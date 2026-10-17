import { describe, expect, test } from "bun:test"
import { contentSecurityPolicy } from "../src/lib/headers"
import { resolveConfig } from "../src/site.config"

const csp = (config: Record<string, unknown>) => contentSecurityPolicy(resolveConfig({ headers: { csp: true }, ...config }, "/v"), [])
const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(name + " "))

describe("CSP per analytics provider", () => {
  test("Google loads its tag manager and reports to Google Analytics", () => {
    const p = csp({ analytics: { provider: "google", id: "G-1" } })
    expect(directive(p, "script-src")).toBe("script-src 'self' https://platform.twitter.com https://www.googletagmanager.com")
    expect(directive(p, "connect-src")).toBe("connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com")
  })

  test("Plausible on its own host", () => {
    const p = csp({ analytics: { provider: "plausible", host: "stats.example" } })
    expect(directive(p, "script-src")).toContain("https://stats.example")
    expect(directive(p, "connect-src")).toBe("connect-src 'self' https://stats.example")
  })

  test("Umami at the origin of its host, and nothing for a host that is not a URL", () => {
    const p = csp({ analytics: { provider: "umami", id: "u", host: "https://umami.example/sub/path" } })
    expect(directive(p, "script-src")).toContain("https://umami.example")
    expect(directive(p, "connect-src")).toBe("connect-src 'self' https://umami.example")
    const bad = csp({ analytics: { provider: "umami", id: "u", host: "umami.example" } })
    expect(directive(bad, "script-src")).toBe("script-src 'self' https://platform.twitter.com")
    expect(directive(bad, "connect-src")).toBe("connect-src 'self'")
  })

  test("GoatCounter loads its counter and reports to the site's own code", () => {
    const p = csp({ analytics: { provider: "goatcounter", id: "mygarden" } })
    expect(directive(p, "script-src")).toContain("https://gc.zgo.at")
    expect(directive(p, "connect-src")).toBe("connect-src 'self' https://mygarden.goatcounter.com")
  })
})

describe("CSP for comments and search by meaning", () => {
  test("Commento's origin may run scripts, connect, frame and style", () => {
    const p = csp({ comments: { provider: "commento", host: "https://comments.example/js" } })
    for (const d of ["script-src", "connect-src", "frame-src", "style-src"]) expect(directive(p, d)).toEndWith(" https://comments.example")
    // The default host of Commento.
    expect(directive(csp({ comments: { provider: "commento" } }), "connect-src")).toBe("connect-src 'self' https://cdn.commento.io")
  })

  test("a Commento host that is not a URL adds nothing", () => {
    const p = csp({ comments: { provider: "commento", host: "comments" } })
    expect(directive(p, "connect-src")).toBe("connect-src 'self'")
    expect(p).not.toContain("comments ")
  })

  test("search by meaning loads transformers.js and its model, and runs WebAssembly in a worker", () => {
    const p = csp({ related: { semantic: true }, search: { meaning: true } })
    expect(directive(p, "script-src")).toBe("script-src 'self' https://platform.twitter.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'")
    expect(directive(p, "connect-src")).toBe("connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co")
    expect(directive(p, "worker-src")).toBe("worker-src 'self' blob:")
    expect(directive(csp({}), "worker-src")).toBe("worker-src 'self'")
  })
})
