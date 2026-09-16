/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { serializeContentEditableText } from "./contentEditableText.js";

function content(html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("serializeContentEditableText", () => {
  it("preserves text-node, block, and br visual line boundaries as LF", () => {
    expect(
      serializeContentEditableText(
        content("first<div>second<br>third</div><p>fourth</p>"),
      ),
    ).toBe("first\nsecond\nthird\nfourth");
  });

  it("preserves a line boundary from a block to following inline content", () => {
    expect(
      serializeContentEditableText(
        content("<div>first</div><span>second</span>"),
      ),
    ).toBe("first\nsecond");
  });

  it("normalizes CRLF and preserves blank and trailing lines", () => {
    expect(
      serializeContentEditableText(
        content(
          "<div>first\r\nsecond</div><div><br></div><div>third</div><br>",
        ),
      ),
    ).toBe("first\nsecond\n\nthird\n");
  });
});
