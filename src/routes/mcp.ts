import { createFileRoute } from "@tanstack/react-router"
import { HttpRouter } from "effect/http"
import { metadataUrl } from "@/mcp/discovery"
import { makeMcpApp } from "@/mcp/server"

// Built once at module scope, as Effect requires on Cloudflare Workers.
const mcp = HttpRouter.toWebHandler(
  makeMcpApp(import.meta.env.VITE_CONVEX_SITE_URL ?? ""),
  { disableLogger: true }
)

/** Adds the RFC 9728 discovery hint to 401 responses. */
async function handle({ request }: { request: Request }) {
  const response = await mcp.handler(request)
  if (response.status !== 401) return response
  const headers = new Headers(response.headers)
  headers.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${metadataUrl(new URL(request.url).origin)}"`
  )
  return new Response(response.body, { status: 401, headers })
}

export const Route = createFileRoute("/mcp")({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
