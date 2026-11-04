import { Schema } from "effect"

/**
 * Wire contract of the agent collection schema changes that go through
 * convex/lib/agentRoute.ts. The HTTP route (convex/http.ts) decodes with
 * these schemas, and the MCP tool (src/mcp/server.ts) uses them for
 * parameters and results.
 */

export const RenameFieldInput = Schema.Struct({
  collectionId: Schema.String,
  fieldId: Schema.String,
  label: Schema.String,
  expectedVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** See convex/lib/operations.ts. */
  idempotencyKey: Schema.optionalKey(Schema.String),
})

export const RenamedField = Schema.Struct({ version: Schema.Number })
