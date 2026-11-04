import { Schema } from "effect"

/**
 * Wire contract of the agent artifact links. The HTTP routes
 * (convex/http.ts) decode with this schema, and the MCP tools
 * (src/mcp/server.ts) use it for parameters. It matches bindingFields in
 * convex/lib/artifactBindingDomain.ts, with IDs as strings that
 * convex/artifactBindings.ts checks.
 */

export const LinkInput = Schema.Struct({
  recordId: Schema.String,
  artifactId: Schema.String,
  relation: Schema.Literals(["attachment", "report", "image"]),
})
