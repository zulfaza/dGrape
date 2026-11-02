/**
 * Server configuration for auth.md agent registration, read from Convex
 * environment variables. Each reader fails with a clear message when its
 * variable is missing, so a half-configured deployment refuses registration
 * instead of issuing unverifiable codes or links.
 */

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Set the ${name} environment variable`)
  return value
}

/** The app origin that serves the claim page, for example https://dfe.makarima.dev. */
export function appOrigin() {
  return new URL(required("APP_ORIGIN")).origin
}

/** The HMAC key for user codes. Use at least 32 random bytes. */
export function codeKey() {
  return required("AGENT_AUTH_CODE_KEY")
}

/** The WorkOS API key, used to read the verified email of a signed-in user. */
export function workosApiKey() {
  return required("WORKOS_API_KEY")
}

/**
 * The ES256 private key that signs identity assertions, as a JWK JSON
 * string with a `kid`. Generate one with scripts/agent-auth-signing-key.mjs.
 */
export function signingKeyJwk() {
  return required("AGENT_AUTH_SIGNING_KEY")
}

/**
 * The authorization server issuer: this deployment's HTTP origin. Derived
 * from configuration, never from request headers.
 */
export function issuer() {
  return new URL(required("CONVEX_SITE_URL")).origin
}
