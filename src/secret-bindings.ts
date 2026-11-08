/// <reference types="@cloudflare/workers-types" />
import { Option, Schema } from "effect"
import {
  SECRET_BINDING_TOKEN,
  SecretBindingRequest,
  secretBindingName,
  type SecretBindingEnv,
  type SecretBindingResponse,
} from "../convex/lib/secretBindings"

const headers = { "Cache-Control": "no-store" }
const MAX_BODY_BYTES = 1024

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
/** Compares digests, so the time does not depend on the token's prefix. */
async function authorized(request: Request, env: SecretBindingEnv) {
  const token = env[SECRET_BINDING_TOKEN]
  if (token === undefined || token.length < 32) return false
  const supplied = request.headers.get("Authorization") ?? ""
  return (await digest(supplied)) === (await digest(`Bearer ${token}`))
}
async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let text = ""
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY_BYTES) return null
      text += decoder.decode(part.value, { stream: true })
    }
  } finally {
    await reader.cancel()
  }
  return text + decoder.decode()
}

/**
 * Returns the value of one `SECRET_REF_*` Worker secret to Convex. Only
 * Convex holds the bearer token. Convex checks membership, grants and
 * lifecycle state before it asks; this endpoint only maps a name to a value.
 */
export async function resolveSecretBinding(
  request: Request,
  env: SecretBindingEnv
) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers })
  if (!(await authorized(request, env)))
    return new Response(null, { status: 401, headers })
  const body = Schema.decodeUnknownOption(
    Schema.fromJsonString(SecretBindingRequest)
  )(await readBody(request))
  const binding = Option.isSome(body)
    ? secretBindingName(body.value.name)
    : null
  if (binding === null) return new Response(null, { status: 400, headers })
  const value = env[binding]
  const result: SecretBindingResponse = value
    ? { found: true, value }
    : { found: false }
  return Response.json(result, { headers })
}
