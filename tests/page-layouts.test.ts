import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"
import {
  changelogHtml,
  checklistHtml,
  citeHtml,
  compareHtml,
  compareOf,
  cvHtml,
  decisionHtml,
  dialogueHtml,
  faqHtml,
  galleryHtml,
  glossaryEntries,
  glossaryHtml,
  highlightsHtml,
  hubHtml,
  hubSvg,
  letterHtml,
  letterOf,
  linksHtml,
  paperHtml,
  parseRating,
  plain,
  poemHtml,
  quotesHtml,
  recipeHtml,
  releasesOf,
  syllabusHtml,
  timelineHtml,
  usesHtml,
  withoutBases,
} from "../src/lib/note-layouts"
import { keepIndent, markProsCons } from "../src/lib/layout-source"

describe("layout transforms", () => {
  test("ratings are read as numbers or stars and capped at the scale", () => {
    expect(parseRating(6, 7)).toBe(6)
    expect(parseRating(6, 5)).toBe(5)
    expect(parseRating("★★★", 7)).toBe(3)
    expect(parseRating("", 7)).toBeUndefined()
    expect(parseRating(0, 7)).toBeUndefined()
  })

  test("a gallery gathers runs of picture-only paragraphs into one grid", () => {
    const html = galleryHtml(
      `<p>Intro</p>\n<p><span class="image-embed"><img src="/a.png" alt="Fog"></span>\n<span class="image-embed"><img src="/b.png" alt=""></span></p>\n<p><img src="/c.png" alt=""></p>\n<p>Outro <img src="/d.png" alt=""></p>`,
    )
    expect(html).toBe(
      `<p>Intro</p>\n<div class="gallery-grid"><figure class="gallery-item"><img src="/a.png" alt="Fog"><figcaption>Fog</figcaption></figure><figure class="gallery-item"><img src="/b.png" alt=""></figure><figure class="gallery-item"><img src="/c.png" alt=""></figure></div><p>Outro <img src="/d.png" alt=""></p>`,
    )
  })

  test("a gallery picture with a known size carries its aspect ratio", () => {
    expect(galleryHtml(`<p><img src="a.jpg" width="300" height="200"></p>`)).toContain(
      `<figure class="gallery-item" style="--ar: 1.5"><img`,
    )
    expect(galleryHtml(`<p><img src="a.jpg" width="1000" height="3000"></p>`)).toContain(`style="--ar: 0.3333"`)
    expect(galleryHtml(`<p><img src="a.jpg"></p>`)).not.toContain("style=")
  })

  test("a résumé puts each H2 section beside its heading, after the summary", () => {
    expect(cvHtml(`<p>Hi</p><h2 id="a">A</h2><p>x</p><h2>B</h2><ul><li>y</li></ul>`)).toBe(
      `<div class="cv-summary"><p>Hi</p></div>` +
        `<section class="cv-section"><h2 id="a">A</h2><div class="cv-body"><p>x</p></div></section>` +
        `<section class="cv-section"><h2>B</h2><div class="cv-body"><ul><li>y</li></ul></div></section>`,
    )
    expect(cvHtml(`<h2>Only</h2><p>x</p>`)).not.toContain("cv-summary")
  })

  test("a timeline puts each H2 on the line, after the introduction", () => {
    expect(timelineHtml(`<p>Hi</p><h2>2015</h2><p>x</p>`)).toBe(
      `<p>Hi</p><ol class="life-timeline"><li class="life-event"><h2>2015</h2><div class="life-body"><p>x</p></div></li></ol>`,
    )
    expect(timelineHtml(`<p>No moments</p>`)).toBe(`<p>No moments</p>`)
  })

  test("only lists of links become buttons", () => {
    const links = `<ul>\n<li><a href="/a">A</a> — note</li>\n<li> <a class="internal" href="/b">B</a></li>\n</ul>`
    expect(linksHtml(links)).toStartWith('<ul class="link-hub">')
    expect(linksHtml(`<ul><li>text</li><li><a href="/a">A</a></li></ul>`)).toStartWith("<ul>")
    expect(linksHtml(`<ul><li><a href="/a">A</a><ul><li>x</li></ul></li></ul>`)).not.toContain("link-hub")
  })

  test("uses: lists of names in bold become cards, other lists stay", () => {
    expect(usesHtml(`<ul><li><strong>Vim</strong> — editor</li></ul>`)).toBe(`<ul class="uses-grid"><li><strong>Vim</strong> — editor</li></ul>`)
    expect(usesHtml(`<ul><li>plain</li></ul>`)).toBe(`<ul><li>plain</li></ul>`)
  })

  test("a FAQ: each H2 opens on its answer, without its anchor", () => {
    expect(faqHtml(`<p>Hi</p><h2 id="q">Q?<a class="heading-anchor" href="#q">#</a></h2><p>A.</p>`)).toBe(
      `<p>Hi</p><details class="faq-item"><summary><h2 id="q">Q?</h2></summary><div class="faq-answer"><p>A.</p></div></details>`,
    )
  })

  test("quotes: a wall of cards, the dashed last line as who said it", () => {
    const html = quotesHtml(
      `<p>Intro</p>\n<blockquote>\n<p>Be kind.</p>\n<p>— Ann</p>\n</blockquote>\n<blockquote>\n<p>Go fast.\n— Bob</p>\n</blockquote>\n<blockquote><p>Anon.</p></blockquote>`,
    )
    expect(html.match(/<div class="quote-wall">/g)).toHaveLength(1)
    expect(html).toContain(`<blockquote><p>Be kind.</p></blockquote><figcaption>Ann</figcaption>`)
    expect(html).toContain(`<blockquote><p>Go fast.</p></blockquote><figcaption>Bob</figcaption>`)
    expect(html).toContain(`<blockquote><p>Anon.</p></blockquote></figure>`)
  })

  test("a recipe: its ingredients beside its steps, each to tick off", () => {
    const html = recipeHtml(`<p>Intro</p><h2>Ingredients</h2><ul><li>Salt</li></ul><h2>Steps</h2><ol><li>Cook</li></ol>`)
    expect(html).toBe(
      `<p>Intro</p><div class="recipe"><aside class="recipe-ingredients"><h2>Ingredients</h2><ul><li><label class="recipe-tick"><input type="checkbox"> Salt</label></li></ul></aside><div class="recipe-steps"><h2>Steps</h2><ol><li>Cook</li></ol></div></div>`,
    )
    expect(recipeHtml(`<h2>Steps</h2><p>x</p>`)).toBe(`<h2>Steps</h2><p>x</p>`)
  })

  test("a collection leaves out the bases it shows, nested divs and all", () => {
    expect(withoutBases(`<p>a</p><div class="base-embed"><div class="card-wall"><div>x</div></div></div><p>b</p>`)).toBe(`<p>a</p><p>b</p>`)
  })

  test("a paper: the text before the first heading is its abstract, unless a section is named so", () => {
    expect(paperHtml(`<p>We found.</p><h2>Method</h2><p>x</p>`, "Abstract", "<cite-box>")).toBe(
      `<cite-box><section class="paper-abstract"><h2 class="paper-abstract-title">Abstract</h2><p>We found.</p></section><div class="paper-body"><h2>Method</h2><p>x</p></div>`,
    )
    expect(paperHtml(`<p>Lead.</p><h3>Aside</h3><p>y</p>`, "Abstract")).toBe(
      `<section class="paper-abstract"><h2 class="paper-abstract-title">Abstract</h2><p>Lead.</p></section><div class="paper-body"><h3>Aside</h3><p>y</p></div>`,
    )
    expect(paperHtml(`<h2>Method</h2>`, "Abstract")).toBe(`<div class="paper-body"><h2>Method</h2></div>`)
    expect(paperHtml(`<h2 id="tóm-tắt">Tóm tắt<a class="heading-anchor" href="#t">#</a></h2><p>a</p><h2>B</h2>`, "x")).toStartWith(
      `<section class="paper-abstract"><h2 id="tóm-tắt">`,
    )
  })

  test("the cite box gives the reference and its BibTeX, escaped", () => {
    const html = citeHtml({ key: "k", type: "misc", fields: { author: "Ada Lovelace", title: "Notes & <tags>", journal: "J", year: "1843", pages: "1--2" } }, "Cite this")
    expect(html).toContain("<summary>Cite this</summary>")
    expect(html).toContain("Lovelace, A. (1843).")
    expect(html).toContain("<em>J</em>, 1–2.")
    expect(html).toContain("title   = {Notes \\&amp; &lt;tags&gt;}")
    expect(html).toContain("pages   = {1--2}")
  })

  test("a decision record: each known section gets a look of its own", () => {
    const html = decisionHtml(`<p>Intro</p><h2>Context</h2><p>a</p><h2>Decision outcome</h2><p>b</p><h2>Hệ quả</h2><p>c</p><h2>Status</h2><p>d</p><h2>Phương án</h2>`)
    expect(html).toBe(
      `<p>Intro</p><section class="adr-section adr-context"><h2>Context</h2><p>a</p></section>` +
        `<section class="adr-section adr-decision"><h2>Decision outcome</h2><p>b</p></section>` +
        `<section class="adr-section adr-consequences"><h2>Hệ quả</h2><p>c</p></section><h2>Status</h2><p>d</p>` +
        `<section class="adr-section adr-options"><h2>Phương án</h2></section>`,
    )
  })

  test("a changelog: versions with their dates and anchors, kinds of change as tags", () => {
    const html = `<p>Hi</p><h2 id="unreleased">[Unreleased]</h2><h3 id="added">Added</h3><ul><li>x</li></ul>` +
      `<h2 id="v">[<a href="https://x/compare">1.2.0</a>] - 2026-10-01<a class="heading-anchor" href="#120---2026-10-01">#</a></h2><h3>Fixed</h3><h3>Thanks</h3>` +
      `<h2>v1.1.0 (2026-09-01)</h2><h3>Bảo mật</h3><h2>1.0.0 — 2026-13-45</h2>`
    const { releases } = releasesOf(html)
    expect(releases.map((r) => [r.version, r.date, r.id])).toEqual([
      ["Unreleased", undefined, undefined],
      ["1.2.0", "2026-10-01", "v1.2.0"],
      ["v1.1.0", "2026-09-01", "v1.1.0"],
      ["1.0.0", undefined, "v1.0.0"],
    ])
    const out = changelogHtml(html, "en-US", "<feed>")
    expect(out).toStartWith(`<p>Hi</p><feed><section class="release"><h2 id="unreleased">Unreleased</h2><h3 id="added" class="change-tag change-added">Added</h3>`)
    expect(out).toContain(
      `<section class="release" id="v1.2.0"><h2 id="v"><a href="https://x/compare">1.2.0</a><a class="heading-anchor" href="#120---2026-10-01">#</a></h2><p class="release-date"><time datetime="2026-10-01">Oct 1, 2026</time></p><h3 class="change-tag change-fixed">Fixed</h3><h3>Thanks</h3>`,
    )
    expect(out).toContain(`<h3 class="change-tag change-security">Bảo mật</h3>`)
    expect(out).toContain(`<section class="release" id="v1.0.0"><h2>1.0.0</h2></section>`)
    expect(changelogHtml("<p>No versions.</p>", "en-US")).toBe("<p>No versions.</p>")
  })

  test("a dialogue: bold names always, plain ones when they recur or are speakers", () => {
    const html = dialogueHtml(
      `<p>Intro</p>\n<p><strong>Ada:</strong> One.</p>\n<p><strong>Ada</strong>: Two.</p>\n<p>Bob: Three.</p>\n<p>Note: four.</p>\n<p>Bob: Five.</p>\n<p>Cy: Six.</p><p><strong>Bold</strong> text.</p>`,
      { Cy: "/cy.png", Ada: undefined },
    )
    expect(html.match(/<div class="dialogue">/g)).toHaveLength(2)
    expect(html).toContain(`<div class="dialogue-line voice-0"><p class="dialogue-who"><span>Ada</span></p><div class="dialogue-bubble"><p>One.</p></div></div>`)
    expect(html).toContain(`<div class="dialogue-line voice-0 is-more"><p class="dialogue-who"><span>Ada</span></p><div class="dialogue-bubble"><p>Two.</p></div></div>`)
    expect(html).toContain(`<div class="dialogue-line voice-1 is-end"><p class="dialogue-who"><span>Bob</span></p>`)
    expect(html).toContain(`<p>Note: four.</p>`)
    expect(html).toContain(`<div class="dialogue-line voice-2"><p class="dialogue-who"><img class="dialogue-avatar" src="/cy.png" alt="" loading="lazy"><span>Cy</span></p>`)
    expect(html).toContain(`<p><strong>Bold</strong> text.</p>`)
    expect(dialogueHtml(`<p>Plain text.</p>`)).toBe(`<p>Plain text.</p>`)
  })

  test("highlights: quotes and list items become cards with their location and note", () => {
    const html = highlightsHtml(
      `<p>Intro</p><blockquote>\n<p>One. — location: <a href="kindle://x">12</a></p>\n</blockquote>\n<p>Note: mine.</p>\n<p>More of mine.</p><h3>Next</h3>` +
        `<blockquote><p>Two (p. xiv)</p></blockquote><blockquote><p>Three.</p></blockquote><ol><li>Four (Location 10-12)<ul><li><strong>Note:</strong> why</li><li>also</li></ul></li><li><p>Five (Page 3)</p></li><li>Seven<ul><li>Note: one</li></ul></li></ol>` +
        `<h2>Metadata</h2><ul><li>Author: X</li></ul><h2>More</h2><ul><li>Six</li></ul>`,
    )
    expect(html).toStartWith(
      `<p>Intro</p><div class="highlight-list"><figure class="highlight-card"><blockquote><p>One.</p></blockquote><div class="highlight-note"><p>mine.</p>\n<p>More of mine.</p></div><figcaption>location: <a href="kindle://x">12</a></figcaption></figure></div><h3>Next</h3>`,
    )
    expect(html).toContain(`<blockquote><p>Two</p></blockquote><figcaption>p. xiv</figcaption>`)
    expect(html).toContain(`<blockquote><p>Three.</p></blockquote></figure>`)
    expect(html).toContain(`<blockquote><p>Four</p></blockquote><div class="highlight-note"><ul><li>why</li><li>also</li></ul></div><figcaption>Location 10-12</figcaption>`)
    expect(html).toContain(`<blockquote><p>Five</p></blockquote><figcaption>Page 3</figcaption>`)
    expect(html).toContain(`<blockquote><p>Seven</p></blockquote><div class="highlight-note">one</div></figure>`)
    expect(html).toContain(`<h2>Metadata</h2><ul><li>Author: X</li></ul>`)
    expect(html).toContain(`<h2>More</h2><div class="highlight-list"><figure class="highlight-card"><blockquote><p>Six</p></blockquote></figure></div>`)
  })

  test("a glossary: terms from headings and bold paragraphs, filed by letter", () => {
    const { intro, entries } = glossaryEntries(
      `<p>Intro</p><h2 id="b">Backlink<a class="heading-anchor" href="#b">#</a></h2><p>Back.</p><h2>A</h2><p>Under A.</p>` +
        `<p><strong>Atom</strong>: small.</p><p><strong>Bare:</strong></p><p><strong>Loud</strong> not a term.</p><h3>2FA</h3>`,
    )
    expect(intro).toBe("<p>Intro</p>")
    expect(entries.map((e) => [e.term, e.id, e.definition])).toEqual([
      ["Backlink", "b", "<p>Back.</p><p>Under A.</p>"],
      ["Atom", undefined, "<p>small.</p>"],
      ["Bare", undefined, "<p><strong>Loud</strong> not a term.</p>"],
      ["2FA", undefined, ""],
    ])
    const html = glossaryHtml(intro, [...entries, { term: "Atom", definition: "" }, { term: "!", definition: "" }], "en-US", "Letters")
    expect(html).toStartWith(`<p>Intro</p><nav class="glossary-letters" aria-label="Letters"><a href="#letter-a">A</a><a href="#letter-b">B</a><span aria-hidden="true">C</span>`)
    expect(html).toContain(`<a href="#letter-other">#</a></nav>`)
    expect(html).toContain(`<div class="glossary-entry" id="atom"><dt>Atom<a class="heading-anchor" aria-hidden="true" tabindex="-1" href="#atom">#</a></dt><dd><p>small.</p></dd></div><div class="glossary-entry" id="atom-2">`)
    expect(html).toContain(`<section class="glossary-group" id="letter-other"><h2 class="glossary-letter">#</h2><dl><div class="glossary-entry" id="term"><dt>!<a`)
    expect(html).toMatch(/id="letter-b"[\s\S]*id="letter-other"/)
    expect(html).toContain(`<div class="glossary-entry" id="term">`)
    expect(glossaryHtml("<p>x</p>", [], "en-US", "L")).toBe("<p>x</p>")
    // Terms in other scripts get their own letters, without A–Z.
    expect(glossaryHtml("", [{ term: "ねこ", definition: "" }], "ja-JP", "L")).toContain(`<nav class="glossary-letters" aria-label="L"><a href="#letter-ね">ね</a></nav>`)
    expect(letterOf("Évergreen", "en-US")).toBe("E")
    expect(letterOf("", "en-US")).toBe("#")
  })

  test("a syllabus: numbered lessons with their time and a box to tick, the progress hidden until the browser counts", () => {
    const html = syllabusHtml("<p>Intro</p>", [{ id: "a", heading: "<h2>One</h2>", minutes: 3, body: "<p>x</p>" }, { id: "b", heading: "<h2>Two</h2>", body: " " }], "en-US")
    expect(html).toBe(
      `<p>Intro</p><div class="syllabus-progress" data-syllabus-progress data-template="{done} of {total} lessons done" hidden><progress max="2" value="0" aria-hidden="true"></progress><span>0 of 2 lessons done</span></div>` +
        `<ol class="syllabus"><li class="lesson" data-lesson="a"><div class="lesson-head"><h2>One</h2><span class="lesson-time">3 min read</span><label class="lesson-done"><input type="checkbox" data-lesson-done><span class="sr-only">One: </span>Done</label></div><div class="lesson-body"><p>x</p></div></li>` +
        `<li class="lesson" data-lesson="b"><div class="lesson-head"><h2>Two</h2><label class="lesson-done"><input type="checkbox" data-lesson-done><span class="sr-only">Two: </span>Done</label></div></li></ol>`,
    )
    expect(syllabusHtml("<p>Intro</p>", [], "en-US")).toBe("<p>Intro</p>")
  })

  test("a poem keeps its indentation as non-breaking spaces, outside code", () => {
    expect(keepIndent("Line\n  two\n\tthree\n```\n  code\n```\n   ")).toBe("Line\n\u00a0\u00a0two\n\u00a0\u00a0\u00a0\u00a0three\n```\n  code\n```\n   ")
  })

  test("a poem: its stanzas centred, numbered on demand; beside a translation, stanza by stanza", () => {
    expect(poemHtml("<p>One<br>\ntwo</p>\n<hr>\n<p>Three</p>", false)).toBe(`<div class="poem"><p class="stanza">One<br>\ntwo</p><hr><p class="stanza">Three</p></div>`)
    expect(poemHtml("<p>A</p>", true)).toStartWith(`<div class="poem is-numbered">`)
    const html = poemHtml("<h2>T</h2><p>Own</p><p>More</p>", false, { html: "<h2>T</h2><p>Khác</p>", lang: "vi-VN", ownLang: "en-US", first: false })
    expect(html).toBe(
      `<div class="poem is-bilingual"><div class="poem-pair poem-langs"><p lang="en-US">English</p><p lang="vi-VN">Tiếng Việt</p></div>` +
        `<div class="poem-pair is-shared"><h2>T</h2></div>` +
        `<div class="poem-pair"><div class="poem-col" lang="en-US"><p class="stanza">Own</p></div><div class="poem-col" lang="vi-VN"><p class="stanza">Khác</p></div></div>` +
        `<div class="poem-pair"><div class="poem-col" lang="en-US"><p class="stanza">More</p></div><div class="poem-col" lang="vi-VN"></div></div></div>`,
    )
    // The original goes first.
    expect(poemHtml("<p>Own</p>", false, { html: "<p>Gốc</p>", lang: "vi-VN", ownLang: "en-US", first: true })).toContain(
      `<div class="poem-col" lang="vi-VN"><p class="stanza">Gốc</p></div><div class="poem-col" lang="en-US">`,
    )
  })

  test("a letter: the date line, the salutation, and the closing and signature at its foot", () => {
    const line = { place: "Huế", date: "March 4, 2026", datetime: "2026-03-04" }
    expect(letterHtml("<p>Dear Ann,</p>\n<p>Body.</p>\n<p>Yours,<br>\nAda</p>", line)).toBe(
      `<div class="letter"><p class="letter-dateline">Huế, <time datetime="2026-03-04">March 4, 2026</time></p><p class="letter-salutation">Dear Ann,</p><p>Body.</p>` +
        `<div class="letter-sign"><p class="letter-closing">Yours,</p><p class="letter-signature">Ada</p></div></div>`,
    )
    // A short paragraph before a last one of one line is the closing; a long one is the body.
    expect(letterHtml("<p>Hi,</p><p>Body.</p><p>With love,</p><p>Ada</p>", {})).toContain(
      `<div class="letter-sign"><p class="letter-closing">With love,</p><p class="letter-signature">Ada</p></div></div>`,
    )
    expect(letterHtml("<p>Hi,</p><p>Body.</p><p>This paragraph says far more than any closing would.</p><p>Ada</p>", {})).toContain(
      `<p>This paragraph says far more than any closing would.</p><div class="letter-sign"><p class="letter-signature">Ada</p></div>`,
    )
    // Too short to sign: a salutation and a body.
    expect(letterHtml("<p>Hi,</p><p>Body.</p>", { place: "Hà Nội" })).toBe(`<div class="letter"><p class="letter-dateline">Hà Nội</p><p class="letter-salutation">Hi,</p><p>Body.</p></div>`)
    expect(letterHtml("<h2>No paragraphs</h2>", { date: "someday" })).toBe(`<div class="letter"><p class="letter-dateline">someday</p><h2>No paragraphs</h2></div>`)
    // The signature property: after the last paragraph as the closing, or alone.
    expect(letterHtml("<p>Hi,</p><p>Body.</p><p>Love,</p>", {}, { image: "/sig.png", alt: "Signature" })).toContain(
      `<div class="letter-sign"><p class="letter-closing">Love,</p><img class="letter-signature-image" src="/sig.png" alt="Signature" loading="lazy"></div>`,
    )
    expect(letterHtml("<p>Body.</p>", {}, { text: "Ada & co", alt: "Signature" })).toBe(`<div class="letter"><p>Body.</p><div class="letter-sign"><p class="letter-signature">Ada &amp; co</p></div></div>`)
    expect(letterHtml("<p>Body.</p>", {}, { alt: "Signature" })).toContain(`<p class="letter-signature"></p>`)
  })

  test("pros and cons written with + and -: a list of their own, outside code, in lists that have a +", () => {
    expect(markProsCons("+ Fast\n- Slow\n+ ✅ Marked\n\n- plain\n- list\n```\n+ code\n```")).toBe("* ✅ Fast\n* ❌ Slow\n+ ✅ Marked\n\n- plain\n- list\n```\n+ code\n```")
  })

  test("a comparison: pros and cons from marks or subheadings, facts from key: value lines", () => {
    const { intro, options } = compareOf(
      `<p>Intro</p><h2 id="a">A</h2>\n<p>price: 10<br>\nspeed:: fast</p>\n<ul><li>✅ Good</li><li><p>❌ Bad</p></li></ul><ul><li>Weight: 2 kg</li></ul><ul><li>Plain item</li></ul><p>Note it.</p>` +
        `<h2>B</h2><h3>Pros</h3><ul><li>Cheap</li></ul><h3>Nhược điểm</h3><ol><li>Loud</li></ol><h3>Story</h3><ul><li>told</li></ul><blockquote><p>q</p></blockquote>`,
    )
    expect(intro).toBe("<p>Intro</p>")
    expect(options.map((o) => [o.name, o.id, o.pros, o.cons, o.facts])).toEqual([
      ["A", "a", ["Good"], ["<p>Bad</p>"], [["price", "10"], ["speed", "fast"], ["Weight", "2 kg"]]],
      ["B", undefined, ["Cheap"], ["Loud"], []],
    ])
    expect(options[0].body).toBe("<ul><li>Plain item</li></ul><p>Note it.</p>")
    expect(options[1].body).toBe("<h3>Story</h3><ul><li>told</li></ul><blockquote><p>q</p></blockquote>")
    const labels = { pros: "Pros", cons: "Cons", summary: "At a glance", picked: "Our pick" }
    const html = compareHtml(intro, options, " b ", labels)
    expect(html).toStartWith(
      `<p>Intro</p><div class="table-wrap compare-table" role="region" aria-label="At a glance" tabindex="0"><table><caption>At a glance</caption><thead><tr><td></td><th scope="col">A</th><th scope="col" class="is-picked">B</th></tr></thead>`,
    )
    expect(html).toContain(`<tr><th scope="row">price</th><td>10</td><td class="is-picked">—</td></tr>`)
    expect(html).toContain(
      `<section class="compare-option"><h2 id="a">A</h2><ul><li>Plain item</li></ul><p>Note it.</p><div class="compare-procon"><div class="compare-pros"><p class="compare-label">Pros</p><ul><li>Good</li></ul></div><div class="compare-cons"><p class="compare-label">Cons</p><ul><li><p>Bad</p></li></ul></div></div></section>`,
    )
    expect(html).toContain(`<section class="compare-option is-picked"><h2>B</h2><p class="compare-badge">Our pick</p>`)
    // Without facts, no table; without pros or cons, no columns; without options, the text alone.
    const bare = compareHtml("", compareOf("<h2>C</h2><p>Just text.</p>").options, "", labels)
    expect(bare).toBe(`<div class="compare-options"><section class="compare-option"><h2>C</h2><p>Just text.</p></section></div>`)
    expect(compareHtml("<p>x</p>", [], "", labels)).toBe("<p>x</p>")
  })

  test("a checklist: every task a box to tick, counted per section, outside task queries", () => {
    const labels = { progress: "{done} of {total} done", reset: "Reset" }
    const html = checklistHtml(
      `<p>Intro</p><ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled aria-label="Pass &amp; port"> Pass</li></ul>` +
        `<h2>Clothes</h2><ul><li class="task-list-item"><input type="checkbox" checked disabled aria-label="Socks"> Socks</li><li class="task-list-item"><input type="checkbox" disabled aria-label="Socks"> Socks</li><li class="task-list-item"><input type="checkbox" disabled> ?</li></ul>` +
        `<h2>Notes</h2><p>No tasks.</p><div class="dataview dv-tasks tasks-query"><ul><li class="task-list-item"><input type="checkbox" disabled aria-label="Elsewhere"> Elsewhere</li></ul></div>`,
      labels,
    )
    expect(html).toStartWith(
      `<div class="checklist" data-checklist><div class="checklist-progress" data-checklist-progress data-template="{done} of {total} done" hidden><progress max="4" value="0" aria-hidden="true"></progress><span>0 of 4 done</span><button type="button" class="checklist-reset" data-checklist-reset>Reset</button></div><p>Intro</p>`,
    )
    expect(html).toContain(`<input type="checkbox" aria-label="Pass &amp; port" data-check="pass-port">`)
    expect(html).toContain(
      `<section class="checklist-section" data-checklist-section><h2>Clothes</h2><p class="checklist-count" data-checklist-count hidden></p><ul><li class="task-list-item"><input type="checkbox" checked aria-label="Socks" data-check="socks">`,
    )
    expect(html).toContain(`data-check="socks-2"`)
    expect(html).toContain(`<input type="checkbox" data-check="item">`)
    // A section without tasks stays as it is, and so do the tasks a query gathers.
    expect(html).toContain(`<h2>Notes</h2><p>No tasks.</p><div class="dataview dv-tasks tasks-query"><ul><li class="task-list-item"><input type="checkbox" disabled aria-label="Elsewhere">`)
    expect(checklistHtml("<ul><li>No tasks</li></ul>", labels)).toBe("<ul><li>No tasks</li></ul>")
  })

  test("a hub: its sections as spokes of a map, their links as leaves, and the sections as a list", () => {
    const html = hubHtml(
      "Index",
      `<p>Intro</p><h2 id="w">Writing<a class="heading-anchor" href="#w">#</a></h2><ul><li><a class="internal" href="/a">A</a></li><li><a href="/a">A again</a></li><li><a href="#top">Top</a></li><li><a href="/e"><img alt=""></a></li><sup><a href="#fn-1" data-footnote-ref>1</a></sup></ul>`,
    )
    expect(html).toStartWith(`<p>Intro</p><figure class="hub-map" aria-hidden="true"><svg class="hub-svg" viewBox="`)
    expect(html).toContain(`<a href="/a" tabindex="-1"><title>A</title><circle class="hub-leaf" cx="0" cy="-290" r="5"/><text class="hub-leaf-label" x="0" y="-304" text-anchor="middle">A</text></a>`)
    expect(html).toContain(`<a href="#w" tabindex="-1"><title>Writing</title><circle class="hub-spoke hub-c0" cx="0" cy="-150" r="11"/>`)
    expect(html.match(/class="hub-leaf"/g)).toHaveLength(1)
    expect(html).toContain(`<ul class="hub-sections"><li class="hub-section"><h2 id="w">Writing`)
    expect(hubHtml("Index", "<p>No sections.</p>")).toBe("<p>No sections.</p>")
    // Leaves beyond eight are counted on the last; crowded ones alternate their distance; labels sit away from the centre.
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `Leaf number ${i} with a long name`, href: `/l${i}` }))
    const svg = hubSvg("A title far too long to fit in the centre", [
      { label: "Down", leaves: many },
      { label: "Left", id: "left", leaves: [{ label: "x", href: "/x" }] },
      { label: "Up", leaves: [] },
      { label: "Right", leaves: [] },
    ])
    expect(svg.match(/class="hub-leaf"/g)).toHaveLength(9)
    expect(svg).toContain(`<g><circle class="hub-leaf"`)
    expect(svg).toContain(`>+3</text>`)
    expect(svg).toContain(`Leaf number 0 with a…`)
    expect(svg).toContain(`A title far too long to…`)
    expect(svg).toContain(`text-anchor="start"`)
    expect(svg).toContain(`text-anchor="end"`)
    expect(svg).toContain(`<g><circle class="hub-spoke hub-c0"`)
    // The frame holds every point and its label.
    const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number)
    expect(x < -330 && y < -330 && x + w > 330 && y + h > 150).toBe(true)
  })

  test("frontmatter values read as plain text, wikilinks by their alias or name", () => {
    expect(plain("[[People/Sönke Ahrens]]")).toBe("Sönke Ahrens")
    expect(plain(["[[A|Ann]]", "Bob"])).toBe("Ann, Bob")
    expect(plain(undefined)).toBe("")
  })
})

