/**
 * Scheme a page opens in: the reader's stored choice, else the page's own default
 * (a style that starts dark), else the scheme set in datme.yaml, else the system's.
 * The inline script of Base.astro cannot import this, so it repeats the same order.
 */
export function initialTheme(
  stored: string | null,
  schemeDefault: string | undefined,
  siteScheme: string | undefined,
  prefersDark: boolean,
): "light" | "dark" {
  for (const v of [stored, schemeDefault, siteScheme]) if (v === "light" || v === "dark") return v
  return prefersDark ? "dark" : "light"
}
