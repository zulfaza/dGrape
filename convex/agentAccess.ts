import { v } from "convex/values"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireUserId } from "./lib/auth"

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
}

/** Only this SHA-256 digest is stored; the raw credential is shown once. */
export async function digestToken(token: string) {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  )
}
export const create = action({
  args: { workspaceId: v.id("workspaces"), days: v.number() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const owner = await requireUserId(ctx)
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)))
    await ctx.runMutation(internal.agentGrants.insert, {
      ...args,
      owner,
      digest: await digestToken(token),
    })
    return token
  },
})
