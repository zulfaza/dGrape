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
import { Checkbox } from "./ui/checkbox"
import { Label } from "./ui/label"
import { toast } from "./ui/toast"
import { ConfirmButton } from "./confirm-dialog"
import { CopyButton } from "./copy-button"
import { LoadingRows } from "@/components/loading-rows"

/** What each credential state means to the person who manages it. */
const SECRET_STATUS = {
  pending: { label: "Not saved yet", variant: "outline" },
  ready: { label: "Ready", variant: "secondary" },
  deleting: { label: "Deleting", variant: "outline" },
  deleted: { label: "Deleted", variant: "outline" },
} as const satisfies Record<
  WorkspaceConnectionService["secrets"]["results"][number]["status"],
  { label: string; variant: "outline" | "secondary" }
>

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
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Id<"secretRefs"> | null>(null)
  /** Runs one change and reports it in a toast. Returns true on success. */
  async function perform(
    task: () => Promise<void>,
    done: string,
    failed: string
  ): Promise<boolean> {
    setBusy(true)
    try {
      await task()
      toast.success(done)
      return true
    } catch {
      toast.error(failed)
      return false
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
        Store API keys for your connections. Agents see only the reference ID,
        never the key.
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
          if (Option.isNone(parsed)) return
          const { label, value } = parsed.value
          void perform(
            async () => {
              const id = await prepare({
                workspaceId,
                label,
                private: data.get("private") === "on",
              })
              await update(id, 1, value)
            },
            "Credential stored",
            "Could not store the credential. Try again."
          ).then((stored) => {
            if (stored) form.reset()
          })
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="secret-label">Name</FieldLabel>
            <Input
              id="secret-label"
              name="label"
              required
              maxLength={80}
              placeholder="GitHub token"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-credential">API key or token</FieldLabel>
            <Input
              id="new-credential"
              name="credential"
              type="password"
              autoComplete="new-password"
              required
              maxLength={8192}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="secret-private" name="private" defaultChecked />
            <Label htmlFor="secret-private">Only I can manage it</Label>
          </div>
          <Button disabled={busy} type="submit">
            Store credential
          </Button>
        </FieldGroup>
      </form>
      {secrets.status === "LoadingFirstPage" && (
        <LoadingRows label="Loading credentials" />
      )}
      {secrets.status === "Exhausted" && secrets.results.length === 0 && (
        <p className="border-t pt-3 text-sm text-muted-foreground">
          No stored credentials. Add one above to create a connection.
        </p>
      )}
      {secrets.results.map((secret) => (
        <div key={secret.id} className="flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{secret.label}</span>
            <Badge variant={SECRET_STATUS[secret.status].variant}>
              {SECRET_STATUS[secret.status].label}
            </Badge>
            <span className="ml-auto flex items-center gap-1">
              <code className="font-mono text-xs text-muted-foreground">
                {secret.id}
              </code>
              <CopyButton value={secret.id} label="reference ID" />
            </span>
          </div>
          {secret.canManage && secret.status === "ready" && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                variant="outline"
                size="sm"
                onClick={() => setSelected(secret.id)}
              >
                Use in connection
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                size="sm"
                onClick={() =>
                  void perform(
                    () =>
                      rotate({
                        secretRef: secret.id,
                        revision: secret.revision,
                      }).then(() => undefined),
                    "Enter the new value below",
                    "Could not start the replacement. Try again."
                  )
                }
              >
                Replace value
              </Button>
              <ConfirmButton
                disabled={busy}
                variant="outline"
                size="sm"
                title={`Delete ${secret.label}?`}
                description="Connections that use it stop working. The key stays valid at its source until you revoke it there."
                confirmLabel="Delete"
                destructive
                onConfirm={() =>
                  void perform(
                    async () => {
                      await beginDelete({
                        secretRef: secret.id,
                        revision: secret.revision,
                      })
                      await update(secret.id, secret.revision, "")
                    },
                    "Credential deleted",
                    "Could not delete the credential. Try again."
                  )
                }
              >
                Delete
              </ConfirmButton>
            </div>
          )}
          {secret.canManage && secret.status === "pending" && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const value = Schema.decodeUnknownOption(Schema.String)(
                  new FormData(form).get("credential")
                )
                if (Option.isNone(value)) return
                void perform(
                  () => update(secret.id, secret.revision, value.value),
                  "Credential saved",
                  "Could not save the value. Try again."
                ).then((saved) => {
                  if (saved) form.reset()
                })
              }}
            >
              <Label htmlFor={`credential-${secret.id}`}>New value</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`credential-${secret.id}`}
                  name="credential"
                  type="password"
                  autoComplete="new-password"
                  maxLength={8192}
                  className="min-w-0 flex-1"
                  aria-describedby={`credential-${secret.id}-hint`}
                />
                <Button disabled={busy}>Save</Button>
                <ConfirmButton
                  type="button"
                  disabled={busy}
                  variant="outline"
                  title={`Discard ${secret.label}?`}
                  description="The unsaved value is removed."
                  confirmLabel="Discard"
                  destructive
                  onConfirm={() =>
                    void perform(
                      async () => {
                        await beginDelete({
                          secretRef: secret.id,
                          revision: secret.revision,
                        })
                        await update(secret.id, secret.revision, "")
                      },
                      "Credential discarded",
                      "Could not discard the credential. Try again."
                    )
                  }
                >
                  Discard
                </ConfirmButton>
              </div>
              <p
                id={`credential-${secret.id}-hint`}
                className="text-xs text-muted-foreground"
              >
                Leave it empty to retry the last value you sent.
              </p>
            </form>
          )}
          {secret.canManage && secret.status === "deleting" && (
            <Button
              disabled={busy}
              size="sm"
              className="self-start"
              onClick={() =>
                void perform(
                  () => update(secret.id, secret.revision, ""),
                  "Credential deleted",
                  "Could not delete the credential. Try again."
                )
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
            void perform(
              async () => {
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
              },
              "Connection created",
              "Could not create the connection. Check the origin and route."
            )
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
                void perform(
                  async () => {
                    await createGithubConnection({
                      workspaceId,
                      secretRef: selected,
                      label: "GitHub",
                    })
                    setSelected(null)
                  },
                  "GitHub connection created",
                  "Could not create the GitHub connection. Try again."
                )
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{connection.label}</span>
            <span className="ml-auto flex items-center gap-1">
              <code className="font-mono text-xs text-muted-foreground">
                {connection.id}
              </code>
              <CopyButton value={connection.id} label="connection ID" />
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {connection.kind === "github"
              ? `GitHub reads: ${connection.reads.join(", ")}`
              : `${connection.origin}${connection.routes[0]?.path ?? ""}`}
          </p>
          <ConfirmButton
            variant="outline"
            size="sm"
            className="self-start"
            disabled={busy}
            title={`Remove ${connection.label}?`}
            description="Recipes that call it fail until you add a new connection."
            confirmLabel="Remove"
            destructive
            onConfirm={() =>
              void perform(
                () =>
                  removeConnection({ connectionId: connection.id }).then(
                    () => undefined
                  ),
                "Connection removed",
                "Could not remove the connection. Try again."
              )
            }
          >
            Remove connection
          </ConfirmButton>
        </div>
      ))}
      {connections.status === "LoadingFirstPage" && (
        <LoadingRows label="Loading connections" />
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
    </section>
  )
}
