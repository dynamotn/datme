import { site } from "../site.config"

/** URL of the generated social card for a slug, or undefined when cards are off. */
export function ogPath(slug: string): string | undefined {
  return site.ogImages ? "/og/" + slug.split("/").map(encodeURIComponent).join("/") + ".png" : undefined
}
