import { createFileRoute } from "@tanstack/react-router"
import { HttpRouter } from "effect/http"
import { makeMcpApp } from "@/mcp/server"

// Built once at module scope, as Effect requires on Cloudflare Workers.
const mcp = HttpRouter.toWebHandler(
  makeMcpApp(import.meta.env.VITE_CONVEX_SITE_URL ?? ""),
  { disableLogger: true }
)

const handle = ({ request }: { request: Request }) => mcp.handler(request)

export const Route = createFileRoute("/mcp")({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
