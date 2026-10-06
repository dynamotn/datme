import { site } from "~/site.config"

/** Allow everything; point at the sitemap when the site URL is known. */
export const GET = () =>
  new Response(
    ["User-agent: *", "Allow: /", ...(site.url ? ["", `Sitemap: ${site.url}/sitemap-index.xml`] : [])].join("\n") + "\n",
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  )
