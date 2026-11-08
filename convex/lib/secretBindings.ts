import { Schema } from "effect"

/**
 * The contract between Convex and the Worker for secretRef values that are
 * Cloudflare Worker secret bindings (ADR 0007). Convex sends the secretRef
 * object name; the Worker reads only the binding that this module derives
 * from it, so the endpoint cannot read other Worker secrets.
 */

/** The Worker path that resolves one secretRef binding. */
export const SECRET_BINDING_PATH = "/internal/secrets/resolve"
/** Every secretRef binding name starts with this prefix. */
export const SECRET_BINDING_PREFIX = "SECRET_REF_"
/** Bearer token that Convex sends and the Worker checks. */
export const SECRET_BINDING_TOKEN = "SECRET_BINDING_TOKEN"

const objectName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The Worker secret name for a secretRef object name, or null when the name
 * is not a server-generated UUID. Example: `SECRET_REF_0F8B…_9C1D`.
 */
export function secretBindingName(name: string): SecretBindingName | null {
  if (!objectName.test(name)) return null
  return `${SECRET_BINDING_PREFIX}${name.replaceAll("-", "_").toUpperCase()}`
}
export type SecretBindingName = `${typeof SECRET_BINDING_PREFIX}${string}`
/**
 * The Worker env that holds secretRef values. Operators add `SECRET_REF_*`
 * secrets without declaring them in cloudflare.config.ts, and `cf deploy`
 * keeps them.
 */
export type SecretBindingEnv = {
  readonly [SECRET_BINDING_TOKEN]?: string
} & Readonly<Partial<Record<SecretBindingName, string>>>

export const SecretBindingRequest = Schema.Struct({ name: Schema.String })
export const SecretBindingResponse = Schema.Union([
  Schema.Struct({ found: Schema.Literal(false) }),
  Schema.Struct({ found: Schema.Literal(true), value: Schema.String }),
])
export type SecretBindingResponse = typeof SecretBindingResponse.Type
