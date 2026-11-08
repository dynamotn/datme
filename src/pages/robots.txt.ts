import { site } from "~/site.config"

/** Allow everything and point at the sitemap when the site URL is known; disallow everything with `--noindex`. */
const lines = () => (site.noindex ? ["Disallow: /"] : ["Allow: /", ...(site.url ? ["", `Sitemap: ${site.url}/sitemap-index.xml`] : [])])

export const GET = () =>
  new Response(["User-agent: *", ...lines()].join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
