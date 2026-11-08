import { Option, Schema } from "effect"

/**
 * The pinned trust registry for agent-verified auth.md registration. Only an
 * agent provider in this list can register an agent with an identity
 * assertion (ID-JAG). The list comes from the AGENT_AUTH_TRUSTED_ISSUERS
 * environment variable and is empty when the variable is not set. This
 * service never trusts an issuer URL that a request names.
 *
 * The variable is a JSON array:
 *
 * ```json
 * [{ "issuer": "https://agents.example.com",
 *    "display_name": "Example Agents",
 *    "jwks_uri": "https://agents.example.com/.well-known/jwks.json" }]
 * ```
 *
 * - `issuer`: the exact `iss` claim of the provider's assertions.
 * - `display_name`: the name the claim page shows. A provider cannot set it.
 * - `jwks_uri`: the provider's signing keys. It is pinned here, so a
 *   provider cannot point this service to other keys.
 * - `client_id` (optional): the exact `client_id` claim. The default is the
 *   issuer.
 */

export type TrustedIssuer = {
  issuer: string
  displayName: string
  jwksUri: string
  clientId: string
}

const Entry = Schema.Struct({
  issuer: Schema.NonEmptyString,
  display_name: Schema.NonEmptyString,
  jwks_uri: Schema.NonEmptyString,
  client_id: Schema.optionalKey(Schema.NonEmptyString),
})

const decodeRegistry = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Entry))
)

/** An https URL with no credentials, query, or fragment, or null. */
function httpsUrl(value: string): URL | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    return null
  return url
}

/**
 * Parses the registry. A malformed value throws, so a half-configured
 * deployment refuses agent-verified registration instead of trusting a
 * wrong issuer.
 */
export function parseTrustedIssuers(
  raw: string | undefined
): ReadonlyArray<TrustedIssuer> {
  if (raw === undefined || raw.trim() === "") return []
  const decoded = decodeRegistry(raw)
  if (Option.isNone(decoded))
    throw new Error(
      "AGENT_AUTH_TRUSTED_ISSUERS must be a JSON array of { issuer, display_name, jwks_uri, client_id? }"
    )
  const seen = new Set<string>()
  return decoded.value.map((entry) => {
    if (!httpsUrl(entry.issuer))
      throw new Error(`Trusted issuer ${entry.issuer} must be an https URL`)
    if (!httpsUrl(entry.jwks_uri))
      throw new Error(`jwks_uri of ${entry.issuer} must be an https URL`)
    if (seen.has(entry.issuer))
      throw new Error(`Trusted issuer ${entry.issuer} is listed twice`)
    seen.add(entry.issuer)
    return {
      issuer: entry.issuer,
      displayName: entry.display_name,
      jwksUri: entry.jwks_uri,
      clientId: entry.client_id ?? entry.issuer,
    }
  })
}

/** The configured trusted issuers. Empty unless an operator adds one. */
export function trustedIssuers() {
  return parseTrustedIssuers(process.env.AGENT_AUTH_TRUSTED_ISSUERS)
}

/** The trusted issuer whose `issuer` is exactly `iss`, or null. */
export function findTrustedIssuer(iss: string) {
  return trustedIssuers().find((entry) => entry.issuer === iss) ?? null
}
