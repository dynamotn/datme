import fs from "node:fs"
import path from "node:path"
import { site } from "../site.config"

/** The custom stylesheet of the vault, when there is one. */
export function customCssFile(): string | undefined {
  const file = path.join(site.vault, site.theme.css)
  return site.theme.css && fs.existsSync(file) && fs.statSync(file).isFile() ? file : undefined
}

/** Google Fonts stylesheet for the configured families, if any. */
export function fontsHref(): string | undefined {
  const families = [...new Set(Object.values(site.theme.fonts).filter((f): f is string => !!f))]
  if (!families.length) return undefined
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700;800`).join("&")
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

/** CSS variables overriding both looks; values were validated by the config schema. */
export function themeCss(): string {
  const { accent, fonts } = site.theme
  const light: string[] = []
  const dark: string[] = []
  if (accent) {
    const l = typeof accent === "string" ? accent : accent.light
    const d = typeof accent === "string" ? accent : accent.dark
    light.push(`--accent:${l}`, `--accent-2:${l}`, `--accent-soft:color-mix(in srgb, ${l} 12%, transparent)`)
    dark.push(`--accent:${d}`, `--accent-2:${d}`, `--accent-soft:color-mix(in srgb, ${d} 16%, transparent)`)
  }
  const font = (name: string, fallback: string) => `"${name}", ${fallback}`
  if (fonts.heading) light.push(`--font-ui:${font(fonts.heading, "system-ui, sans-serif")}`)
  if (fonts.body) light.push(`--font-read:${font(fonts.body, "Georgia, serif")}`)
  if (fonts.code) {
    light.push(`--font-code:${font(fonts.code, "ui-monospace, monospace")}`)
    light.push(`--font-mono:${font(fonts.code, "ui-monospace, monospace")}`)
  }
  if (!light.length) return ""
  // Doubled attribute selectors outrank both looks' own variables.
  const scope = ":root:root, :root[data-look][data-look]"
  return `${scope}{${light.join(";")}}` + (dark.length ? `:root[data-theme="dark"][data-theme="dark"]{${dark.join(";")}}` : "")
}
