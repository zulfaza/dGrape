import { createFileRoute } from "@tanstack/react-router"
import { serveMcpResourceMetadata } from "@/mcp/discovery"

// The RFC 9728 fallback path at the host root.
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: { handlers: { GET: serveMcpResourceMetadata } },
})
