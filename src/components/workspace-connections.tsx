import { Schema, Option } from "effect"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"
import type { UsePaginatedQueryReturnType } from "convex/react"
import { useState } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"
import { useAccessToken } from "@workos/authkit-tanstack-react-start/client"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Badge } from "./ui/badge"

type Mutation<Ref extends FunctionReference<"mutation">> = (
  args: FunctionArgs<Ref>
) => Promise<FunctionReturnType<Ref>>

/** The view receives list state and commands from the authenticated client. */
export interface WorkspaceConnectionService {
  secrets: UsePaginatedQueryReturnType<typeof api.secrets.list>
  connections: UsePaginatedQueryReturnType<typeof api.connectors.list>
  prepare: Mutation<typeof api.secrets.prepare>
  rotate: Mutation<typeof api.secrets.rotate>
  beginDelete: Mutation<typeof api.secrets.beginDelete>
  createConnection: Mutation<typeof api.connectors.create>
  createGithubConnection: Mutation<typeof api.connectors.createGithub>
  removeConnection: Mutation<typeof api.connectors.remove>
  update: (
    id: Id<"secretRefs">,
    revision: number,
    value: string
  ) => Promise<void>
}

const credentialForm = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
})
const connectionForm = Schema.Struct({
  label: Schema.String,
  origin: Schema.String,
  path: Schema.String,
  fields: Schema.String,
})

