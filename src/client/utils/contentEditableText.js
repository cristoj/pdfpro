/**
 * Convert a contentEditable element's visual line structure to plain text.
 *
 * @param {HTMLElement} element
 * @returns {string}
 */
export function serializeContentEditableText(element) {
  let text = "";
  const blockTags = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DIV",
    "DL",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "UL",
  ]);

  const appendLineBreak = () => {
    if (!text.endsWith("\n")) text += "\n";
  };

  const serializeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue.replace(/\r\n?/g, "\n");
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }

    const isBlock = blockTags.has(node.tagName);
    if (isBlock && text) appendLineBreak();

    const startLength = text.length;
    node.childNodes.forEach(serializeNode);

    const next = node.nextSibling;
    if (
      isBlock &&
      next &&
      (text.length === startLength ||
        next.nodeType === Node.TEXT_NODE ||
        (next.nodeType === Node.ELEMENT_NODE &&
          next.tagName !== "BR" &&
          !blockTags.has(next.tagName)))
    ) {
      appendLineBreak();
    }
  };

  element.childNodes.forEach(serializeNode);
  return text;
}
