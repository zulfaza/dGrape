/** Preview limits keep private bytes bounded in both Convex and the browser. */
export const MAX_PREVIEW_BYTES = 512 * 1024

export const MAX_RASTER_BYTES = 1024 * 1024

export function previewKind(contentType: string) {
  const mime = contentType.split(";")[0]?.trim().toLowerCase()
  if (mime === "text/html") return "html"
  if (
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime ?? "")
  )
    return "raster"
  if (mime === "application/json" || mime === "text/json") return "json"
  if (mime === "text/plain" || mime === "text/csv" || mime === "text/markdown")
    return "text"
  return "unsupported"
}

export async function readPreview(
  response: Response,
  contentType = "text/plain"
): Promise<string> {
  if (!response.ok || !response.body) throw new Error("File is unavailable")
  const limit =
    previewKind(contentType) === "raster" ? MAX_RASTER_BYTES : MAX_PREVIEW_BYTES
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) throw new Error("File is too large to preview")
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (previewKind(contentType) === "raster") {
    const mime = contentType.split(";")[0]?.trim().toLowerCase()
    const starts = (signature: number[]) =>
      signature.every((byte, i) => bytes[i] === byte)
    const ascii = (start: number, end: number) =>
      String.fromCharCode(...bytes.slice(start, end))
    const valid =
      (mime === "image/png" && starts([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (mime === "image/jpeg" && starts([255, 216, 255])) ||
      (mime === "image/gif" && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) ||
      (mime === "image/webp" &&
        ascii(0, 4) === "RIFF" &&
        ascii(8, 12) === "WEBP")
    if (!valid) throw new Error("Invalid raster signature")
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return `data:${mime};base64,${btoa(binary)}`
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (previewKind(contentType) === "json") JSON.parse(text)
  return text
}
