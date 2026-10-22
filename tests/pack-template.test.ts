import { afterEach, describe, expect, test } from "bun:test"
import { compileTemplate, renderTemplate, safeStyle, safeUrl, SLOT_FIELDS, type Fields, type Slot } from "../src/lib/pack-template"
import { drawSlot, noteFields } from "../src/lib/pack-slots"
import { readerLooks } from "../src/lib/look-switch"
import { site, type SiteConfig } from "../src/site.config"
import type { Note } from "../src/lib/vault"

/** A template compiled for a slot and drawn with some fields, with what was left out. */
function draw(source: string, fields: Fields = {}, slot: Slot = "note-card") {
  const { nodes, warnings } = compileTemplate(source, slot)
  return { html: renderTemplate(nodes, fields), warnings }
}

const XSS = `"><script>alert(1)</script><img src=x onerror=alert(1)>`

describe("placeholders and blocks", () => {
  test("fields are filled in text and attributes, a flag or nothing prints as nothing", () => {
    const { html, warnings } = draw(`<a class="card {{ stage }}" href="{{url}}">{{title}}</a> <small>{{locked}}{{date}}</small> {{year}}`, { title: "Hi", url: "/Hi", stage: "seed", locked: true, year: 2026 }, "footer-band")
    expect(warnings).toEqual(["stage", "url", "title", "locked", "date"].map((f) => `{{${f}}} is not a field of footer-band (siteTitle, home, lang, author, year, rss), so it is left out`))
    expect(html).toBe('<a class="card "></a> <small></small> 2026')
    expect(draw(`<a class="card {{ stage }}" href="{{url}}">{{title}}</a> <small>{{locked}}</small>`, { title: "Hi", url: "/Hi", stage: "seed", locked: true }).html).toBe('<a class="card seed" href="/Hi">Hi</a> <small></small>')
  })
  test("#if, #unless and #each, whose items see their own fields and the slot's", () => {
    const src = `{{#if cover}}<img src="{{cover}}" alt="">{{/if}}{{#unless excerpt}}<p>none</p>{{/unless}}<ul>{{#each tags}}<li><a href="{{url}}" title="{{title}}">{{name}}</a></li>{{/each}}</ul>{{#if tags}}T{{/if}}`
    const fields = { cover: "/c.png", excerpt: "", title: "Note", tags: [{ name: "a", url: "/tags/a" }, { name: "b", url: "/tags/b" }] }
    expect(draw(src, fields)).toEqual({
      html: '<img src="/c.png" alt=""><p>none</p><ul><li><a href="/tags/a" title="Note">a</a></li><li><a href="/tags/b" title="Note">b</a></li></ul>T',
      warnings: [],
    })
    expect(draw(src, { excerpt: "x", tags: [] }).html).toBe("<ul></ul>")
    // A list is walked only by #each; a missing one walks nothing.
    expect(draw(`{{#each tags}}x{{/each}}`, { tags: "a" as unknown as Fields[string] }).html).toBe("")
  })
  test("what datme cannot read is a warning and draws nothing", () => {
    const { html, warnings } = draw(
      `{{#each title}}a{{/each}}{{tags}}{{> partial}}{{name}}<p title="{{#if title}}x{{/if}}">q</p><div {{title}}>w</div>{{/if}}{{#if nope}}<b>hidden</b>{{/if}}{{#unless nope}}also hidden{{/unless}}{{#if title}}<p>{{/if}}</p>`,
      { title: "T", name: "N" },
    )
    // Block markers in an attribute go, the text between them stays; a block left open ends with its siblings.
    expect(html).toBe('<p title="x">q</p><div>w</div><p></p>')
    expect(warnings).toEqual([
      // Placeholders are read before they are checked.
      "{{> partial}} is not a placeholder datme knows, so it is left out",
      "{{#each title}} needs a list, and title is not one, so it is left out",
      "{{tags}} is a list: walk it with {{#each tags}}, so it is left out",
      expect.stringContaining("{{name}} is not a field of note-card"),
      "<p>: an attribute takes fields only, not blocks, so a block in title is left out",
      "<div>: the attribute {{title}} is not one a template can set, so it is left out",
      "{{/if}} closes no {{#if}} among its siblings, so it is left out",
      expect.stringContaining("{{nope}} is not a field of note-card"),
      "{{#if title}} is not closed among its siblings, so it ends with them",
    ])
  })
  test("every slot has the fields of the site", () => {
    for (const fields of Object.values(SLOT_FIELDS)) expect(fields.slice(0, 3)).toEqual(["siteTitle", "home", "lang"])
    expect(draw(`{{logo}}`, { logo: "🌱" }, "header-brand").html).toBe("🌱")
  })
})

