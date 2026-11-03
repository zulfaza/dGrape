/** Preview limits keep private bytes bounded in both Convex and the browser. */
export const MAX_PREVIEW_BYTES = 512 * 1024

export function previewKind(contentType: string) {
  const mime = contentType.split(";")[0]?.trim().toLowerCase()
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
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_PREVIEW_BYTES)
        throw new Error("File is too large to preview")
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
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (previewKind(contentType) === "json") JSON.parse(text)
  return text
}
