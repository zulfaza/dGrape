import { defineApp } from "convex/server"
import r2 from "@convex-dev/r2/convex.config.js"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import { v } from "convex/values"

const app = defineApp({
  env: {
    // Agent providers trusted for agent-verified auth.md registration, as a
    // JSON array. Unset means none. See convex/lib/trustedIssuers.ts.
    AGENT_AUTH_TRUSTED_ISSUERS: v.optional(v.string()),
  },
})
// Private artifact files in Cloudflare R2 (ADR 0003). Configured with the
// R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY env vars.
app.use(r2)
// Per-connection request budgets for connector fetches.
app.use(rateLimiter)

export default app
