import { type FormEvent, useEffect, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { format } from "date-fns"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react"

import { api } from "../../convex/_generated/api"
import { Button } from "#/components/ui/button.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

type Workflow = NonNullable<FunctionReturnType<typeof api.workflow.get>>
type PreparationStatus = Workflow["preparationStatus"]
type HiringStatus = Workflow["hiringStatus"]
type ArtifactType =
  | "cv"
  | "cover_letter"
  | "email"
  | "recruiter_note"
  | "interview_prep"
type ArtifactState = "draft" | "saved" | "exported"

const preparationStatuses: PreparationStatus[] = [
  "discovered",
  "qualified",
  "preparing",
  "ready",
  "archived",
]
const hiringStatuses: HiringStatus[] = [
  "not_applied",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]
const artifactTypes: Array<{ value: ArtifactType; label: string }> = [
  { value: "cv", label: "CV" },
  { value: "cover_letter", label: "Cover letter" },
  { value: "email", label: "Email" },
  { value: "recruiter_note", label: "Recruiter note" },
  { value: "interview_prep", label: "Interview prep" },
]

export function ApplicationWorkflowOverview({
  applicationId,
}: {
  applicationId: string
}) {
  const workflow = useQuery(api.workflow.get, { applicationId })
  const generateFit = useAction(api.workflow.generateFit)
  const updateState = useMutation(api.workflow.updateState)
  const saveTask = useMutation(api.workflow.saveTask)
  const setTaskCompleted = useMutation(api.workflow.setTaskCompleted)
  const removeTask = useMutation(api.workflow.removeTask)
  const [preparationStatus, setPreparationStatus] =
    useState<PreparationStatus>()
  const [hiringStatus, setHiringStatus] = useState<HiringStatus>()
  const [archiveReason, setArchiveReason] = useState("")
  const [task, setTask] = useState({
    title: "",
    type: "follow_up" as const,
    dueAt: "",
    contact: "",
    note: "",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!workflow) return
    setPreparationStatus(workflow.preparationStatus)
    setHiringStatus(workflow.hiringStatus)
    setArchiveReason(workflow.archiveReason)
  }, [workflow])

  if (workflow === undefined) return <Skeleton className="h-80 w-full" />
  if (workflow === null || !preparationStatus || !hiringStatus) return null

  const handleAssess = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await generateFit({ applicationId })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleSaveState = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await updateState({
        applicationId,
        preparationStatus,
        hiringStatus,
        ...(archiveReason.trim() ? { archiveReason } : {}),
      })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleAddTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await saveTask({
        applicationId,
        type: task.type,
        title: task.title,
        contact: task.contact,
        note: task.note,
        ...(task.dueAt
          ? { dueAt: new Date(`${task.dueAt}T12:00:00`).getTime() }
          : {}),
      })
      setTask({
        title: "",
        type: "follow_up",
        dueAt: "",
        contact: "",
        note: "",
      })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <section className="border border-border bg-card">
        <SectionHeading
          description="Preparation and hiring are independent so readiness never gets confused with outcome."
          title="Workflow state"
        />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <StateField
            label="Preparation"
            onChange={(value) =>
              setPreparationStatus(value as PreparationStatus)
            }
            options={preparationStatuses}
            value={preparationStatus}
          />
          <StateField
            label="Hiring"
            onChange={(value) => setHiringStatus(value as HiringStatus)}
            options={hiringStatuses}
            value={hiringStatus}
          />
          {preparationStatus === "archived" ? (
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="archive-reason">Archive reason</Label>
              <Input
                id="archive-reason"
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder="Why this role is not worth pursuing"
                value={archiveReason}
              />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button
              disabled={busy}
              onClick={() => void handleSaveState()}
              size="sm"
              type="button"
            >
              Save state
            </Button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <FitAssessment
          busy={busy}
          onAssess={() => void handleAssess()}
          workflow={workflow}
        />
        <Readiness workflow={workflow} />
      </div>

      <section className="border border-border bg-card">
        <SectionHeading
          description="Manual follow-ups and deadlines come before email or calendar automation."
          title="Tasks and follow-ups"
        />
        <form
          className="grid gap-3 border-b border-border p-4 md:grid-cols-5"
          onSubmit={(event) => void handleAddTask(event)}
        >
          <Input
            className="md:col-span-2"
            onChange={(event) =>
              setTask({ ...task, title: event.target.value })
            }
            placeholder="Follow up with recruiter"
            required
            value={task.title}
          />
          <Input
            onChange={(event) =>
              setTask({ ...task, dueAt: event.target.value })
            }
            type="date"
            value={task.dueAt}
          />
          <Input
            onChange={(event) =>
              setTask({ ...task, contact: event.target.value })
            }
            placeholder="Contact"
            value={task.contact}
          />
          <Button disabled={busy} type="submit">
            <Plus /> Add task
          </Button>
        </form>
        <div className="divide-y divide-border">
          {workflow.tasks.map((entry) => (
            <div className="flex items-center gap-3 px-4 py-3" key={entry._id}>
              <button
                aria-label={
                  entry.completedAt ? "Mark incomplete" : "Mark complete"
                }
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  void setTaskCompleted({
                    taskId: entry._id,
                    completed: !entry.completedAt,
                  })
                }
                type="button"
              >
                {entry.completedAt ? (
                  <CheckCircle2 className="size-5 text-emerald-400" />
                ) : (
                  <Circle className="size-5" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    entry.completedAt
                      ? "text-sm text-muted-foreground line-through"
                      : "text-sm"
                  }
                >
                  {entry.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.type.replaceAll("_", " ")}
                  {entry.dueAt ? ` · due ${format(entry.dueAt, "MMM d")}` : ""}
                  {entry.contact ? ` · ${entry.contact}` : ""}
                </p>
              </div>
              <Button
                aria-label={`Delete ${entry.title}`}
                onClick={() => void removeTask({ taskId: entry._id })}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {workflow.tasks.length === 0 ? <Empty text="No tasks yet." /> : null}
        </div>
      </section>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  )
}

export function ApplicationJobBrief({
  applicationId,
}: {
  applicationId: string
}) {
  const workflow = useQuery(api.workflow.get, { applicationId })
  if (workflow === undefined) return <Skeleton className="h-52 w-full" />
  if (!workflow?.brief) {
    return (
      <section className="border border-border bg-card">
        <SectionHeading
          description="Run Assess fit from Overview to normalize the job description."
          title="Structured job brief"
        />
        <Empty text="No structured brief yet." />
      </section>
    )
  }
  const brief = workflow.brief.brief
  return (
    <section className="border border-border bg-card">
      <SectionHeading
        description="Stable normalized input shared by fit assessment and artifacts."
        title="Structured job brief"
      />
      <div className="grid gap-5 p-4 md:grid-cols-2">
        <BriefList label="Responsibilities" values={brief.responsibilities} />
        <BriefList label="Requirements" values={brief.requirements} />
        <BriefList label="Stack" values={brief.stack} />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <BriefDatum label="Domain" value={brief.domain} />
          <BriefDatum label="Level" value={brief.level} />
          <BriefDatum label="Location" value={brief.location} />
          <BriefDatum label="Work mode" value={brief.workMode} />
          <BriefDatum label="Compensation" value={brief.compensation} />
          <BriefDatum label="Visa signal" value={brief.visaSignal} />
        </dl>
      </div>
    </section>
  )
}

export function ApplicationArtifacts({
  applicationId,
}: {
  applicationId: string
}) {
  const workflow = useQuery(api.workflow.get, { applicationId })
  const memory = useQuery(api.memory.get)
  const saveArtifact = useMutation(api.workflow.saveArtifact)
  const removeArtifact = useMutation(api.workflow.removeArtifact)
  const [draft, setDraft] = useState({
    type: "cover_letter" as ArtifactType,
    state: "draft" as ArtifactState,
    title: "",
    content: "",
    baselineId: "",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (workflow === undefined || memory === undefined)
    return <Skeleton className="h-80 w-full" />
  if (!workflow) return null

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await saveArtifact({
        applicationId,
        type: draft.type,
        state: draft.state,
        title: draft.title,
        content: draft.content,
        ...(draft.baselineId ? { baselineId: draft.baselineId } : {}),
      })
      setDraft({
        type: "cover_letter",
        state: "draft",
        title: "",
        content: "",
        baselineId: "",
      })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="border border-border bg-card">
        <SectionHeading
          description="Every save freezes current job, candidate, evidence, rules, and baseline inputs."
          title="Create artifact"
        />
        <form
          className="grid gap-4 p-4"
          onSubmit={(event) => void handleSave(event)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StateField
              label="Type"
              onChange={(value) =>
                setDraft({ ...draft, type: value as ArtifactType })
              }
              options={artifactTypes.map((entry) => entry.value)}
              value={draft.type}
            />
            <StateField
              label="State"
              onChange={(value) =>
                setDraft({ ...draft, state: value as ArtifactState })
              }
              options={["draft", "saved", "exported"]}
              value={draft.state}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="artifact-title">Title</Label>
            <Input
              id="artifact-title"
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
              placeholder="Application cover letter"
              required
              value={draft.title}
            />
          </div>
          {draft.type === "cv" ? (
            <div className="grid gap-2">
              <Label htmlFor="artifact-baseline">CV baseline</Label>
              <select
                className="h-9 border border-input bg-background px-3 text-sm"
                id="artifact-baseline"
                onChange={(event) =>
                  setDraft({ ...draft, baselineId: event.target.value })
                }
                value={draft.baselineId}
              >
                <option value="">Current profile</option>
                {memory.baselines.map((entry) => (
                  <option key={entry._id} value={entry._id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="artifact-content">Content</Label>
            <Textarea
              className="min-h-64"
              id="artifact-content"
              onChange={(event) =>
                setDraft({ ...draft, content: event.target.value })
              }
              placeholder="Draft here or use Chat for AI-assisted iteration, then save the reviewable result."
              value={draft.content}
            />
          </div>
          <Button disabled={busy} type="submit">
            {busy ? <Loader2 className="animate-spin" /> : <FileText />} Save
            artifact
          </Button>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </form>
      </section>
      <section className="border border-border bg-card">
        <SectionHeading
          description="Saved versions never silently mutate; changed inputs mark them stale."
          title="Application pack"
        />
        <div className="divide-y divide-border">
          {workflow.legacyCvVersions.map((entry) => (
            <article className="p-4" key={entry.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">Tailored CV</h3>
                <Badge text="CV" />
                <Badge text="saved" />
                <Badge text="legacy version" />
                {entry.stale ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                    <AlertTriangle className="size-3.5" /> stale
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved {format(entry.savedAt, "MMM d, yyyy · HH:mm")}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {entry.overallAssessment}
              </p>
            </article>
          ))}
          {workflow.artifacts.map((entry) => (
            <article className="p-4" key={entry._id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{entry.title}</h3>
                    <Badge text={entry.type.replaceAll("_", " ")} />
                    <Badge text={entry.state} />
                    {entry.stale ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                        <AlertTriangle className="size-3.5" /> stale
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="size-3.5" /> current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saved {format(entry.updatedAt, "MMM d, yyyy · HH:mm")}
                    {entry.staleReasons.length
                      ? ` · ${entry.staleReasons.join(", ")}`
                      : ""}
                  </p>
                </div>
                <Button
                  aria-label={`Delete ${entry.title}`}
                  onClick={() => void removeArtifact({ artifactId: entry._id })}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>
              <p className="mt-4 max-h-48 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {entry.content || "Empty draft"}
              </p>
            </article>
          ))}
          {workflow.artifacts.length === 0 && workflow.legacyCvVersions.length === 0 ? (
            <Empty text="No typed artifacts yet. Saved CV versions remain available in Chat." />
          ) : null}
        </div>
      </section>
    </div>
  )
}

function FitAssessment({
  busy,
  onAssess,
  workflow,
}: {
  busy: boolean
  onAssess: () => void
  workflow: Workflow
}) {
  const fit = workflow.fit
  return (
    <section className="border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Fit decision</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Eligibility gates are evaluated before stack similarity.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={onAssess}
          size="sm"
          type="button"
          variant={fit ? "outline" : "default"}
        >
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {fit ? "Reassess" : "Assess fit"}
        </Button>
      </div>
      {!fit ? (
        <Empty text="No fit assessment yet. Normalize the role and decide whether it is worth applying before tailoring." />
      ) : (
        <div className="grid gap-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FitDecision decision={fit.assessment.decision} />
            <Badge text={`${fit.assessment.scoreBand} fit`} />
            <Badge text={fit.assessment.eligibility} />
            {fit.stale ? (
              <span className="text-xs text-amber-300">Sources changed</span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {Math.round(fit.assessment.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm leading-6">{fit.assessment.summary}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FitList
              label="Strengths"
              values={fit.assessment.strengths}
              tone="good"
            />
            <FitList label="Gaps" values={fit.assessment.gaps} tone="neutral" />
            <FitList label="Risks" values={fit.assessment.risks} tone="risk" />
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
            {Object.entries(fit.assessment.signals).map(([label, signal]) => (
              <div key={label}>
                <p className="text-xs capitalize text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-sm capitalize">{signal}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Readiness({ workflow }: { workflow: Workflow }) {
  const items = [
    ["Candidate profile", workflow.readiness.profile],
    ["Structured job brief", workflow.readiness.jobBrief],
    ["Fit assessed", workflow.readiness.fitAssessed],
    ["Verified evidence", workflow.readiness.verifiedEvidence],
    ["Saved application artifact", workflow.readiness.savedArtifact],
  ] as const
  const readyCount = items.filter(([, ready]) => ready).length
  return (
    <section className="border border-border bg-card">
      <SectionHeading
        description={`${readyCount}/${items.length} readiness checks complete · ${workflow.sourceCount} source observation${workflow.sourceCount === 1 ? "" : "s"}`}
        title="Readiness"
      />
      <div className="divide-y divide-border">
        {items.map(([label, ready]) => (
          <div
            className="flex items-center gap-2 px-4 py-3 text-sm"
            key={label}
          >
            {ready ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <Circle className="size-4 text-muted-foreground" />
            )}
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}

function StateField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: readonly string[]
  value: string
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <select
        className="h-9 border border-input bg-background px-3 text-sm capitalize"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </div>
  )
}

function SectionHeading({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div className="border-b border-border px-4 py-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function BriefList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <ul className="mt-2 grid gap-2 text-sm">
        {values.map((value, index) => (
          <li className="flex gap-2" key={`${value}-${index}`}>
            <span className="text-muted-foreground">—</span>
            {value}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BriefDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 capitalize">{value || "Unknown"}</dd>
    </div>
  )
}

function FitList({
  label,
  tone,
  values,
}: {
  label: string
  tone: "good" | "neutral" | "risk"
  values: string[]
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "risk"
        ? "text-amber-300"
        : "text-muted-foreground"
  return (
    <div>
      <h3 className={`text-xs ${color}`}>{label}</h3>
      <ul className="mt-2 grid gap-2 text-xs leading-5">
        {values.map((value, index) => (
          <li key={`${value}-${index}`}>— {value}</li>
        ))}
      </ul>
    </div>
  )
}

function FitDecision({
  decision,
}: {
  decision: Workflow["fit"] extends infer T
    ? T extends { assessment: { decision: infer D } }
      ? D
      : never
    : never
}) {
  const risky = decision === "low_fit" || decision === "ineligible"
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium ${risky ? "border-red-800 bg-red-950/60 text-red-200" : "border-emerald-700 bg-emerald-950/60 text-emerald-200"}`}
    >
      {risky ? (
        <ShieldAlert className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      {decision.replaceAll("_", " ")}
    </span>
  )
}

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex border border-border bg-muted/40 px-2 py-0.5 text-xs capitalize text-muted-foreground">
      {text}
    </span>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{text}</p>
}
function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed"
}
