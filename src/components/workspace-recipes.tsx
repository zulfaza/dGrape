import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Component, useRef, useState, type ReactNode } from "react"
import { Schema } from "effect"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { PreviewInput, Recipe } from "../../convex/lib/agentRecipeTransport"
import { validateRecipe } from "../../convex/lib/recipeDomain"
import {
  validateTiming,
  type RecipeTiming,
} from "../../convex/lib/recipeSchedule"
import { Alert, AlertDescription } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "./ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Separator } from "./ui/separator"
import { Skeleton } from "./ui/skeleton"
import { SourceFreshness } from "./source-freshness"
import { useWorkspaceCan } from "@/components/workspace-role"
import { ConfirmButton } from "@/components/confirm-dialog"
import { toast } from "@/components/ui/toast"
import { errorMessage } from "@/lib/error-message"
import { formatDateTime } from "@/lib/format-time"

/** Run states as people read them, with a badge that marks failures. */
const RUN_STATE = {
  pending: { label: "Waiting", variant: "outline" },
  running: { label: "Running", variant: "outline" },
  succeeded: { label: "Succeeded", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  skipped: { label: "Skipped", variant: "outline" },
  started: { label: "Running", variant: "outline" },
} as const satisfies Record<
  Doc<"recipeRuns">["state"] | Doc<"recipeStepAttempts">["state"],
  { label: string; variant: "outline" | "secondary" | "destructive" }
>

const sample: typeof Recipe.Type = {
  steps: [{ kind: "artifact", name: "report.json", format: "json" }],
  limits: { rows: 100, bytes: 10000, durationMs: 60000, attempts: 2 },
}
type Draft = {
  name: string
  json: string
  sample: string
  preview: FunctionReturnType<typeof api.recipes.preview> | null
}
const decodeRecipe = Schema.decodeUnknownSync(Schema.fromJsonString(Recipe))
const decodeSample = Schema.decodeUnknownSync(
  Schema.fromJsonString(PreviewInput.fields.sample)
)
type Intent = { key: string; runId: Id<"recipeRuns"> | null }
/** Runs one change; on success shows `done` in a toast. */
type Perform = (action: () => Promise<void>, done: string) => Promise<void>

function useOperation() {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const perform: Perform = async (action, done) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setMessage("")
    try {
      await action()
      toast.success(done)
    } catch (error) {
      setMessage(
        errorMessage(error, "Could not save. Check your access and try again.")
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return { busy, message, perform }
}

class RecipeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <Alert>
          <AlertDescription>
            Could not load recipes. Check your access, then reload this page.
          </AlertDescription>
        </Alert>
      )
    return this.props.children
  }
}

