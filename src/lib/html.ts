/**
 * Escaping of text written into HTML, SVG or XML. Each function replaces a
 * fixed set of characters with entities; use the one for where the text goes.
 * No imports, so browser scripts use it too.
 */

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

const escaper = (chars: RegExp) => (s: string) => s.replace(chars, (c) => ENTITIES[c])

/** Text between tags: & < >. */
export const escapeText = escaper(/[&<>]/g)

/** A double-quoted attribute value, safe as text too: & < > ". */
export const escapeAttr = escaper(/[&<>"]/g)

/** A double-quoted attribute value or text, leaving > as it is: & < ". */
export const escapeAttrKeepGt = escaper(/[&<"]/g)

/** Text in XML or SVG, only the two characters it requires: & <. */
export const escapeXml = escaper(/[&<]/g)

/** Text, or an attribute value in either kind of quotes: & < > " '. */
export const escapeHtml = escaper(/[&<>"']/g)

/** A double-quoted attribute value, only what ends or garbles it: & ". */
export const escapeAttrMinimal = escaper(/[&"]/g)
