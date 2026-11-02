// Prints a new ES256 private JWK for the AGENT_AUTH_SIGNING_KEY Convex
// environment variable. Usage:
//   npx convex env set AGENT_AUTH_SIGNING_KEY "$(node scripts/agent-auth-signing-key.mjs)"
import { exportJWK, generateKeyPair } from "jose"

const { privateKey } = await generateKeyPair("ES256", { extractable: true })
const jwk = await exportJWK(privateKey)
process.stdout.write(
  JSON.stringify({
    ...jwk,
    alg: "ES256",
    use: "sig",
    kid: `dfe-${new Date().toISOString().slice(0, 10)}`,
  })
)