describe("values are escaped wherever they land", () => {
  test("in text, in attributes and in a list", () => {
    const { html } = draw(`<p title="{{title}}" class="{{stage}}">{{title}}</p>{{#each tags}}<i>{{name}}</i>{{/each}}`, {
      title: XSS,
      stage: `" onmouseover="alert(1)`,
      tags: [{ name: "<svg onload=alert(1)>", url: "" }],
    })
    expect(html).toBe(
      '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;" class="&quot; onmouseover=&quot;alert(1)">' +
        '"&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p><i>&lt;svg onload=alert(1)&gt;</i>',
    )
    expect(html).not.toMatch(/<script|<img|<svg| onmouseover="/i)
    // Text outside attributes keeps its quotes, which cannot end anything there.
    expect(draw(`{{title}}`, { title: `'"&` }).html).toBe(`'"&amp;`)
    expect(draw(`<p title="{{title}}"></p>`, { title: `'"&` }).html).toBe(`<p title="&#39;&quot;&amp;"></p>`)
  })
  test("a placeholder cannot open a tag or a block, nor be one twice", () => {
    expect(draw(`{{title}}`, { title: "{{excerpt}}", excerpt: "secret" }).html).toBe("{{excerpt}}")
    expect(draw(`{{{title}}}`, { title: "<b>" }).html).toBe("{&lt;b&gt;}")
    expect(draw(`&lt;b&gt;{{title}}`, { title: "x" }).html).toBe("&lt;b&gt;x")
  })
  test("an address a field fills must still be http(s), mailto or relative", () => {
    const link = (url: string) => draw(`<a href="{{url}}">x</a><img src="/img/{{cover}}" alt="">`, { url, cover: url }).html
    expect(link("javascript:alert(1)")).toBe('<a>x</a><img src="/img/javascript:alert(1)" alt="">')
    for (const bad of ["JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "\u0000javascript:x", "data:text/html,<script>", "vbscript:x"]) {
      expect(link(bad)).toStartWith("<a>x</a>")
    }
    expect(link("https://example.com/?a=1&b=2")).toStartWith('<a href="https://example.com/?a=1&amp;b=2">')
    expect(link("javascript&colon;alert(1)")).toStartWith('<a href="javascript&amp;colon;alert(1)">')
    expect(draw(`<a href="java{{title}}">x</a>`, { title: "script:alert(1)" }).html).toBe("<a>x</a>")
  })
  test("safeUrl and safeStyle", () => {
    for (const ok of ["/a", "a/b:c", "#top", "?q", "//cdn.example/x", "http://x", "HTTPS://x", "mailto:me@x", ""]) expect(safeUrl(ok)).toBe(true)
    for (const bad of ["javascript:x", "JAVASCRIPT:x", "\njavascript:x", "data:x", "file:///etc/passwd", "blob:x"]) expect(safeUrl(bad)).toBe(false)
    expect(safeStyle("color: red; margin: calc(1rem + 2px)")).toBe(true)
    for (const bad of ["background:url(x)", "background: URL (x)", "width: expression(alert(1))", "background:u\\72l(x)", "behavior:url(x.htc)", "-moz-binding:x", "background:image-set(x 1x)", "x:'a'", 'x:"a"', "ur/**/l(x)", "x</style>", "@import x"]) {
      expect(safeStyle(bad)).toBe(false)
    }
  })
})

describe("a template is sanitised when it is loaded", () => {
  test("scripts, frames, plugins, forms, styles and head tags go, whatever their case", () => {
    const { html, warnings } = draw(
      `<ScRiPt>alert(1)</sCrIpT><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="x"></object><embed src="x"><form action="//evil"><input name="password"></form><style>*{display:none}</style><base href="//evil/"><meta http-equiv="refresh" content="0;url=//evil"><link rel="stylesheet" href="//evil"><template><script>1</script></template><noscript><img src=x onerror=alert(1)></noscript><p>kept</p>`,
    )
    expect(html).toBe("<p>kept</p>")
    expect(warnings.map((w) => w.split(" ")[0])).toEqual(["<script>", "<iframe>", "<object>", "<embed>", "<form>", "<style>", "<base>", "<meta>", "<link>", "<template>", "<noscript>"])
  })
  test("SVG and MathML, which can carry scripts, go with what they hold", () => {
    expect(draw(`<svg onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><text>x</text></a></svg><math><mi xlink:href="javascript:alert(1)">x</mi></math>`).html).toBe("")
  })
  test("event handlers, srcdoc, ids, data attributes and unsafe styles go; allowed attributes stay", () => {
    const { html, warnings } = draw(
      `<img src="x" onerror="alert(1)" ONLOAD="alert(1)" alt="a" width="10" loading="lazy"><div id="location" data-nav-toggle style="background:url(//evil)" class="a b" aria-label="L" role="note" hidden>d</div><p style="color: red" title="t">p</p><a href="/x" target="_blank" rel="noopener" ping="//evil">a</a><details open><summary>s</summary></details>`,
    )
    expect(html).toBe('<img src="x" alt="a" width="10" loading="lazy"><div class="a b" aria-label="L" role="note" hidden="">d</div><p style="color: red" title="t">p</p><a href="/x" rel="noopener">a</a><details open=""><summary>s</summary></details>')
    expect(warnings).toEqual([
      "<img>: the attribute onerror is not one a template can set, so it is left out",
      "<img>: the attribute onload is not one a template can set, so it is left out",
      "<div>: the attribute id is not one a template can set, so it is left out",
      "<div>: the attribute data-nav-toggle is not one a template can set, so it is left out",
      "<div>: a style that loads files, runs code, hides with escapes or takes a placeholder is left out",
      "<a>: the attribute target is not one a template can set, so it is left out",
      "<a>: the attribute ping is not one a template can set, so it is left out",
    ])
    expect(draw(`<p style="color: {{stage}}">x</p>`, { stage: "red" }).html).toBe("<p>x</p>")
  })
  test("written addresses are checked once, entities and blanks decoded as a browser would", () => {
    const { html, warnings } = draw(
      `<a href="javascript:alert(1)">1</a><a href="  JaVa&#x09;ScRiPt&colon;alert(1)">2</a><a href="&#106;avascript:alert(1)">3</a><img src="data:image/svg+xml,<svg onload=alert(1)>" alt=""><blockquote cite="vbscript:x">4</blockquote><a href="https://ok.example">5</a>`,
    )
    expect(html).toBe('<a>1</a><a>2</a><a>3</a><img alt=""><blockquote>4</blockquote><a href="https://ok.example">5</a>')
    expect(warnings).toEqual([
      "<a>: href must be an http(s), mailto or relative address, so it is left out",
      "<img>: src must be an http(s), mailto or relative address, so it is left out",
      "<blockquote>: cite must be an http(s), mailto or relative address, so it is left out",
    ])
  })
  test("comments, CDATA and broken markup cannot smuggle a tag or a placeholder", () => {
    const { html, warnings } = draw(`<!-- {{excerpt}} --><!--><script>alert(1)</script>--><![CDATA[<script>alert(1)</script>]]><p>a<b>b</p>c<img src=x/onerror=alert(1)><`, { excerpt: "secret" })
    expect(html).not.toMatch(/<script|secret| onerror=/i)
    expect(html).toBe("--&gt;alert(1)]]&gt;<p>a<b>b</b></p><b>c<img src=\"x/onerror=alert(1)\">&lt;</b>")
    expect(warnings).toEqual(["<script> is not an element a template can hold, so it is left out with what it holds"])
    // Doctypes and stray end tags are dropped too.
    expect(draw(`<!doctype html></div><p>x</p>`).html).toBe("<p>x</p>")
  })
  test("a slot drawn in a link cannot hold another", () => {
    const { html, warnings } = draw(`<a href="/x">{{siteTitle}}</a><details><summary>m</summary></details><b>{{siteTitle}}</b>`, { siteTitle: "Site" }, "header-brand")
    expect(html).toBe("<b>Site</b>")
    expect(warnings).toEqual([
      "<a> cannot sit in header-brand, which is drawn inside a link, so it is left out with what it holds",
      "<details> cannot sit in header-brand, which is drawn inside a link, so it is left out with what it holds",
    ])
  })
  test("void elements take no children, and tables keep their parts", () => {
    expect(draw(`<br>x<hr><table><tr><td colspan="2">{{title}}</td></tr></table>`, { title: "t" }).html).toBe('<br>x<hr><table><tbody><tr><td colspan="2">t</td></tr></tbody></table>')
  })
})

/** Change some settings for the length of a test; restored after each one. */
const saved: Partial<SiteConfig>[] = []
function setSite(patch: Partial<SiteConfig>): void {
  saved.push(Object.fromEntries(Object.keys(patch).map((k) => [k, site[k as keyof SiteConfig]])) as Partial<SiteConfig>)
  Object.assign(site, patch)
}
afterEach(() => {
  while (saved.length) Object.assign(site, saved.pop())
})

describe("slots on the site", () => {
  const card = compileTemplate(`<h3><a href="{{url}}">{{title}}</a></h3><p>{{excerpt}}</p><small>{{siteTitle}} {{home}} {{lang}}</small>`, "note-card").nodes
  const own = compileTemplate(`<p class="own">{{title}}</p>`, "note-card").nodes
  const pack = { dir: "/p", css: [], fonts: [], file: "theme.yaml", accent: false, templates: { "note-card": card }, styles: { ink: { base: "classic", css: [], templates: { "note-card": own } }, plain: { base: "classic", css: [] } } }

  test("nothing without a pack or a template for the slot", () => {
    expect(drawSlot("note-card", "classic", "en-US")).toBeUndefined()
    setSite({ pack })
    expect(drawSlot("footer-band", "classic", "en-US")).toBeUndefined()
  })
  test("the pack's template on every page, a style's own on its pages", () => {
    setSite({ pack })
    expect(drawSlot("note-card", "classic", "en-US", { title: "A", url: "/en-US/A", excerpt: "e" })).toBe('<h3><a href="/en-US/A">A</a></h3><p>e</p><small>Test garden /en-US en-US</small>')
    expect(drawSlot("note-card", "plain", "vi-VN", { title: "A" })).toStartWith('<h3><a>A</a></h3><p></p><small>Khu vườn thử nghiệm / vi-VN</small>')
    expect(drawSlot("note-card", "ink", "en-US", { title: "A" })).toBe('<p class="own">A</p>')
  })
  test("a style with templates of its own keeps the page out of the reader switch", () => {
    setSite({ pack })
    const sheets = (st: string) => [st]
    expect(readerLooks("ink", sheets, ["classic"])).toBeUndefined()
    expect(readerLooks("plain", sheets, ["classic"])).toEqual({ plain: ["plain"], classic: ["classic"] })
  })

  const note = (patch: Partial<Note> = {}) =>
    ({ url: "/en-US/Notes/A", lang: "en-US", protected: false, stage: "03_Atomic", types: ["book"], banner: "/b.png", ...patch }) as Note
  test("a note's fields: what its card shows", () => {
    const f = noteFields(note(), { title: "A", date: new Date("2026-02-04"), excerpt: "About A", cover: "/b.png", words: 900, tags: ["poem", "type/book"], featured: true })
    expect(f).toEqual({
      title: "A",
      url: "/en-US/Notes/A",
      excerpt: "About A",
      date: "Feb 4, 2026",
      datetime: "2026-02-04T00:00:00.000Z",
      cover: "/b.png",
      stage: "Atomic",
      stageIcon: "⚛️",
      type: "book",
      typeIcon: expect.any(String),
      readingTime: expect.stringContaining("4"),
      locked: false,
      featured: true,
      author: "Tester",
      tags: [
        { name: "poem", url: "/en-US/tags/poem" },
        { name: "book", url: "/en-US/tags/type/book" },
      ],
    })
  })
  test("a protected note gives no excerpt, whatever it is handed; a bare one gives empty fields", () => {
    const f = noteFields(note({ protected: true, stage: undefined, types: [] }), { title: "Locked", excerpt: "the secret", words: 0, tags: [] })
    expect(f).toMatchObject({ excerpt: "", locked: true, date: "", datetime: "", cover: "", stage: "", stageIcon: "", type: "", typeIcon: "", featured: false, tags: [] })
    expect(noteFields(note(), { title: "A", words: 1, tags: [] }).excerpt).toBe("")
  })
})
