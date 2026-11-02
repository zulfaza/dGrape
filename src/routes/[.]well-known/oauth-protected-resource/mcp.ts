import { createFileRoute } from "@tanstack/react-router"
import { serveMcpResourceMetadata } from "@/mcp/discovery"

// RFC 9728 path for the resource at /mcp.
export const Route = createFileRoute(
  "/.well-known/oauth-protected-resource/mcp"
)({
  server: { handlers: { GET: serveMcpResourceMetadata } },
})
