import { OFFERED_SCOPES } from "../../convex/lib/agentScope"

/**
 * RFC 9728 discovery for the MCP server. The Convex deployment is the
 * authorization server (see convex/lib/agentAuthDiscovery.ts), and its
 * access tokens are accepted here unchanged.
 */

const authorizationServer = new URL(
  import.meta.env.VITE_CONVEX_SITE_URL ?? "http://localhost"
).origin

/** Where a client finds the metadata of the MCP server at `origin`. */
export function metadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource/mcp`
}

export function mcpResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    resource_name: "DFE MCP",
    authorization_servers: [authorizationServer],
    scopes_supported: OFFERED_SCOPES,
    bearer_methods_supported: ["header"],
  }
}

/** Serves the metadata for the origin the client used. */
export function serveMcpResourceMetadata({ request }: { request: Request }) {
  return Response.json(mcpResourceMetadata(new URL(request.url).origin), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
