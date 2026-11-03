import { useState } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"
import { useAccessToken } from "@workos/authkit-tanstack-react-start/client"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Badge } from "./ui/badge"

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
  const removeConnection = useMutation(api.connectors.remove)
  const { getAccessToken } = useAccessToken()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Id<"secretRefs"> | null>(null)
  async function update(id: Id<"secretRefs">, revision: number, value: string) {
    const token = await getAccessToken()
    const site: unknown = import.meta.env.VITE_CONVEX_SITE_URL
    if (
      !token ||
      typeof site !== "string" ||
      (!site.startsWith("https://") && !site.startsWith("http://127.0.0.1:"))
    )
      throw new Error("Settings unavailable")
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
          const label = data.get("label")
          const value = data.get("credential")
          form.reset()
          if (typeof label !== "string" || typeof value !== "string") return
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
                const value = new FormData(form).get("credential")
                form.reset()
                if (typeof value === "string")
                  void perform(() => update(secret.id, secret.revision, value))
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
            const label = data.get("label")
            const origin = data.get("origin")
            const path = data.get("path")
            const fields = data.get("fields")
            if (
              typeof label !== "string" ||
              typeof origin !== "string" ||
              typeof path !== "string" ||
              typeof fields !== "string"
            )
              return
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
            {connection.origin}
            {connection.routes[0]?.path}
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
