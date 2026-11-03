import { describe, expect, it } from "vitest"
import { MAX_PREVIEW_BYTES, previewKind, readPreview } from "./artifactPreview"

describe("private file previews", () => {
  it("only accepts inert text formats, including MIME parameters", () => {
    expect(previewKind("application/json; charset=utf-8")).toBe("json")
    expect(previewKind("text/html")).toBe("html")
    expect(previewKind("image/png")).toBe("raster")
    expect(previewKind("text/csv")).toBe("text")
    for (const type of ["image/svg+xml", "application/pdf", "text/javascript"])
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

it("validates all declared raster signatures and bounds raster streams", async () => {
  const samples = [
    { mime: "image/png", bytes: [137, 80, 78, 71, 13, 10, 26, 10] },
    { mime: "image/jpeg", bytes: [255, 216, 255, 224] },
    {
      mime: "image/gif",
      bytes: Array.from(new TextEncoder().encode("GIF89a")),
    },
    {
      mime: "image/webp",
      bytes: Array.from(new TextEncoder().encode("RIFF0000WEBP")),
    },
  ]
  for (const sample of samples) {
    expect(
      await readPreview(new Response(new Uint8Array(sample.bytes)), sample.mime)
    ).toMatch(/^data:image\//)
    await expect(
      readPreview(new Response("<html>"), sample.mime)
    ).rejects.toThrow("signature")
  }
  await expect(
    readPreview(new Response(new Uint8Array(1024 * 1024 + 1)), "image/png")
  ).rejects.toThrow("too large")
})
