import { describe, expect, it } from "vitest"
import { MAX_PREVIEW_BYTES, previewKind, readPreview } from "./artifactPreview"

describe("private file previews", () => {
  it("only accepts inert text formats, including MIME parameters", () => {
    expect(previewKind("application/json; charset=utf-8")).toBe("json")
    expect(previewKind("text/csv")).toBe("text")
    for (const type of [
      "text/html",
      "image/svg+xml",
      "application/pdf",
      "text/javascript",
    ])
      expect(previewKind(type)).toBe("unsupported")
  })
  it("validates JSON without expanding nested input", async () => {
    const text = "[".repeat(1000) + "0" + "]".repeat(1000)
    expect(await readPreview(new Response(text), "application/json")).toBe(text)
    await expect(
      readPreview(new Response("invalid"), "application/json")
    ).rejects.toThrow(/JSON/)
  })
  it("keeps uploaded markup as text", async () => {
    const text = '<script>fetch("https://example.com")</script>'
    expect(await readPreview(new Response(text))).toBe(text)
  })
  it("rejects oversized streams even without a Content-Length header", async () => {
    const response = new Response(new Uint8Array(MAX_PREVIEW_BYTES + 1))
    await expect(readPreview(response)).rejects.toThrow("too large")
  })
  it("rejects unavailable files and malformed UTF-8", async () => {
    await expect(
      readPreview(new Response("missing", { status: 404 }))
    ).rejects.toThrow("unavailable")
    await expect(
      readPreview(new Response(new Uint8Array([0xff])))
    ).rejects.toThrow(/encoded data/)
  })
})
