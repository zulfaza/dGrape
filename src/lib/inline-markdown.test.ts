import { describe, expect, it } from "vitest"

import { parseInlineMarkdown } from "./inline-markdown.ts"

describe("parseInlineMarkdown", () => {
  it("parses bold, italic, and combined emphasis", () => {
    expect(
      parseInlineMarkdown("Lead **impact** with *care* and ***focus***")
    ).toEqual([
      { bold: false, italic: false, start: 0, text: "Lead " },
      { bold: true, italic: false, start: 7, text: "impact" },
      { bold: false, italic: false, start: 15, text: " with " },
      { bold: false, italic: true, start: 22, text: "care" },
      { bold: false, italic: false, start: 27, text: " and " },
      { bold: true, italic: true, start: 35, text: "focus" },
    ])
  })

  it("keeps unmatched markers as plain text", () => {
    expect(parseInlineMarkdown("Keep **literal text")).toEqual([
      { bold: false, italic: false, start: 0, text: "Keep " },
      { bold: false, italic: false, start: 5, text: "**literal text" },
    ])
  })
})