export function WorkspaceRecipes({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  return (
    <RecipeBoundary key={workspaceId}>
      <RecipePanel workspaceId={workspaceId} />
    </RecipeBoundary>
  )
}

function PageMore({
  status,
  loadMore,
  label,
}: {
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted"
  loadMore: (count: number) => void
  label: string
}) {
  if (status === "LoadingFirstPage") return <Skeleton className="h-10 w-full" />
  if (status === "Exhausted") return null
  return (
    <Button
      variant="outline"
      disabled={status === "LoadingMore"}
      onClick={() => loadMore(20)}
    >
      {status === "LoadingMore" ? "Loading…" : `Load more ${label}`}
    </Button>
  )
}

function Feedback({ message }: { message: string }) {
  return message ? (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null
}

function NoItems({ label }: { label: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{label}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

function RecipePanel({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const versions = usePaginatedQuery(
    api.recipes.versions,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const schedules = usePaginatedQuery(
    api.recipes.schedules,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const runs = usePaginatedQuery(
    api.recipes.runs,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const [versionId, setVersionId] = useState<Id<"recipeVersions"> | null>(null)
  const [runId, setRunId] = useState<Id<"recipeRuns"> | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const convex = useConvex()
  const intents = useRef(new Map<Id<"recipeVersions">, Intent>())
  const operation = useOperation()
  const publish = useMutation(api.recipes.publish)
  const canWrite = useWorkspaceCan("write")
  const version = versions.results.find((item) => item._id === versionId)
  const selectedRun = runs.results.find((item) => item._id === runId)
  return (
    <section
      aria-label="Recipes and schedules"
      className="flex flex-col gap-4 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Recipes and schedules</h2>
        <Button
          hidden={!canWrite}
          disabled={operation.busy || draft !== null}
          onClick={() =>
            setDraft({
              name: "",
              json: JSON.stringify(sample, null, 2),
              sample: "[]",
              preview: null,
            })
          }
        >
          New recipe
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        A version cannot change. To edit a recipe, publish a new version.
      </p>
      <Feedback message={operation.message} />
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void operation.perform(async () => {
              const recipe = decodeRecipe(draft.json)
              validateRecipe(recipe)
              const id = await publish({
                workspaceId,
                name: draft.name,
                recipe,
              })
              setVersionId(id)
              setDraft(null)
            }, "Recipe version published")
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="recipe-name">Recipe name</FieldLabel>
              <Input
                id="recipe-name"
                required
                maxLength={120}
                value={draft.name}
                disabled={operation.busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="recipe-json">Recipe JSON</FieldLabel>
              <textarea
                className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
                id="recipe-json"
                rows={14}
                required
                maxLength={250000}
                disabled={operation.busy}
                value={draft.json}
                onChange={(e) =>
                  setDraft({ ...draft, json: e.target.value, preview: null })
                }
              />
              <FieldDescription>
                Trusted steps: fetch, map, filter, join, aggregate, upsert,
                snapshot, artifact. JSON only. Connections run with the recipe
                creator's access.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="recipe-sample">
                Sample rows (JSON)
              </FieldLabel>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-sm"
                id="recipe-sample"
                rows={4}
                maxLength={250000}
                disabled={operation.busy}
                value={draft.sample}
                onChange={(e) =>
                  setDraft({ ...draft, sample: e.target.value, preview: null })
                }
              />
              <FieldDescription>
                Preview uses these rows in place of the fetch step. It fetches
                nothing and saves nothing.
              </FieldDescription>
            </Field>
            {draft.preview && <PreviewResult preview={draft.preview} />}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={operation.busy}
                onClick={() => {
                  const current = draft
                  void (async () => {
                    let preview: Draft["preview"]
                    try {
                      preview = await convex.query(api.recipes.preview, {
                        workspaceId,
                        recipe: decodeRecipe(current.json),
                        sample: decodeSample(current.sample),
                      })
                    } catch (error) {
                      preview = {
                        ok: false,
                        error: errorMessage(
                          error,
                          "Check the JSON and try again."
                        ),
                      }
                    }
                    setDraft((latest) =>
                      latest &&
                      latest.json === current.json &&
                      latest.sample === current.sample
                        ? { ...latest, preview }
                        : latest
                    )
                  })()
                }}
              >
                Preview
              </Button>
              <Button type="submit" disabled={operation.busy}>
                Publish new version
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={operation.busy}
                onClick={() => setDraft(null)}
              >
                Discard
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
      <h3 className="text-base font-semibold">Versions</h3>
      {versions.status === "Exhausted" && versions.results.length === 0 && (
        <NoItems label="No recipes. Create a recipe to start." />
      )}
      <ul className="flex flex-col gap-2">
        {versions.results.map((item) => (
          <li
            key={item._id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="min-w-0">
              <span className="font-medium">{item.name}</span>{" "}
              <span className="text-sm text-muted-foreground">
                {formatDateTime(item._creationTime)}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={version?._id === item._id}
              onClick={() => setVersionId(item._id)}
            >
              {version?._id === item._id ? "Open" : "Open version"}
              <span className="sr-only"> {item.name}</span>
            </Button>
          </li>
        ))}
      </ul>
      <PageMore {...versions} label="versions" />
      {version && (
        <VersionControls
          key={version._id}
          version={version}
          intents={intents.current}
          onCopy={() => {
            setDraft({
              name: version.name,
              json: JSON.stringify(version.recipe, null, 2),
              sample: "[]",
              preview: null,
            })
          }}
          copying={draft !== null}
        />
      )}
      <Separator />
      <h3 className="text-base font-semibold">Schedules</h3>
      <p className="text-sm text-muted-foreground">
        A schedule skips a time while its last run is still running. After
        missed times, it runs once.
      </p>
      {schedules.status === "Exhausted" && schedules.results.length === 0 && (
        <NoItems label="No schedules. Open a version to add one." />
      )}
      <ul className="flex flex-col gap-3">
        {schedules.results.map((item) => (
          <ScheduleRow key={item._id} item={item} versions={versions.results} />
        ))}
      </ul>
      <PageMore {...schedules} label="schedules" />
      <Separator />
      <h3 className="text-base font-semibold">Source freshness</h3>
      <SourceFreshnessList workspaceId={workspaceId} />
      <Separator />
      <h3 className="text-base font-semibold">Runs</h3>
      {runs.status === "Exhausted" && runs.results.length === 0 && (
        <NoItems label="No runs. Open a version to run it." />
      )}
      <ul className="flex flex-col gap-3">
        {runs.results.map((item) => (
          <RunRow
            key={item._id}
            item={item}
            versionName={
              versions.results.find((v) => v._id === item.versionId)?.name
            }
            selected={item._id === selectedRun?._id}
            onSelect={() => setRunId(item._id)}
          />
        ))}
      </ul>
      <PageMore {...runs} label="runs" />
      {selectedRun && (
        <RunHistory key={selectedRun._id} runId={selectedRun._id} />
      )}
    </section>
  )
}

function PreviewResult({
  preview,
}: {
  preview: NonNullable<Draft["preview"]>
}) {
  if (!preview.ok)
    return (
      <Alert>
        <AlertDescription>Preview failed: {preview.error}</AlertDescription>
      </Alert>
    )
  return (
    <div className="flex flex-col gap-2" aria-label="Preview result">
      <ol className="flex flex-wrap gap-2">
        {preview.steps.map((step, index) => (
          <li key={index}>
            <Badge variant="outline">
              {index + 1}. {step.kind}: {step.rows} rows
            </Badge>
          </li>
        ))}
      </ol>
      <pre className="max-h-64 overflow-auto rounded-md border p-3 text-xs">
        {JSON.stringify(preview.rows, null, 2)}
      </pre>
    </div>
  )
}

function VersionControls({
  version,
  intents,
  onCopy,
  copying,
}: {
  version: Doc<"recipeVersions">
  intents: Map<Id<"recipeVersions">, Intent>
  onCopy: () => void
  copying: boolean
}) {
  const canWrite = useWorkspaceCan("write")
  const permissions = useQuery(api.recipes.permissions, {
    versionId: version._id,
  })
  const trigger = useMutation(api.recipes.trigger)
  const schedule = useMutation(api.recipes.schedule)
  const access = useMutation(api.recipes.setRunAccess)
  const { busy, message, perform } = useOperation()
  const [mode, setMode] = useState<"once" | "cron">("once")
  const [timingText, setTimingText] = useState("")
  const [intent, setIntent] = useState(intents.get(version._id))
  const canManage = permissions?.canManage === true
  const canRun = permissions?.canRun === true
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{version.name}</h3>
      <ol className="list-inside list-decimal">
        {version.recipe.steps.map((step, index) => (
          <li key={index}>{step.kind}</li>
        ))}
      </ol>
      <details>
        <summary>View recipe JSON</summary>
        <pre className="overflow-auto">
          {JSON.stringify(version.recipe, null, 2)}
        </pre>
      </details>
      {!permissions && <p role="status">Loading permissions…</p>}
      {permissions && (
        <p>
          {canManage
            ? "You can manage and run this version."
            : canRun
              ? "You can run this version."
              : "You have read access to this version."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          hidden={!canWrite}
          disabled={busy || copying}
          onClick={onCopy}
        >
          Copy to new version
        </Button>
        <Button
          disabled={busy || !canRun || Boolean(intent?.runId)}
          onClick={() =>
            void perform(async () => {
              const pending = intents.get(version._id) ?? {
                key: crypto.randomUUID(),
                runId: null,
              }
              intents.set(version._id, pending)
              setIntent(pending)
              const id = await trigger({
                versionId: version._id,
                idempotencyKey: pending.key,
              })
              const completed = { key: pending.key, runId: id }
              intents.set(version._id, completed)
              setIntent(completed)
            }, "Run started")
          }
        >
          {intent && intent.runId === null ? "Retry same run" : "Run version"}
        </Button>
        {intent?.runId && (
          <Button
            variant="outline"
            disabled={busy || !canRun}
            onClick={() => {
              intents.delete(version._id)
              setIntent(undefined)
            }}
          >
            Prepare another run
          </Button>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void perform(async () => {
            const timing: RecipeTiming =
              mode === "cron"
                ? { kind: "cron", expression: timingText.trim() }
                : { kind: "once", at: parseUtc(timingText) }
            validateTiming(timing)
            await schedule({ versionId: version._id, timing })
            setTimingText("")
          }, "Schedule added")
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recipe-mode">Schedule type</FieldLabel>
            <Select
              value={mode}
              disabled={busy || !canManage}
              onValueChange={(value) => {
                if (value !== "once" && value !== "cron") return
                setMode(value)
                setTimingText("")
              }}
            >
              <SelectTrigger id="recipe-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="once">Once (UTC)</SelectItem>
                  <SelectItem value="cron">Cron (UTC)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="recipe-timing">
              {mode === "once" ? "UTC date and time" : "Five-field UTC cron"}
            </FieldLabel>
            <Input
              id="recipe-timing"
              required
              value={timingText}
              disabled={busy || !canManage}
              placeholder={
                mode === "once" ? "2026-12-01T09:00:00Z" : "0 9 * * *"
              }
              onChange={(e) => setTimingText(e.target.value)}
            />
            <FieldDescription>
              {mode === "once"
                ? "A future time, as YYYY-MM-DDTHH:mm:ssZ."
                : "Minute, hour, day, month, weekday. 0 9 * * * runs daily at 09:00 UTC."}
            </FieldDescription>
          </Field>
          <Button disabled={busy || !canManage} type="submit">
            Add schedule
          </Button>
        </FieldGroup>
      </form>
      {canManage && (
        <RunAccess
          versionId={version._id}
          busy={busy}
          onChange={(userId, allowed) =>
            void perform(
              async () => {
                await access({ versionId: version._id, userId, allowed })
              },
              allowed ? "Run access granted" : "Run access removed"
            )
          }
        />
      )}
      <Feedback message={message} />
    </div>
  )
}

/** Members who can run this version, for its creator to grant or remove. */
function RunAccess({
  versionId,
  busy,
  onChange,
}: {
  versionId: Id<"recipeVersions">
  busy: boolean
  onChange: (userId: string, allowed: boolean) => void
}) {
  const members = useQuery(api.recipes.runAccessMembers, { versionId })
  return (
    <section className="flex flex-col gap-2" aria-label="Run access">
      <h4 className="text-sm font-semibold">Run access</h4>
      <p className="text-sm text-muted-foreground">
        Members with run access can start and cancel runs of this version.
      </p>
      {members === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No other owners or editors yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {members.map((member) => {
            const name = member.email ?? "A member"
            return (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm" title={name}>
                  {name}
                  {!member.canRun && (
                    <span className="text-muted-foreground">
                      {" "}
                      · cannot run now
                    </span>
                  )}
                </span>
                {member.hasAccess ? (
                  <ConfirmButton
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    title={`Remove run access for ${name}?`}
                    description="They can no longer start or cancel runs of this version."
                    confirmLabel="Remove access"
                    destructive
                    onConfirm={() => onChange(member.userId, false)}
                  >
                    Remove access
                  </ConfirmButton>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onChange(member.userId, true)}
                  >
                    Allow runs
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Round-trip UTC fields so Date.parse cannot normalize an invalid calendar date. */
function parseUtc(text: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text))
    throw new Error("Use YYYY-MM-DDTHH:mm:ssZ in UTC.")
  const at = Date.parse(text)
  if (
    !Number.isFinite(at) ||
    new Date(at).toISOString() !== text.replace("Z", ".000Z")
  )
    throw new Error("Enter a valid UTC date and time.")
  if (at <= Date.now()) throw new Error("The UTC time must be in the future.")
  return at
}

function ScheduleRow({
  item,
  versions,
}: {
  item: Doc<"recipeSchedules">
  versions: Doc<"recipeVersions">[]
}) {
  const permissions = useQuery(api.recipes.permissions, {
    versionId: item.versionId,
  })
  const setEnabled = useMutation(api.recipes.setEnabled)
  const updateSchedule = useMutation(api.recipes.updateSchedule)
  const { busy, message, perform } = useOperation()
  const [edit, setEdit] = useState<{
    versionId: Id<"recipeVersions">
    timing: string
    expectedRevision: number
  } | null>(null)
  const canManage = permissions?.canManage === true
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{item.enabled ? "Enabled" : "Paused"}</Badge>
        <span>
          {item.timing.kind === "cron" ? (
            <>
              <code className="font-mono text-sm">
                {item.timing.expression}
              </code>{" "}
              (UTC)
            </>
          ) : (
            formatDateTime(item.timing.at)
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !canManage}
          onClick={() =>
            void perform(
              async () => {
                await setEnabled({
                  scheduleId: item._id,
                  enabled: !item.enabled,
                })
              },
              item.enabled ? "Schedule paused" : "Schedule enabled"
            )
          }
        >
          {item.enabled ? "Pause" : "Enable"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !canManage || edit !== null}
          onClick={() =>
            setEdit({
              expectedRevision: item.revision ?? 0,
              versionId: item.versionId,
              timing:
                item.timing.kind === "cron"
                  ? item.timing.expression
                  : new Date(item.timing.at).toISOString().replace(".000", ""),
            })
          }
        >
          Edit
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {versions.find((v) => v._id === item.versionId)?.name ??
          "An older version"}
        {item.enabled && ` · next run ${formatDateTime(item.nextAt)}`}
      </p>
      {edit && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void perform(async () => {
              const timing: RecipeTiming =
                item.timing.kind === "cron"
                  ? { kind: "cron", expression: edit.timing.trim() }
                  : { kind: "once", at: parseUtc(edit.timing) }
              validateTiming(timing)
              await updateSchedule({
                scheduleId: item._id,
                expectedRevision: edit.expectedRevision,
                versionId: edit.versionId,
                timing,
              })
              setEdit(null)
            }, "Schedule saved")
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`schedule-version-${item._id}`}>
                Recipe version
              </FieldLabel>
              <Select
                value={edit.versionId}
                disabled={busy}
                onValueChange={(value) => {
                  const version = versions.find((v) => v._id === value)
                  if (version) setEdit({ ...edit, versionId: version._id })
                }}
              >
                <SelectTrigger id={`schedule-version-${item._id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {!versions.some((v) => v._id === item.versionId) && (
                      <SelectItem value={item.versionId}>
                        Current version
                      </SelectItem>
                    )}
                    {versions.map((version) => (
                      <SelectItem key={version._id} value={version._id}>
                        {version.name} · {formatDateTime(version._creationTime)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`schedule-timing-${item._id}`}>
                {item.timing.kind === "once"
                  ? "UTC date and time"
                  : "Five-field UTC cron"}
              </FieldLabel>
              <Input
                id={`schedule-timing-${item._id}`}
                required
                value={edit.timing}
                disabled={busy}
                onChange={(e) => setEdit({ ...edit, timing: e.target.value })}
              />
              <FieldDescription>
                The next run time starts again from now. Missed times do not
                run.
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Save schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                Discard
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
      <Feedback message={message} />
    </li>
  )
}

function SourceFreshnessList({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const sources = useQuery(api.sourceSyncs.list, { workspaceId })
  if (sources === undefined) return <Skeleton className="h-5 w-64" />
  if (sources.length === 0) return <NoItems label="No collections yet." />
  return (
    <ul className="flex flex-col gap-2">
      {sources.map((source) => (
        <li key={source.collectionId}>
          <SourceFreshness source={source} />
        </li>
      ))}
    </ul>
  )
}

function RunRow({
  item,
  versionName,
  selected,
  onSelect,
}: {
  item: Doc<"recipeRuns">
  versionName: string | undefined
  selected: boolean
  onSelect: () => void
}) {
  const permissions = useQuery(api.recipes.permissions, {
    versionId: item.versionId,
  })
  const cancel = useMutation(api.recipes.cancel)
  const retry = useMutation(api.recipes.retry)
  const { busy, message, perform } = useOperation()
  // One key per row: a repeated click after a lost response returns the same retry run.
  const [retryIntent, setRetryIntent] = useState<Intent>(() => ({
    key: crypto.randomUUID(),
    runId: null,
  }))
  const active = item.state === "pending" || item.state === "running"
  const retryable = item.state === "failed" || item.state === "cancelled"
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RUN_STATE[item.state].variant}>
          {RUN_STATE[item.state].label}
        </Badge>
        <span className="font-medium">{versionName ?? "Recipe run"}</span>
        <span className="text-sm text-muted-foreground">
          {formatDateTime(item._creationTime)} ·{" "}
          {item.retryOf ? "Retry" : item.scheduleId ? "Scheduled" : "Manual"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={selected}
            onClick={onSelect}
          >
            Steps
          </Button>
          {active && (
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy || item.cancelRequested || permissions?.canRun !== true
              }
              onClick={() =>
                void perform(async () => {
                  await cancel({ runId: item._id })
                }, "Cancel requested")
              }
            >
              {item.cancelRequested ? "Cancelling…" : "Cancel run"}
            </Button>
          )}
          {retryable && (
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                retryIntent.runId !== null ||
                permissions?.canRun !== true
              }
              onClick={() =>
                void perform(async () => {
                  const runId = await retry({
                    runId: item._id,
                    idempotencyKey: retryIntent.key,
                  })
                  setRetryIntent({ key: retryIntent.key, runId })
                }, "Retry started")
              }
            >
              {retryIntent.runId ? "Retried" : "Retry"}
            </Button>
          )}
        </div>
      </div>
      <Feedback message={message} />
    </li>
  )
}

function RunHistory({ runId }: { runId: Id<"recipeRuns"> }) {
  const history = usePaginatedQuery(
    api.recipes.history,
    { runId },
    { initialNumItems: 20 }
  )
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Steps of the selected run</h3>
      {history.status === "Exhausted" && history.results.length === 0 && (
        <NoItems label="No step attempts yet." />
      )}
      <ol className="flex flex-col gap-2">
        {history.results.map((attempt) => (
          <li key={attempt._id} className="flex flex-wrap items-center gap-2">
            <Badge variant={RUN_STATE[attempt.state].variant}>
              {RUN_STATE[attempt.state].label}
            </Badge>
            <span>
              Step {attempt.step + 1}, attempt {attempt.attempt}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatDateTime(attempt.startedAt)}
            </span>
            {attempt.error && (
              <span className="w-full text-sm text-destructive">
                {attempt.error}
              </span>
            )}
          </li>
        ))}
      </ol>
      <PageMore {...history} label="attempts" />
    </div>
  )
}
