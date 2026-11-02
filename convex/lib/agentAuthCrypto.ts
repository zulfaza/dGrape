/**
 * Token and code helpers for auth.md agent registration. High-entropy tokens
 * are stored as SHA-256 digests. A 6-digit user code has low entropy, so it
 * is stored as an HMAC with a server key: a leaked database row does not let
 * an attacker test all one million codes offline.
 */

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** A prefixed token with 256 bits of entropy, for example `clm_…`. */
export function randomToken(prefix: string) {
  return `${prefix}_${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`
}

/** A uniformly random 6-digit code. */
export function randomUserCode() {
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1))
    if (value !== undefined && value < limit)
      return String(value % 1_000_000).padStart(6, "0")
  }
}

export async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
}

/** HMAC-SHA256 of `value` with `key`, as hex. */
export async function keyedDigest(key: string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return toHex(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value))
  )
}
