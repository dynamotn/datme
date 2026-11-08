import { site } from "~/site.config"
import { escapeXml } from "~/lib/html"

/**
 * The garden as a search engine for the browser's address bar, found through the
 * link in every page. One description, named by the first language's title: the
 * template opens the site's root, where search covers every language.
 */
export const GET = () => {
  const name = escapeXml(site.title[site.defaultLang])
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${name}</ShortName>
  <Description>${name}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" method="get" template="${escapeXml(site.url ?? "")}/?q={searchTerms}"/>
</OpenSearchDescription>
`,
    { headers: { "content-type": "application/opensearchdescription+xml; charset=utf-8" } },
  )
}
