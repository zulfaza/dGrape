import { Context, Effect, Layer, Schema, Redacted } from "effect"
import { WorkOS, NotFoundException } from "@workos-vault/node"
import {
  SECRET_BINDING_PATH,
  SecretBindingResponse,
  secretBindingName,
} from "./secretBindings"

export class SecretFailure extends Schema.TaggedError<SecretFailure>()(
  "SecretFailure",
  { message: Schema.String }
) {}
export type VaultObject = { id: string; value: Redacted.Redacted<string> }
export type SecretScope = { workspaceId: string; userId: string | null }
export interface SecretStore {
  find: (
    scope: SecretScope,
    name: string
  ) => Effect.Effect<VaultObject | null, SecretFailure>
  put: (
    scope: SecretScope,
    name: string,
    value: Redacted.Redacted<string>
  ) => Effect.Effect<string, SecretFailure>
  remove: (
    scope: SecretScope,
    name: string
  ) => Effect.Effect<void, SecretFailure>
}
/** Plaintext remains inside the HTTP handler or connector execution. */
export class SecretService extends Context.Service<
  SecretService,
  SecretStore
>()("dfe/SecretService") {}
const failure = () =>
  new SecretFailure({ message: "Secret storage is unavailable" })

/** Opt-in adapter. No API calls occur until an operator enables this provider. */
export function workosSecretLayer(apiKey: string) {
  const vault = new WorkOS(apiKey, { timeout: 10000, maxRetries: 0 }).vault
  const context = (scope: SecretScope) => {
    if (scope.userId === null) return { workspace_id: scope.workspaceId }
    return { workspace_id: scope.workspaceId, user_id: scope.userId }
  }
  const find: SecretStore["find"] = (scope, name) =>
    Effect.tryPromise({
      try: async () => {
        try {
          const object = await vault.readObjectByName(name)
          const expected = context(scope)
          for (const [key, value] of Object.entries(expected)) {
            if (object.metadata.context[key] !== value) throw failure()
          }
          const value = Schema.decodeUnknownSync(Schema.String)(object.value)
          return { id: object.id, value: Redacted.make(value) }
        } catch (error) {
          if (error instanceof NotFoundException) return null
          throw failure()
        }
      },
      catch: failure,
    })
  return Layer.succeed(SecretService, {
    find,
    put: (scope, name, value) =>
      Effect.gen(function* () {
        const existing = yield* find(scope, name)
        if (existing) return existing.id
        return yield* Effect.tryPromise({
          try: async () =>
            (
              await vault.createObject({
                name,
                value: Redacted.value(value),
                context: context(scope),
              })
            ).id,
          catch: failure,
        })
      }),
    remove: (scope, name) =>
      Effect.gen(function* () {
        const object = yield* find(scope, name)
        if (object)
          yield* Effect.tryPromise({
            try: () => vault.deleteObject({ id: object.id }),
            catch: failure,
          })
      }),
  })
}
/**
 * Reads secretRef values from Cloudflare Worker secret bindings through the
 * Worker at `origin` (ADR 0007). An operator adds and deletes each
 * `SECRET_REF_*` binding, so this adapter cannot write: `put` fails, and
 * `remove` succeeds only after the operator deleted the binding.
 */
export function cloudflareSecretLayer(
  origin: string,
  token: string,
  transport: typeof fetch = fetch
) {
  const endpoint = new URL(SECRET_BINDING_PATH, origin)
  const find: SecretStore["find"] = (_scope, name) => {
    const binding = secretBindingName(name)
    if (binding === null) return Effect.fail(failure())
    return Effect.tryPromise({
      try: async () => {
        const response = await transport(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) throw failure()
        const body = Schema.decodeUnknownSync(SecretBindingResponse)(
          await response.json()
        )
        if (!body.found) return null
        return { id: binding, value: Redacted.make(body.value) }
      },
      catch: failure,
    })
  }
  return Layer.succeed(SecretService, {
    find,
    put: () =>
      Effect.fail(
        new SecretFailure({
          message: "Add the credential as a Cloudflare Worker secret",
        })
      ),
    remove: (scope, name) =>
      Effect.gen(function* () {
        if (yield* find(scope, name))
          return yield* Effect.fail(
            new SecretFailure({ message: "Delete the Worker secret first" })
          )
      }),
  })
}
/** The Worker origin. HTTP is accepted only for a local Worker. */
function workerOrigin(value: string | undefined) {
  if (!value || !URL.canParse(value)) return null
  const url = new URL(value)
  const local = ["127.0.0.1", "localhost"].includes(url.hostname)
  if (url.protocol === "https:" || (url.protocol === "http:" && local))
    return url.origin
  return null
}
/**
 * `SECRET_VAULT_PROVIDER` selects the adapter. `cloudflare` needs
 * `APP_ORIGIN` (the Worker) and `SECRET_BINDING_TOKEN`. Any other or
 * incomplete setting gives a service where every call fails.
 */
export function configuredSecretLayer() {
  const key = process.env.SECRET_VAULT_WORKOS_API_KEY
  const bindingToken = process.env.SECRET_BINDING_TOKEN
  const origin = workerOrigin(process.env.APP_ORIGIN)
  switch (process.env.SECRET_VAULT_PROVIDER) {
    case "cloudflare":
      if (origin && bindingToken)
        return cloudflareSecretLayer(origin, bindingToken)
      break
    case "workos":
      if (key) return workosSecretLayer(key)
  }
  const unavailable = () => Effect.fail(failure())
  return Layer.succeed(SecretService, {
    find: unavailable,
    put: unavailable,
    remove: unavailable,
  })
}