// End-to-end: a vault with a résumé, projects, books and a gallery.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/layouts")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
// The note itself, cards of a collection included: up to the sidebar, or the footer on a page without one.
const article = (p: string) => read(p).match(/<article[\s\S]*?(?:<aside|<footer class="site-footer")/)![0]

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-layouts-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => {
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

describe("page layouts", () => {
  test("a résumé has a head of contacts and sections, and no backlinks", () => {
    const page = read("CV/index.html")
    const html = article("CV/index.html")
    expect(html).toContain('class="note layout-cv h-entry"')
    expect(html).toContain('<img class="cv-photo" src="/assets/_assets/portrait.png"')
    expect(html).toContain('<p class="cv-role">Platform engineer</p>')
    expect(html).toContain('<a href="mailto:ada@example.com">ada@example.com</a>')
    expect(html).toContain('<a href="https://github.com/example" rel="me noopener">GitHub</a>')
    expect(html).toContain("data-print")
    expect(html).toMatch(/<section class="cv-section"><h2 id="experience">[\s\S]*?<div class="cv-body">/)
    // The head already shows what the properties block would repeat.
    expect(html).not.toContain('class="properties')
    expect(page).not.toContain('class="backlinks"')
  })

  test("a gallery shows its pictures as a grid, its text as text", () => {
    const html = article("Photos/index.html")
    expect(html).toContain('class="note layout-gallery h-entry"')
    expect(html.match(/<div class="gallery-grid">/g)).toHaveLength(1)
    expect(html.match(/<figure class="gallery-item"[ >]/g)).toHaveLength(3)
    expect(html).toContain('<figure class="gallery-item" style="--ar: 2"><img src="/assets/_assets/road.png"')
    expect(html).toContain("<figcaption>Morning fog</figcaption>")
    expect(html).toContain("<p>Text between albums stays text.</p>")
  })

  test("projects of the folder, grouped by status in reading order", () => {
    const html = article("Projects/Projects/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["active", "done", "someday"])
    expect(html).toContain('<h2 class="collection-title">In progress <span class="count">1</span>')
    expect(html).toContain('<p class="project-meta">2025 – now</p>')
    expect(html).toContain('<p class="project-meta">2019 – 2021</p>')
    expect(html).toContain("<li>TypeScript</li><li>Astro</li>")
    expect(html).toContain('<a href="https://github.com/example/garden" rel="noopener">github.com ↗</a>')
    expect(html).toContain('<img src="/assets/_assets/cover.png"')
    expect(html).not.toContain('href="/Projects/Projects"')
  })

  test("a folder note with a layout lays out its folder page", () => {
    const html = read("Projects/index.html")
    expect(html).toContain('<div class="collection collection-projects">')
    expect(html).not.toContain('class="note-list"')
  })

  test("books by tag on a shelf: covers, authors and ratings", () => {
    const html = article("Books/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["reading", "read"])
    expect(html).toContain('<span class="book-cover-text">How to Take Smart Notes</span>')
    expect(html).toContain('<span class="book-author">Sönke Ahrens, 2017</span>')
    expect(html).toContain('aria-label="Rated 4/5">★★★★<span class="book-rating-rest">★</span>')
  })

  test("a timeline of moments", () => {
    const html = article("Life/index.html")
    expect(html).toContain('class="note layout-timeline h-entry"')
    expect(html.match(/<li class="life-event">/g)).toHaveLength(2)
  })

  test("a page of links: an avatar, a tagline and buttons, no dates", () => {
    const html = article("Links/index.html")
    expect(html).toContain('<header class="hub-head"><img class="hub-avatar" src="/assets/_assets/portrait.png"')
    expect(html).toContain('<p class="hub-tagline">Find me elsewhere.</p>')
    expect(html.match(/<ul class="link-hub">/g)).toHaveLength(1)
    expect(html).not.toContain('class="note-head"')
  })

  test("movies by folder: directors, release years and the watchlist first after watching", () => {
    const html = article("Movies/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["to-watch", "watched"])
    expect(html).toContain('<span class="book-author">Andrei Tarkovsky, 1979</span>')
  })

  test("uses, now, FAQ and quotes", () => {
    expect(article("Uses/index.html").match(/<ul class="uses-grid">/g)).toHaveLength(1)
    const now = article("Now/index.html")
    expect(now).toContain('<time datetime="2020-01-02T00:00:00.000Z">Last updated Jan 2, 2020</time>')
    // Old enough to warn, at build time and again in the browser.
    expect(now).toMatch(/<p class="outdated" role="note" data-outdated [^>]*data-after="0.25">/)
    expect(article("FAQ/index.html").match(/<details class="faq-item">/g)).toHaveLength(2)
    expect(article("Quotes/index.html").match(/<figure class="quote-card">/g)).toHaveLength(3)
  })

  test("talks by year, newest first, with their event and links", () => {
    const html = article("Talks/Talks/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["2024", "2023"])
    expect(html).toContain('<span class="talk-meta">RustConf</span>')
    expect(html).toContain('<a href="https://slides.example/gardens" rel="noopener">Slides ↗</a>')
    expect(html).toContain('<span class="talk-meta">Hà Nội meetup</span>')
  })

  test("recipes by category; a recipe's page has its cover and two columns", () => {
    expect(article("Recipes/Recipes/index.html")).toContain('<p class="project-meta">⏱ 6 h · 🍽 4</p>')
    // The ingredients are an aside of their own, so the whole page is read.
    const page = read("Recipes/Phở-bò/index.html")
    expect(page).toContain('<div class="item-head"><img class="item-cover" src="/assets/_assets/road.png"')
    expect(page).toContain('<aside class="recipe-ingredients">')
  })

  test("places on a map, grouped by country", () => {
    const html = article("Places/index.html")
    expect(html).toContain('class="map-canvas collection-map" data-map="[{&quot;lat&quot;:35.01')
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["japan", "vietnam"])
  })

  test("a shelf names its own statuses, per language, and fields", () => {
    const html = article("Games/index.html")
    expect(html).toContain('<h2 class="collection-title">Playing now <span class="count">1</span>')
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["playing", "backlog"])
    expect(html).toContain('<span class="book-author">Switch</span>')
  })

  test("a collection embedding a base shows what the base finds, in its groups, without the table", () => {
    const html = article("Shelf-by-base/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["read", "reading"])
    expect(html).not.toContain("base-embed")
  })

  test("a gallery and a timeline show the notes their base finds", () => {
    const gallery = article("Covers/index.html")
    expect(gallery).toContain('<figure class="gallery-item"><a class="internal" href="/Reading/Deep-Work"')
    // The cover repeats the caption's link, so only the caption is named and tabbed to.
    expect(gallery).toMatch(/data-key="Reading\/Deep Work" tabindex="-1" aria-hidden="true"><img [^>]*alt=""/)
    expect(gallery).not.toContain("base-embed")
    const timeline = article("Reading-log/index.html")
    const dates = [...timeline.matchAll(/<p class="life-when"><time datetime="([^"]+)"/g)].map((m) => m[1].slice(0, 10))
    expect(dates.slice(0, 2)).toEqual(["2023-03-01", "2024-09-10"])
  })

  test("a book of a collection shows its cover upright beside its title, with its author and rating", () => {
    const html = article("Reading/Deep-Work/index.html")
    expect(html).toContain('<div class="item-head is-upright"><img class="item-cover" src="/assets/_assets/cover.png"')
    expect(html).toContain('<p class="item-byline">Cal Newport</p>')
    expect(html).toContain('<span class="chip item-status">Read</span>')
  })

  test("a note without a layout keeps the usual page", () => {
    const html = read("Sketchbook/index.html")
    expect(html).not.toContain("layout-")
    expect(html).not.toContain("item-head")
    expect(html).toContain('class="backlinks"')
  })

  test("a résumé and a link page stand alone", () => {
    for (const [page, look] of [["CV/index.html", "resume"], ["Links/index.html", "classic"]] as const) {
      const html = read(page)
      expect(html).toContain(`data-look="${look}"`)
      expect(html).toContain('data-chrome="minimal"')
      for (const gone of ['class="main-nav"', "data-open-search", "sidebar-left", "sidebar-right", 'class="crumbs"', "data-search-dialog", "data-graph-dialog"])
        expect(html).not.toContain(gone)
      expect(html).toContain("data-theme-toggle")
    }
  })

  test("a gallery starts dark", () => {
    const html = read("Photos/index.html")
    expect(html).toContain('data-look="darkroom"')
    expect(html).toContain('data-scheme-default="dark"')
  })

  test("collections and timelines keep the header but drop the rail", () => {
    for (const page of ["Life/index.html", "Projects/index.html"]) {
      const html = read(page)
      expect(html).toContain('data-chrome="full-norail"')
      expect(html).toContain('class="main-nav"')
      expect(html).not.toContain("sidebar-right")
    }
    expect(read("FAQ/index.html")).toContain('data-chrome="full"')
  })

  test("every frame records the note title for footprints and highlights", () => {
    expect(read("CV/index.html")).toMatch(/class="stack-col"[^>]*data-title="[^"]+"/)
    expect(read("Life/index.html")).toMatch(/class="stack-col"[^>]*data-title="[^"]+"/)
    expect(read("CV/index.html")).not.toContain("data-stack-col")
  })

  test("only a page in the full frame stacks notes", () => {
    expect(read("Life/index.html")).not.toContain("data-stack-row")
    expect(read("CV/index.html")).not.toContain("data-stack-row")
    expect(read("FAQ/index.html")).toContain("data-stack-row")
    expect(read("Sketchbook/index.html")).toContain("data-stack-row")
  })

  test("a protected résumé keeps the normal head, in the resume style", () => {
    const html = read("CV-locked/index.html")
    expect(html).toContain('data-look="resume"')
    expect(html).toContain('class="note-head"')
    expect(html).not.toContain('class="cv-head"')
  })

  test("a manuscript opens its series as a list of chapters, its footnotes ready for the margin", () => {
    const html = read("Book/Chapter-one/index.html")
    expect(html).toContain('data-look="manuscript"')
    expect(html).toContain('<details class="series-box" open>')
    expect(html).toContain('<span class="sidenote-number">1</span> A note that stands in the margin.</span>')
  })

  test("lacquer starts dark", () => {
    const html = read("Lacquer/index.html")
    expect(html).toContain('data-look="lacquer"')
    expect(html).toContain('data-scheme-default="dark"')
  })

  test("a paper: authors linked to their notes, the venue, links, a cite box and the abstract", () => {
    const html = article("Paper/index.html")
    expect(html).toContain('<p class="paper-authors"><a class="internal" href="/CV">Ada Lovelace</a>, <span>Charles Babbage</span></p>')
    expect(html).toContain('<p class="paper-venue">Journal of Note Taking 12(3), 45–67</p>')
    expect(html).toContain('<a href="https://doi.org/10.1234/notes.2024" rel="noopener">DOI ↗</a>')
    expect(html).toContain("@article{lovelace2024gardens,")
    expect(html).toContain('<section class="paper-abstract"><h2 class="paper-abstract-title">Abstract</h2><p>We study')
    expect(html).toContain('<div class="paper-body"><h2 id="introduction">')
    expect(html).not.toContain('class="properties')
    expect(read("Paper/index.html")).toContain('data-chrome="full-norail"')
  })

  test("a superseded decision says so first, with a link to what replaced it", () => {
    const html = article("Decision/index.html")
    expect(html).toContain('<p class="adr-banner" role="note">This decision has been superseded by <a class="internal" href="/New-search">New search</a>.</p>')
    expect(html).toContain('<span class="adr-status adr-status-superseded">Superseded</span>')
    expect(html).toContain('<span class="adr-fact">Deciders: <a class="internal" href="/CV">Ada</a>, Bob</span>')
    expect(html.match(/<section class="adr-section adr-/g)).toHaveLength(4)
    const next = article("New-search/index.html")
    expect(next).toContain('<span class="adr-status adr-status-accepted">Accepted</span>')
    expect(next).toContain('Supersedes: <a class="internal" href="/Decision">Use SQLite for search</a>')
    expect(next).not.toContain("adr-banner")
    expect(read("Decision/index.html")).toContain('data-chrome="full"')
  })

  test("a changelog: versions with anchors and dates, tags for kinds of change, and a feed of its versions", () => {
    const html = article("Changelog/index.html")
    expect(html).toContain('<section class="release" id="v1.2.0"><h2 id="120---2026-10-01">1.2.0<a')
    expect(html).toContain('<p class="release-date"><time datetime="2026-10-01">Oct 1, 2026</time></p>')
    expect(html).toContain('class="change-tag change-fixed">Fixed')
    expect(read("Changelog/index.html")).toContain('<link rel="alternate" type="application/rss+xml" title="Changelog · Layouts" href="/Changelog/releases.xml">')
    const xml = read("Changelog/releases.xml")
    expect([...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]).slice(1)).toEqual(["http://localhost:4321/Changelog#v1.2.0", "http://localhost:4321/Changelog#v1.1.0"])
  })

  test("a dialogue: bubbles per speaker, a picture for a speaker that has one", () => {
    const html = article("Interview/index.html")
    expect(html.match(/<div class="dialogue-line /g)).toHaveLength(4)
    expect(html).toContain('<img class="dialogue-avatar" src="/assets/_assets/portrait.png" alt=""')
    expect(html).toContain("<p>Note: this line is not a speaker.</p>")
  })

  test("highlights: the book's head, a card per highlight, the metadata left alone", () => {
    const html = article("Smart-Notes-highlights/index.html")
    expect(html).toContain('<div class="item-head is-upright"><img class="item-cover" src="/assets/_assets/cover.png"')
    expect(html).toContain('<p class="item-byline">Sönke Ahrens · Kindle</p>')
    expect(html.match(/<figure class="highlight-card">/g)).toHaveLength(3)
    expect(html).toContain("<figcaption>Location 123</figcaption>")
    expect(html).toContain('<div class="highlight-note">keep the context.</div>')
    expect(html).toContain("<li>Author: Sönke Ahrens</li>")
  })

  test("a glossary: letters to jump to, terms A–Z, and the garden's own terms", () => {
    const html = article("Terms/index.html")
    expect(html).toContain('<nav class="glossary-letters" aria-label="Jump to a letter"><a href="#letter-a">A</a>')
    expect([...html.matchAll(/<div class="glossary-entry" id="([^"]+)"/g)].map((m) => m[1])).toEqual(["atomic-note", "backlink", "évergreen", "zettel", "zettelkasten"])
    expect(html).toContain('<dt><a class="internal" href="/Zettelkasten" data-key="Zettelkasten">Zettelkasten</a>')
  })

  test("a trip: a map of its stops joined by the route, each day with its pictures in a strip", () => {
    const html = article("Japan-trip/index.html")
    expect(html).toMatch(/<div class="map-canvas trip-map" role="region" aria-label="Map" data-map="[^"]*Đà Lạt[^"]*" data-route /)
    expect(html.match(/<li class="trip-stop">/g)).toHaveLength(3)
    expect(html).toContain('<div class="trip-strip" role="group" aria-label="Day 1 — Đà Lạt" tabindex="0">')
    expect(html.match(/<figure class="gallery-item"/g)).toHaveLength(2)
  })

  test("a syllabus: lessons to tick, with their reading time and the progress", () => {
    const html = article("Course/index.html")
    expect(html.match(/<li class="lesson" data-lesson="/g)).toHaveLength(3)
    expect(html).toContain('<span class="lesson-time">1 min read</span>')
    expect(html).toContain('data-syllabus-progress data-template="{done} of {total} lessons done" hidden')
  })

  test("the new layouts have no serious or critical axe violations", async () => {
    const axe = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")
    for (const page of ["Paper", "Decision", "Changelog", "Interview", "Smart-Notes-highlights", "Terms", "Japan-trip", "Course"]) {
      const window = new Window({ url: "https://garden.example/", settings: { disableJavaScriptEvaluation: false } })
      window.document.write(read(`${page}/index.html`).replace(/<script\b[\s\S]*?<\/script>/g, ""))
      window.eval(axe)
      const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; impact: string | null }[] }> } }).axe
      const res = await run.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
      await window.happyDOM.close()
      expect({ page, found: res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id) }).toEqual({ page, found: [] })
    }
  }, 120_000)

  test("a poem: centred stanzas, numbered, their lines and indentation kept", () => {
    const html = article("Poem/index.html")
    expect(html).toContain('<div class="poem is-numbered"><p class="stanza">The road goes on,<br>\n\u00a0\u00a0\u00a0\u00a0and on it goes,<br>')
    expect(html.match(/<p class="stanza">/g)).toHaveLength(2)
    expect(html).not.toContain('class="properties')
    expect(read("Poem/index.html")).toContain('data-chrome="full-norail"')
  })

  test("a bilingual poem: the original and its translation side by side, stanza by stanza", () => {
    const html = article("Bilingual-poem/index.html")
    expect(html).toContain('<div class="poem-pair poem-langs"><p lang="en-US">English</p><p lang="vi-VN">Tiếng Việt</p></div>')
    expect(html.match(/<div class="poem-pair">/g)).toHaveLength(2)
    expect(html).toContain('<div class="poem-col" lang="vi-VN"><p class="stanza">Thu ăn măng trúc,<br>\n\u00a0\u00a0đông ăn giá.</p></div>')
  })

  test("a letter: its place and date, salutation, closing and a signature published like a picture", () => {
    const html = article("Letter/index.html")
    expect(html).toContain('<p class="letter-dateline">Hà Nội, <time datetime="2026-10-01">October 1, 2026</time></p><p class="letter-salutation">Dear Ann,</p>')
    expect(html).toContain('<div class="letter-sign"><p class="letter-closing">Warm regards,</p><img class="letter-signature-image" src="/assets/_assets/signature.png" alt="Signature"')
    expect(read("assets/_assets/signature.png").length).toBeGreaterThan(0)
    expect(html).not.toContain('class="properties')
    expect(article("Short-letter/index.html")).toContain('<div class="letter-sign"><p class="letter-closing">Yours,</p><p class="letter-signature">Ada</p></div>')
  })

  test("a comparison: a table of facts, pros and cons from marks, + and - and subheadings, the pick", () => {
    const html = article("Note-apps/index.html")
    expect(html).toContain('<th scope="col" class="is-picked">Obsidian</th><th scope="col">Notion</th><th scope="col">Paper</th>')
    expect(html).toContain('<tr><th scope="row">price</th><td class="is-picked">free</td><td>from $10</td><td>—</td></tr>')
    expect(html).toContain('<section class="compare-option is-picked"><h2 id="obsidian">')
    expect(html).toContain('<div class="compare-pros"><p class="compare-label">Pros</p><ul><li>Databases</li></ul></div><div class="compare-cons"><p class="compare-label">Cons</p><ul><li>Slow offline</li><li>Lock-in</li></ul></div>')
    expect(html).toContain('<ul><li>Nothing to install</li></ul>')
  })

  test("a checklist: tasks to tick with their progress; tasks elsewhere stay read only", () => {
    const html = article("Packing/index.html")
    expect(html).toContain('<div class="checklist" data-checklist><div class="checklist-progress" data-checklist-progress data-template="{done} of {total} done" hidden><progress max="7"')
    expect(html.match(/data-check="/g)).toHaveLength(7)
    expect(html).not.toMatch(/<input type="checkbox"[^>]*disabled/)
    expect(html.match(/data-checklist-section/g)).toHaveLength(2)
    const chores = article("Chores/index.html")
    expect(chores).toContain('<input type="checkbox" disabled aria-label="Water the plants">')
    expect(chores).not.toContain("data-check")
  })

  test("a recipe card: its facts, ingredients beside the steps, and a button to print it on A6", () => {
    const html = article("Pancakes/index.html")
    expect(html).toContain('<div class="recipe-card"><img class="recipe-card-cover" src="/assets/_assets/road.png" alt=""')
    expect(html).toContain('<p class="recipe-card-facts">⏱ 20 min · 🍽 4</p>')
    // The ingredients are an aside, where the article helper stops.
    expect(read("Pancakes/index.html")).toContain('<aside class="recipe-ingredients">')
    expect(read("Pancakes/index.html")).toContain('<button type="button" class="recipe-card-print" data-print>Print card</button>')
    expect(html).not.toContain('class="properties')
    const css = fs.readdirSync(path.join(out, "_astro")).filter((f) => f.endsWith(".css")).map((f) => read(`_astro/${f}`)).join("")
    expect(css).toContain("@page recipe-card{size:148mm 105mm")
  })

  test("a hub: a map drawn at build time, hidden from screen readers, and its sections as the list they read", () => {
    const html = article("Map-of-content/index.html")
    expect(html).toMatch(/<figure class="hub-map" aria-hidden="true"><svg class="hub-svg" viewBox="[^"]+" aria-hidden="true" focusable="false">/)
    expect(html.match(/<circle class="hub-spoke /g)).toHaveLength(3)
    expect(html.match(/<circle class="hub-leaf"/g)).toHaveLength(7)
    expect(html).toContain('<a href="/Paper" tabindex="-1"><title>Paper</title>')
    expect(html.match(/<li class="hub-section">/g)).toHaveLength(3)
  })

  test("lore: properties in an infobox, relations and their family tree, and the lore naming it by relation", () => {
    const html = article("Lore/Aria/index.html")
    expect(html).toContain('<div class="infobox">')
    expect(html).toMatch(/<th scope="row">species<\/th>\s*<td>/)
    expect(html).not.toContain('class="properties')
    expect(html).toContain('<div><dt>parent</dt><dd><a class="internal" href="/Lore/Borin">Borin</a></dd></div><div><dt>ally</dt><dd><a class="internal" href="/Lore/Cael">Cael</a></dd></div>')
    expect(html).toContain('<ul class="lore-tree-row is-up"><li><a class="internal" href="/Lore/Borin" tabindex="-1">Borin</a><small>parent</small></li></ul>')
    expect(html).toContain('<div><dt>child of</dt><dd><a class="internal" href="/Lore/Borin">Borin</a></dd></div><div><dt>Mentioned in</dt><dd><a class="internal" href="/Lore/Cael">Cael</a></dd></div>')
    expect(read("Lore/Aria/index.html")).toContain('data-chrome="full"')
  })

  test("protected poems, letters and lore keep their translation, signature and relations inside the ciphertext", () => {
    const poem = read("Locked-poem/index.html")
    for (const secret of ["Lời thề", "A vow kept", "poem-pair"]) expect(poem).not.toContain(secret)
    expect(fs.existsSync(path.join(out, "assets/_assets/secret-signature.png"))).toBe(false)
    const letter = read("Locked-letter/index.html")
    for (const secret of ["secret-signature", "Secret Valley", "letter-dateline"]) expect(letter).not.toContain(secret)
    const hidden = read("Lore/Hidden/index.html")
    for (const secret of ["enemy", "lore-relations", "infobox"]) expect(hidden).not.toContain(secret)
    // Nor does another entity's page tell what the protected one says of it.
    expect(article("Lore/Aria/index.html")).not.toContain("Hidden")
    expect(article("Lore/Aria/index.html")).not.toContain("enemy")
  })

  test("the seven new layouts have no serious or critical axe violations", async () => {
    const axe = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")
    for (const page of ["Poem", "Bilingual-poem", "Letter", "Note-apps", "Packing", "Pancakes", "Map-of-content", "Lore/Aria"]) {
      const window = new Window({ url: "https://garden.example/", settings: { disableJavaScriptEvaluation: false } })
      window.document.write(read(`${page}/index.html`).replace(/<script\b[\s\S]*?<\/script>/g, ""))
      window.eval(axe)
      const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe
      const res = await run.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
      await window.happyDOM.close()
      const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      expect({ page, found: serious.map((v) => `${v.id} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`) }).toEqual({ page, found: [] })
    }
  }, 120_000)

  test("a note can override its layout's style and frame", () => {
    const html = read("Styled-CV/index.html")
    expect(html).toContain('data-look="garden"')
    expect(html).toContain('data-chrome="full"')
  })

  test("a journal: a calendar of its days, charts of what it tracks, then its latest entries by month", () => {
    const html = article("Journal/Journal/index.html")
    expect(html).toContain('<section class="activity daily-calendar" aria-label="Calendar">')
    expect(html).toContain('<a class="day l3 internal" href="/Journal/2024-03-01" title="Mar 1, 2024: 2024-03-01"')
    // A note dated by its `date` property counts as much as one named by its day.
    expect(html).toContain('href="/Journal/New-Year\'s-Eve"')
    expect(html.match(/<figure class="chart"/g)).toHaveLength(2)
    expect(html).toContain('<tr><th scope="row">2024-03-01</th><td>7.5</td></tr>')
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["2024-03", "2023-12"])
    expect(html).toContain('<span class="talk-meta">mood 4 · sleep 7.5</span>')
    // A day keeps its usual page and its links to the days around it.
    const day = read("Journal/2024-03-01/index.html")
    expect(day).not.toContain("item-head")
    expect(day).toContain('class="day-nav"')
  })

  test("bookmarks: a reading list by status, with the site's logo or letter, author, date and comment", () => {
    const html = article("Clippings/Clippings/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["unread", "read"])
    expect(html).toMatch(/<span class="bookmark-icon" aria-hidden="true"><svg viewBox="0 0 24 24"/)
    expect(html).toContain('<span class="bookmark-icon" aria-hidden="true">E</span>')
    expect(html).toContain('<a class="bookmark-site" href="https://github.com/example/garden" rel="noopener">github.com ↗</a><span>Ann</span><time datetime="2024-05-01T00:00:00.000Z">May 1, 2024</time>')
    expect(html).toContain('<p class="bookmark-comment">Worth a second look for the build.</p>')
  })

  test("people: faces or initials, roles, and how they link to each other", () => {
    const html = article("People/People/index.html")
    expect(html).toContain('<img class="person-avatar" src="/assets/_assets/portrait.png" alt=""')
    expect(html).toContain('<span class="person-avatar person-initials" aria-hidden="true">GH</span>')
    expect(html).toContain('<span class="person-meta">Mathematician</span><span class="person-meta">Analytical Engine</span>')
    expect(html).toContain('<canvas data-graph="set" data-lang="en-US" data-urls="[&quot;/People/Ada-Lovelace&quot;,&quot;/People/Alan-Turing&quot;,&quot;/People/Grace-Hopper&quot;]"')
    expect(html.match(/<ul class="people-ties"><li>/g)).toHaveLength(1)
    expect(read("People/Ada-Lovelace/index.html")).toContain('<div class="item-head is-round"><img class="item-cover" src="/assets/_assets/portrait.png"')
  })

  test("snippets: each first code block, highlighted, with its language to filter by", () => {
    const html = article("Snippets/Snippets/index.html")
    expect(html).toContain('<button type="button" class="chip" data-snippet-lang="bash" aria-pressed="false">bash</button>')
    expect(html).toContain('<article class="card snippet" data-language="ts">')
    expect(html).toMatch(/<div class="snippet-code"><pre class="shiki [^"]*"[^>]*tabindex="0"><code class="language-ts">/)
  })

  test("episodes: by season, newest first, each with its sound, and a podcast feed", () => {
    const html = article("Podcast/Podcast/index.html")
    expect(html).toContain('<a href="/Podcast/Podcast/episodes.xml" type="application/rss+xml">Podcast feed (RSS)</a>')
    expect(html).toContain('<h2 class="collection-title">Season 1 <span class="count">2</span>')
    expect([...html.matchAll(/<span class="episode-number">(#\d+)<\/span>/g)].map((m) => m[1])).toEqual(["#2", "#1"])
    expect(html).toContain('<audio src="/assets/_assets/pilot.mp3" controls preload="none" aria-label="Pilot"></audio>')
    expect(html).toContain("<span>with Ada Lovelace</span>")
    expect(read("Podcast/Podcast/index.html")).toContain('<link rel="alternate" type="application/rss+xml" title="Podcast · Layouts" href="/Podcast/Podcast/episodes.xml">')
    const feed = read("Podcast/Podcast/episodes.xml")
    expect(feed).toContain('<enclosure url="http://localhost:4321/assets/_assets/pilot.mp3" length="12" type="audio/mpeg"/>')
    expect(read("assets/_assets/pilot.mp3")).toBe("ID3fakeaudio")
    expect(read("Podcast/Pilot/index.html")).toContain('<audio class="item-audio" src="/assets/_assets/pilot.mp3" controls preload="none" aria-label="Pilot"></audio>')
  })

  test("a protected note's sound stays out of the site", () => {
    expect(fs.existsSync(path.join(out, "assets/_assets/locked.mp3"))).toBe(false)
    expect(read("Locked-episode/index.html")).not.toContain("locked.mp3")
  })

  test("a protected dialogue's speaker pictures stay out of the site", () => {
    expect(fs.existsSync(path.join(out, "assets/_assets/secret-face.png"))).toBe(false)
    expect(read("Locked-interview/index.html")).not.toContain("secret-face.png")
  })

  test("courses: by status, each with its progress and certificate", () => {
    const html = article("Courses/Courses/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["in-progress", "planned", "completed"])
    expect(html).toContain('<progress max="100" value="30" aria-label="Progress: Rust basics"></progress><span>3/10</span>')
    expect(html).toContain('<p class="course-meta"><span>Coursera</span><span>Ann Teacher</span><span>2024 – now</span></p>')
    expect(html).toContain('<a class="course-cert" href="/assets/_assets/cert.pdf" rel="noopener">Certificate ↗</a>')
    expect(read("assets/_assets/cert.pdf")).toStartWith("%PDF")
    const course = article("Courses/Distributed-systems/index.html")
    expect(course).toContain('<div class="course-progress item-progress"><progress max="100" value="100" aria-label="Progress"></progress><span>100%</span></div>')
    expect(course).toContain('<a href="/assets/_assets/cert.pdf" rel="noopener">Certificate ↗</a>')
  })

  test("a protected course's certificate stays out of the site", () => {
    expect(fs.existsSync(path.join(out, "assets/_assets/locked-cert.pdf"))).toBe(false)
    expect(read("Courses/Courses/index.html")).not.toContain("Locked course")
    expect(read("Courses/Locked-course/index.html")).not.toContain("locked-cert")
  })

  test("a wishlist: wishes by status and priority, prices and a total per group", () => {
    const html = article("Wishlist/Wishlist/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["wanted", "bought", "gifted"])
    expect(html).toContain('<p class="wish-total">Total $179.99</p>')
    expect(html).toContain('<span class="wish-price">$149.99</span><span class="chip wish-priority">Priority: high</span>')
    expect(html.indexOf("Keyboard")).toBeLessThan(html.indexOf("Desk lamp"))
    expect(html).toContain('<p class="wish-total">Total ₫1,299,000</p>')
    expect(html).toContain('<a href="https://shop.example/keyboard" rel="noopener">shop.example ↗</a>')
    expect(article("Wishlist/Headphones/index.html")).toContain('<a href="/Uses" class="internal" data-key="Uses">Uses</a>')
  })

  test("a quotebook: every signed quote of its notes, by who said it or by note, linked to its passage", () => {
    const html = article("Quotebook/Quotebook/index.html")
    expect([...html.matchAll(/<h2 class="collection-title">([^<]+) </g)].map((m) => m[1])).toEqual(["Donald Knuth", "Edsger Dijkstra", "Kent Beck"])
    expect(html).toContain('<a class="quote-link" href="/Quotebook/Reading-notes#^simple">Read in context</a>')
    expect(html).toContain('href="/Quotebook/Talk-notes#:~:text=Premature%20optimization%20is%20the%20root%20of%20all%20evil."')
    expect(html).not.toContain("Nobody signed")
    const bySource = article("Quotebook/By-source/index.html")
    expect([...bySource.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["Quotebook/Talk notes", "Quotebook/Reading notes"])
    expect(bySource).toContain('<span class="quote-who">Edsger Dijkstra</span>')
    // A quoted note keeps its own page.
    expect(read("Quotebook/Reading-notes/index.html")).not.toContain("item-head")
  })

  test("a quotebook gathers nothing from protected notes, locked parts or unlisted notes", () => {
    for (const page of ["Quotebook/Quotebook/index.html", "Quotebook/By-source/index.html"]) {
      const html = read(page)
      for (const secret of ["SECRET QUOTE", "LOCKED QUOTE", "UNLISTED QUOTE", "Spy", "Locksmith", "Ghost"]) expect(html).not.toContain(secret)
    }
  })

  test("questions: open ones first, oldest first, then the answered with what answers them", () => {
    const html = article("Questions/Questions/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"[\s\S]*?<\/section>/g)].map((m) => [m[1], [...m[0].matchAll(/class="talk-title internal" href="([^"]+)"/g)].map((x) => x[1])])
    expect(groups).toEqual([
      ["open", ["/Questions/Old-question", "/Questions/Why-gardens"]],
      ["answered", ["/Questions/How-to-link", "/Questions/What-is-a-stub", "/Questions/Secret-answer"]],
    ])
    expect(html).toContain('<p class="question-answer">Answer: <a class="internal" href="/Zettelkasten">Zettelkasten</a></p>')
    expect(html).toContain('<p class="question-answer">Answer: <a class="internal" href="/Sketchbook">Sketchbook</a></p>')
    expect(article("Questions/How-to-link/index.html")).toContain('<span class="chip item-status">Answered</span>')
    expect(article("Questions/Why-gardens/index.html")).toContain('<span class="chip item-status">Open</span>')
  })

  test("questions name no unlisted answer and no protected question", () => {
    const html = read("Questions/Questions/index.html")
    expect(html).not.toContain("HIDDEN ANSWER TITLE")
    expect(article("Questions/Questions/index.html")).not.toContain("LOCKED QUESTION TITLE")
    expect(article("Questions/Secret-answer/index.html")).not.toContain("item-answer")
  })

  test("a digest: each ISO week what was planted and tended, newest first, with a feed of the weeks", () => {
    const html = article("Digest/Digest/index.html")
    expect([...html.matchAll(/<section class="collection-group digest-week" id="([^"]+)"/g)].map((m) => m[1])).toEqual(["2024-w10", "2024-w09", "2024-w07"])
    expect(html).toContain('<h2 class="collection-title">Week 10, 2024 <span class="count">1</span></h2><p class="digest-range"><time datetime="2024-03-04">Mar 4, 2024</time> – <time datetime="2024-03-10">Mar 10, 2024</time></p>')
    expect(html).toMatch(/<div class="digest-part is-tended">[\s\S]*?href="\/Questions\/How-to-link"/)
    expect(html).toContain('<a href="/Digest/Digest/digest.xml" type="application/rss+xml">Weekly digest (RSS)</a>')
    for (const hidden of ["HIDDEN ANSWER TITLE", "LOCKED QUESTION TITLE", "Hidden-answer", "Locked-question"]) expect(html).not.toContain(hidden)
    expect(read("Digest/Digest/index.html")).toContain('<link rel="alternate" type="application/rss+xml" title="Digest · Layouts" href="/Digest/Digest/digest.xml">')
    const xml = read("Digest/Digest/digest.xml")
    expect([...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]).slice(1)).toEqual([
      "http://localhost:4321/Digest/Digest#2024-w10",
      "http://localhost:4321/Digest/Digest#2024-w09",
      "http://localhost:4321/Digest/Digest#2024-w07",
    ])
    expect(xml).toContain("<description>Planted: Why gardens</description>")
    expect(xml).not.toContain("HIDDEN")
    expect(xml).not.toContain("LOCKED")
  })

  test("the new collections have no serious or critical axe violations", async () => {
    const axeSource = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")
    for (const page of [
      "Journal/Journal/index.html",
      "Clippings/Clippings/index.html",
      "People/People/index.html",
      "Snippets/Snippets/index.html",
      "Podcast/Podcast/index.html",
      "Podcast/Pilot/index.html",
      "Courses/Courses/index.html",
      "Courses/Distributed-systems/index.html",
      "Wishlist/Wishlist/index.html",
      "Quotebook/Quotebook/index.html",
      "Quotebook/By-source/index.html",
      "Questions/Questions/index.html",
      "Questions/How-to-link/index.html",
      "Digest/Digest/index.html",
    ]) {
      const window = new Window({ url: "https://garden.example/", settings: { disableJavaScriptEvaluation: false } })
      window.document.write(read(page).replace(/<script\b[\s\S]*?<\/script>/g, ""))
      window.eval(axeSource)
      const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe
      const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
      await window.happyDOM.close()
      const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      expect({ page, found: serious.map((v) => `${v.id} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`) }).toEqual({ page, found: [] })
    }
  }, 120_000)
})
