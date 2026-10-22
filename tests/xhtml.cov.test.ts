import { describe, expect, test } from "bun:test"
import type { Root } from "hast"
import { toXhtml } from "../src/lib/xhtml"

describe("toXhtml", () => {
  test("void elements self-close, others close, text and attributes are escaped", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: { className: ["a", "b"], title: 'say "hi" & <go>' },
          children: [{ type: "text", value: "1 < 2 & 3 > 2" }],
        },
        { type: "element", tagName: "br", properties: {}, children: [] },
        {
          type: "element",
          tagName: "input",
          properties: { type: "checkbox", checked: true, disabled: false, value: undefined, accept: ["image/png", "image/jpeg"] },
          children: [],
        },
        { type: "element", tagName: "img", properties: { src: "a.png", srcSet: "a.png 1x, b.png 2x", width: 10 }, children: [] },
      ],
    }
    expect(toXhtml(tree)).toBe(
      '<p class="a b" title="say &quot;hi&quot; &amp; &lt;go&gt;">1 &lt; 2 &amp; 3 &gt; 2</p>' +
        "<br/>" +
        '<input type="checkbox" checked="checked" accept="image/png, image/jpeg"/>' +
        '<img src="a.png" srcset="a.png 1x, b.png 2x" width="10"/>',
    )
  })

  test("a void element that somehow has children is written out in full", () => {
    expect(toXhtml({ type: "element", tagName: "br", properties: {}, children: [{ type: "text", value: "x" }] })).toBe("<br>x</br>")
  })

  test("svg and math get their namespace unless they already say it", () => {
    expect(toXhtml({ type: "element", tagName: "svg", properties: {}, children: [] })).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(toXhtml({ type: "element", tagName: "math", properties: {}, children: [] })).toBe('<math xmlns="http://www.w3.org/1998/Math/MathML"></math>')
    expect(toXhtml({ type: "element", tagName: "svg", properties: { xmlns: "urn:own" }, children: [] })).toBe('<svg xmlns="urn:own"></svg>')
  })

  test("templates lose their content; comments, doctypes and raw HTML are dropped", () => {
    expect(toXhtml({ type: "element", tagName: "template", properties: {}, children: [{ type: "text", value: "hidden" }] })).toBe("<template></template>")
    const tree: Root = {
      type: "root",
      children: [{ type: "doctype" }, { type: "comment", value: "note" }, { type: "raw", value: "<b>raw</b>" } as never, { type: "text", value: "kept" }],
    }
    expect(toXhtml(tree)).toBe("kept")
  })
})
