import { Effect, Redacted } from "effect"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { SecretService, configuredSecretLayer } from "./lib/secretService"

const headers = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
export const options = httpAction(async () => new Response(null, { headers }))
/** Bearer-authenticated HTTPS ingress; request bodies never enter durable args. */
export const save = httpAction(async (ctx, request) => {
  try {
    if (!(await ctx.auth.getUserIdentity()))
      return new Response(null, { status: 401, headers })
    const reader = request.body?.getReader()
    if (!reader) throw new Error("Invalid request")
    let text = ""
    let size = 0
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 20000) throw new Error("Invalid request")
        text += decoder.decode(part.value, { stream: true })
      }
    } finally {
      await reader.cancel()
    }
    const body: unknown = JSON.parse(text + decoder.decode())
    if (
      typeof body !== "object" ||
      body === null ||
      !("secretRef" in body) ||
      typeof body.secretRef !== "string" ||
      !("value" in body) ||
      typeof body.value !== "string" ||
      body.value.length > 8192 ||
      !("revision" in body) ||
      !Number.isSafeInteger(body.revision)
    )
      throw new Error("Invalid request")
    // Normalize IDs through a query so callers cannot forge typed IDs.
    const credentialValue = body.value
    const reference = await ctx.runQuery(internal.secretSettingsLookup.lookup, {
      rawId: body.secretRef,
    })
    const secret = await ctx.runQuery(internal.secrets.metadata, {
      secretRef: reference,
    })
    if (secret.revision !== body.revision) throw new Error("Secret changed")
    const scope = {
      workspaceId: secret.workspaceId,
      userId: secret.owner.kind === "user" ? secret.owner.userId : null,
    }
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* SecretService
        if (secret.state.kind === "pending") {
          yield* Effect.tryPromise(() =>
            ctx.runMutation(internal.secrets.claimWrite, {
              secretRef: reference,
              revision: secret.revision,
            })
          )
          const objectId =
            credentialValue.length > 0
              ? yield* store.put(
                  scope,
                  secret.state.name,
                  Redacted.make(credentialValue)
                )
              : (yield* store.find(scope, secret.state.name))?.id
          if (!objectId) throw new Error("Enter a credential")
          if (secret.state.previousName)
            yield* store.remove(scope, secret.state.previousName)
          yield* Effect.tryPromise(() =>
            ctx.runMutation(internal.secrets.finish, {
              secretRef: reference,
              revision: secret.revision,
              name: secret.state.kind === "pending" ? secret.state.name : "",
              objectId,
            })
          )
        } else if (secret.state.kind === "deleting") {
          for (const name of secret.state.names)
            yield* store.remove(scope, name)
          yield* Effect.tryPromise(() =>
            ctx.runMutation(internal.secrets.finishDelete, {
              secretRef: reference,
              revision: secret.revision,
            })
          )
        }
      }).pipe(Effect.provide(configuredSecretLayer()))
    )
    return Response.json({ status: "saved" }, { headers })
  } catch {
    return Response.json(
      { error: "Could not update the credential. Retry from settings." },
      { status: 400, headers }
    )
  }
})
