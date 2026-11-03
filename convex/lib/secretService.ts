import { Context, Effect, Layer, Schema, Redacted } from "effect"
import { WorkOS, NotFoundException } from "@workos-vault/node"

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
export function configuredSecretLayer() {
  const key = process.env.SECRET_VAULT_WORKOS_API_KEY
  if (process.env.SECRET_VAULT_PROVIDER === "workos" && key)
    return workosSecretLayer(key)
  const unavailable = () => Effect.fail(failure())
  return Layer.succeed(SecretService, {
    find: unavailable,
    put: unavailable,
    remove: unavailable,
  })
}