/** Credentials go only to the authenticated HTTP ingress, never an action. */
export function WorkspaceConnections({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const secrets = usePaginatedQuery(
    api.secrets.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const connections = usePaginatedQuery(
    api.connectors.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const prepare = useMutation(api.secrets.prepare)
  const rotate = useMutation(api.secrets.rotate)
  const beginDelete = useMutation(api.secrets.beginDelete)
  const createConnection = useMutation(api.connectors.create)
  const createGithubConnection = useMutation(api.connectors.createGithub)
  const removeConnection = useMutation(api.connectors.remove)
  const { getAccessToken } = useAccessToken()
  async function update(id: Id<"secretRefs">, revision: number, value: string) {
    const token = await getAccessToken()
    const site = Schema.decodeUnknownSync(
      Schema.String.check(
        Schema.makeFilter(
          (value) =>
            value.startsWith("https://") ||
            value.startsWith("http://127.0.0.1:")
        )
      )
    )(import.meta.env.VITE_CONVEX_SITE_URL)
    if (!token) throw new Error("Settings unavailable")
    const response = await fetch(`${site}/settings/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secretRef: id, revision, value }),
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Save failed")
  }
  return (
    <WorkspaceConnectionsView
      workspaceId={workspaceId}
      service={{
        secrets,
        connections,
        prepare,
        rotate,
        beginDelete,
        createConnection,
        createGithubConnection,
        removeConnection,
        update,
      }}
    />
  )
}

export function WorkspaceConnectionsView({
  workspaceId,
  service,
}: {
  workspaceId: Id<"workspaces">
  service: WorkspaceConnectionService
}) {
  const {
    secrets,
    connections,
    prepare,
    rotate,
    beginDelete,
    createConnection,
    createGithubConnection,
    removeConnection,
    update,
  } = service
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Id<"secretRefs"> | null>(null)
  async function perform(task: () => Promise<void>) {
    setBusy(true)
    setMessage("")
    try {
      await task()
      setMessage("Settings saved")
    } catch {
      setMessage(
        "Could not save settings. Check access and configuration, then retry."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      aria-label="Connections"
    >
      <h2 className="text-xl font-semibold">Connections</h2>
      <p className="text-sm text-muted-foreground">
        Enter credentials here. Agents use reference IDs. Deleting a stored
        credential does not revoke the token at its source.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const data = new FormData(form)
          const parsed = Schema.decodeUnknownOption(credentialForm)({
            label: data.get("label"),
            value: data.get("credential"),
          })
          form.reset()
          if (Option.isNone(parsed)) return
          const { label, value } = parsed.value
          void perform(async () => {
            const id = await prepare({
              workspaceId,
              label,
              private: data.get("private") === "on",
            })
            await update(id, 1, value)
          })
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="secret-label">Credential label</FieldLabel>
            <Input id="secret-label" name="label" required maxLength={80} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-credential">Credential</FieldLabel>
            <Input
              id="new-credential"
              name="credential"
              type="password"
              autoComplete="new-password"
              required
              maxLength={8192}
            />
          </Field>
          <Field>
            <FieldLabel>
              <input name="private" type="checkbox" defaultChecked /> Private to
              me
            </FieldLabel>
          </Field>
          <Button disabled={busy} type="submit">
            Store credential
          </Button>
        </FieldGroup>
      </form>
      {secrets.status === "LoadingFirstPage" && (
        <p role="status">Loading credentials…</p>
      )}
      {secrets.results.map((secret) => (
        <div key={secret.id} className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <span>{secret.label}</span>
            <Badge variant="secondary">{secret.status}</Badge>
          </div>
          <code className="text-xs break-all">{secret.id}</code>
          {secret.canManage && secret.status === "ready" && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setSelected(secret.id)}
              >
                Use in connection
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void perform(async () => {
                    await rotate({
                      secretRef: secret.id,
                      revision: secret.revision,
                    })
                  })
                }
              >
                Rotate
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void perform(async () => {
                    await beginDelete({
                      secretRef: secret.id,
                      revision: secret.revision,
                    })
                    await update(secret.id, secret.revision, "")
                  })
                }
              >
                Delete stored credential
              </Button>
            </div>
          )}
          {secret.canManage && secret.status === "pending" && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void perform(async () => {
                  await beginDelete({
                    secretRef: secret.id,
                    revision: secret.revision,
                  })
                  await update(secret.id, secret.revision, "")
                })
              }
            >
              Cancel pending credential
            </Button>
          )}
          {secret.canManage && secret.status === "pending" && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const value = Schema.decodeUnknownOption(Schema.String)(
                  new FormData(form).get("credential")
                )
                form.reset()
                if (Option.isSome(value))
                  void perform(() =>
                    update(secret.id, secret.revision, value.value)
                  )
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`credential-${secret.id}`}>
                    Replacement credential (leave empty to reconcile)
                  </FieldLabel>
                  <Input
                    id={`credential-${secret.id}`}
                    name="credential"
                    type="password"
                    autoComplete="new-password"
                    maxLength={8192}
                  />
                </Field>
                <Button disabled={busy}>Save or reconcile</Button>
              </FieldGroup>
            </form>
          )}
          {secret.canManage && secret.status === "deleting" && (
            <Button
              disabled={busy}
              onClick={() =>
                void perform(() => update(secret.id, secret.revision, ""))
              }
            >
              Retry deletion
            </Button>
          )}
        </div>
      ))}
      {(secrets.status === "CanLoadMore" ||
        secrets.status === "LoadingMore") && (
        <Button
          type="button"
          variant="outline"
          disabled={secrets.status === "LoadingMore"}
          onClick={() => secrets.loadMore(20)}
        >
          {secrets.status === "LoadingMore"
            ? "Loading credentials…"
            : "Load more credentials"}
        </Button>
      )}
      {selected && (
        <form
          className="border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const parsed = Schema.decodeUnknownOption(connectionForm)({
              label: data.get("label"),
              origin: data.get("origin"),
              path: data.get("path"),
              fields: data.get("fields"),
            })
            if (Option.isNone(parsed)) return
            const { label, origin, path, fields } = parsed.value
            void perform(async () => {
              await createConnection({
                workspaceId,
                secretRef: selected,
                label,
                origin,
                routes: [
                  {
                    path,
                    method: "GET",
                    queryKeys: ["cursor"],
                    fields: fields.split(",").map((f) => f.trim()),
                  },
                ],
              })
              setSelected(null)
            })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="connection-label">
                Connection label
              </FieldLabel>
              <Input id="connection-label" name="label" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="connection-origin">
                Approved HTTPS origin
              </FieldLabel>
              <Input
                id="connection-origin"
                name="origin"
                placeholder="https://api.example.com"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="connection-path">Exact route</FieldLabel>
              <Input
                id="connection-path"
                name="path"
                placeholder="/items"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="connection-fields">
                Safe output fields, separated by commas
              </FieldLabel>
              <Input
                id="connection-fields"
                name="fields"
                placeholder="id,name,total"
                required
              />
            </Field>
            <Button disabled={busy}>Create GET connection</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await createGithubConnection({
                    workspaceId,
                    secretRef: selected,
                    label: "GitHub",
                  })
                  setSelected(null)
                })
              }
            >
              Create GitHub read-only connection
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </FieldGroup>
        </form>
      )}
      {connections.results.map((connection) => (
        <div className="flex flex-col gap-2 border-t pt-3" key={connection.id}>
          <strong>{connection.label}</strong>
          <code className="text-xs break-all">{connection.id}</code>
          <p className="text-sm">
            {connection.kind === "github"
              ? `GitHub reads: ${connection.reads.join(", ")}`
              : `${connection.origin}${connection.routes[0]?.path ?? ""}`}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await removeConnection({ connectionId: connection.id })
              })
            }
          >
            Remove connection
          </Button>
        </div>
      ))}
      {connections.status === "LoadingFirstPage" && (
        <p role="status">Loading connections…</p>
      )}
      {(connections.status === "CanLoadMore" ||
        connections.status === "LoadingMore") && (
        <Button
          type="button"
          variant="outline"
          disabled={connections.status === "LoadingMore"}
          onClick={() => connections.loadMore(20)}
        >
          {connections.status === "LoadingMore"
            ? "Loading connections…"
            : "Load more connections"}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
