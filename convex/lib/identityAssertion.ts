import {
  SignJWT,
  createLocalJWKSet,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose"
import { Schema } from "effect"
import { signingKeyJwk } from "./agentAuthConfig"

/**
 * Service-signed identity assertions for auth.md (`oauth-id-jag+jwt`). This
 * service is both the issuer and the only verifier: an agent exchanges the
 * assertion at /oauth2/token for short-lived access tokens until it expires.
 */

const TYPE = "oauth-id-jag+jwt"
const ALGORITHM = "ES256"
/** How long an agent can keep getting tokens without the user. */
export const ASSERTION_LIFETIME_SECONDS = 30 * 24 * 60 * 60

type PrivateJwk = {
  kty: "EC"
  crv: "P-256"
  x: string
  y: string
  d: string
  kid: string
}

/** Any JSON object or array; the JWK members are checked one by one. */
const isJsonObject = Schema.is(Schema.ObjectKeyword)
const isKeyMember = Schema.is(Schema.NonEmptyString)
/** The `sub` claim of an assertion: the registration ID. */
const isAssertionSubject = Schema.is(Schema.String)

/** Parses AGENT_AUTH_SIGNING_KEY into a P-256 private JWK. */
function privateJwk(): PrivateJwk {
  const parsed: unknown = JSON.parse(signingKeyJwk())
  if (!isJsonObject(parsed))
    throw new Error("AGENT_AUTH_SIGNING_KEY must be a JWK object")
  const fields = new Map<string, unknown>(Object.entries(parsed))
  const field = (name: string) => {
    const value = fields.get(name)
    if (!isKeyMember(value))
      throw new Error(`AGENT_AUTH_SIGNING_KEY needs a "${name}" string`)
    return value
  }
  if (field("kty") !== "EC" || field("crv") !== "P-256")
    throw new Error("AGENT_AUTH_SIGNING_KEY must be a P-256 (ES256) key")
  return {
    kty: "EC",
    crv: "P-256",
    x: field("x"),
    y: field("y"),
    d: field("d"),
    kid: field("kid"),
  }
}

/** The public signing key, for /.well-known/jwks.json. */
export function publicJwks() {
  const { kty, crv, x, y, kid } = privateJwk()
  return {
    keys: [{ kty, crv, x, y, kid, alg: ALGORITHM, use: "sig" }],
  } satisfies { keys: JWK[] }
}

/** Signs an assertion for a claimed registration. */
export async function signAssertion(
  issuer: string,
  registrationId: string,
  email: string,
  now: number
) {
  const jwk = privateJwk()
  const key = await importJWK(jwk, ALGORITHM)
  const issuedAt = Math.floor(now / 1000)
  const expiresAt = issuedAt + ASSERTION_LIFETIME_SECONDS
  const assertion = await new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: ALGORITHM, typ: TYPE, kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setSubject(registrationId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setJti(crypto.randomUUID())
    .sign(key)
  return { assertion, expiresAt: expiresAt * 1000 }
}

/** Returns the registration ID of a valid assertion, or null. */
export async function verifyAssertion(issuer: string, assertion: string) {
  try {
    const { payload } = await jwtVerify(
      assertion,
      createLocalJWKSet(publicJwks()),
      {
        issuer,
        audience: issuer,
        typ: TYPE,
        algorithms: [ALGORITHM],
      }
    )
    return isAssertionSubject(payload.sub) ? payload.sub : null
  } catch {
    return null
  }
}
