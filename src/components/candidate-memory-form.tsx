import { type FormEvent, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CheckCircle2, Plus, ShieldCheck, Trash2 } from "lucide-react"

import { api } from "../../convex/_generated/api"
import { Button } from "#/components/ui/button.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

type Preferences = {
  roleFamilies: string[]
  stacks: string[]
  domains: string[]
  levels: string[]
  locations: string[]
  workModes: Array<"remote" | "hybrid" | "onsite">
  visaNeed:
    | "not_required"
    | "has_authorization"
    | "requires_sponsorship"
    | "unknown"
  dealbreakers: string[]
}

type Evidence = {
  id?: string
  claim: string
  kind: "work" | "project" | "education" | "skill" | "metric" | "credential"
  source: string
  context: string
  verification:
    | { state: "unverified" }
    | { state: "verified"; verifiedAt: number }
  confidence: number
  reusable: boolean
}

type Rule = {
  id?: string
  scope: "global" | "role_family"
  roleFamily?: string
  instruction: string
  source: { type: "manual" } | { type: "feedback"; feedback: string }
  active: boolean
}

const preferenceFields: Array<{
  key: keyof Pick<
    Preferences,
    | "roleFamilies"
    | "stacks"
    | "domains"
    | "levels"
    | "locations"
    | "dealbreakers"
  >
  label: string
  placeholder: string
}> = [
  {
    key: "roleFamilies",
    label: "Role families",
    placeholder: "Frontend engineer, Product engineer",
  },
  {
    key: "stacks",
    label: "Preferred stacks",
    placeholder: "TypeScript, React, Node.js",
  },
  { key: "domains", label: "Domains", placeholder: "Developer tools, Fintech" },
  { key: "levels", label: "Levels", placeholder: "Senior, Staff" },
  {
    key: "locations",
    label: "Locations",
    placeholder: "Jakarta, Singapore, Remote",
  },
  {
    key: "dealbreakers",
    label: "Dealbreakers",
    placeholder: "No visa sponsorship, fully onsite",
  },
]

export function CandidateMemoryForm() {
  const memory = useQuery(api.memory.get)
  const saveMemory = useMutation(api.memory.save)
  const createBaseline = useMutation(api.memory.createBaseline)
  const removeBaseline = useMutation(api.memory.removeBaseline)
  const [preferences, setPreferences] = useState<Preferences>()
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [baseline, setBaseline] = useState({ name: "", roleFamilies: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [savedAt, setSavedAt] = useState<number>()

  useEffect(() => {
    if (!memory || preferences) return
    setPreferences(memory.preferences)
    setEvidence(
      memory.evidence.map((entry) => ({
        id: entry._id,
        claim: entry.claim,
        kind: entry.kind,
        source: entry.source,
        context: entry.context,
        verification: entry.verification,
        confidence: entry.confidence,
        reusable: entry.reusable,
      }))
    )
    setRules(
      memory.rules.map((entry) => ({
        id: entry._id,
        scope: entry.scope,
        roleFamily: entry.roleFamily,
        instruction: entry.instruction,
        source: entry.source,
        active: entry.active,
      }))
    )
  }, [memory, preferences])

  const verifiedCount = useMemo(
    () =>
      evidence.filter((entry) => entry.verification.state === "verified")
        .length,
    [evidence]
  )

  if (!memory || !preferences) {
    return <Skeleton className="h-96 w-full rounded-lg" />
  }

  const handleSave = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await saveMemory({ preferences, evidence, rules })
      setSavedAt(Date.now())
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateBaseline = async () => {
    setSaving(true)
    setError(undefined)
    try {
      await createBaseline({
        name: baseline.name,
        roleFamilies: parseList(baseline.roleFamilies),
      })
      setBaseline({ name: "", roleFamilies: "" })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => void handleSave(event)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Candidate memory
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Durable preferences, verified claims, and writing rules used to
            qualify roles and create application artifacts.
          </p>
        </div>
        <Button disabled={saving} type="submit">
          <ShieldCheck />
          {saving ? "Saving…" : "Save memory"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Verified evidence"
          value={`${verifiedCount}/${evidence.length}`}
        />
        <Metric
          label="Active rules"
          value={String(rules.filter((entry) => entry.active).length)}
        />
        <Metric label="CV baselines" value={String(memory.baselines.length)} />
      </div>

      <MemorySection
        description="Hard constraints and weighted preferences used before tailoring begins."
        title="Role preferences"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {preferenceFields.map((field) => (
            <div className="grid gap-2" key={field.key}>
              <Label htmlFor={`preference-${field.key}`}>{field.label}</Label>
              <Textarea
                id={`preference-${field.key}`}
                onChange={(event) =>
                  setPreferences((current) =>
                    current
                      ? {
                          ...current,
                          [field.key]: parseList(event.target.value),
                        }
                      : current
                  )
                }
                placeholder={field.placeholder}
                rows={2}
                value={preferences[field.key].join(", ")}
              />
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="visa-need">Work authorization</Label>
            <select
              className="h-9 border border-input bg-background px-3 text-sm"
              id="visa-need"
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  visaNeed: event.target.value as Preferences["visaNeed"],
                })
              }
              value={preferences.visaNeed}
            >
              <option value="unknown">Unknown / varies</option>
              <option value="not_required">Sponsorship not required</option>
              <option value="has_authorization">
                I have work authorization
              </option>
              <option value="requires_sponsorship">
                I require sponsorship
              </option>
            </select>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Work modes</legend>
            <div className="flex flex-wrap gap-4">
              {(["remote", "hybrid", "onsite"] as const).map((mode) => (
                <label
                  className="flex items-center gap-2 text-sm capitalize"
                  key={mode}
                >
                  <input
                    checked={preferences.workModes.includes(mode)}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        workModes: event.target.checked
                          ? [...preferences.workModes, mode]
                          : preferences.workModes.filter(
                              (value) => value !== mode
                            ),
                      })
                    }
                    type="checkbox"
                  />
                  {mode}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </MemorySection>

      <MemorySection
        action={
          <Button
            onClick={() =>
              setEvidence((current) => [
                ...current,
                {
                  claim: "",
                  kind: "work",
                  source: "",
                  context: "",
                  verification: { state: "unverified" },
                  confidence: 0.8,
                  reusable: true,
                },
              ])
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus /> Add evidence
          </Button>
        }
        description="Claims and metrics need a recoverable source before generated work can rely on them."
        title="Evidence ledger"
      >
        <div className="grid gap-3">
          {evidence.map((entry, index) => (
            <EvidenceEditor
              entry={entry}
              key={entry.id ?? index}
              onChange={(next) =>
                setEvidence((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? next : value
                  )
                )
              }
              onRemove={() =>
                setEvidence((current) =>
                  current.filter((_, currentIndex) => currentIndex !== index)
                )
              }
            />
          ))}
          {evidence.length === 0 ? (
            <EmptyState text="No evidence saved yet." />
          ) : null}
        </div>
      </MemorySection>

      <MemorySection
        action={
          <Button
            onClick={() =>
              setRules((current) => [
                ...current,
                {
                  scope: "global",
                  instruction: "",
                  source: { type: "manual" },
                  active: true,
                },
              ])
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus /> Add rule
          </Button>
        }
        description="Explicit, editable instructions replace hidden prompt memory."
        title="Reusable writing rules"
      >
        <div className="grid gap-3">
          {rules.map((entry, index) => (
            <RuleEditor
              entry={entry}
              key={entry.id ?? index}
              onChange={(next) =>
                setRules((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? next : value
                  )
                )
              }
              onRemove={() =>
                setRules((current) =>
                  current.filter((_, currentIndex) => currentIndex !== index)
                )
              }
            />
          ))}
          {rules.length === 0 ? (
            <EmptyState text="No writing rules saved yet." />
          ) : null}
        </div>
      </MemorySection>

      <MemorySection
        description="Freeze the current profile as a proven starting point for one or more role families."
        title="CV baselines"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label="Baseline name"
            onChange={(event) =>
              setBaseline({ ...baseline, name: event.target.value })
            }
            placeholder="Senior frontend baseline"
            value={baseline.name}
          />
          <Input
            aria-label="Baseline role families"
            onChange={(event) =>
              setBaseline({ ...baseline, roleFamilies: event.target.value })
            }
            placeholder="Frontend, Product engineering"
            value={baseline.roleFamilies}
          />
          <Button
            disabled={saving || !baseline.name.trim()}
            onClick={() => void handleCreateBaseline()}
            type="button"
            variant="outline"
          >
            Create baseline
          </Button>
        </div>
        <div className="mt-4 divide-y divide-border border border-border">
          {memory.baselines.map((entry) => (
            <div
              className="flex items-center justify-between gap-3 px-3 py-3"
              key={entry._id}
            >
              <div>
                <p className="text-sm font-medium">{entry.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.roleFamilies.join(", ") || "All role families"}
                </p>
              </div>
              <Button
                aria-label={`Delete ${entry.name}`}
                onClick={() => void removeBaseline({ baselineId: entry._id })}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {memory.baselines.length === 0 ? (
            <EmptyState text="No CV baselines yet." />
          ) : null}
        </div>
      </MemorySection>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {savedAt ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="size-4" /> Memory saved.
        </p>
      ) : null}
    </form>
  )
}

function EvidenceEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: Evidence
  onChange: (entry: Evidence) => void
  onRemove: () => void
}) {
  return (
    <article className="grid gap-3 border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <Textarea
          className="min-h-20 flex-1"
          onChange={(event) =>
            onChange({ ...entry, claim: event.target.value })
          }
          placeholder="Claim or metric, exactly as it may be used"
          value={entry.claim}
        />
        <Button
          aria-label="Remove evidence"
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          className="h-9 border border-input bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({ ...entry, kind: event.target.value as Evidence["kind"] })
          }
          value={entry.kind}
        >
          {(
            [
              "work",
              "project",
              "education",
              "skill",
              "metric",
              "credential",
            ] as const
          ).map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <Input
          onChange={(event) =>
            onChange({ ...entry, source: event.target.value })
          }
          placeholder="Source: CV, portfolio, manager feedback"
          value={entry.source}
        />
        <Input
          onChange={(event) =>
            onChange({ ...entry, context: event.target.value })
          }
          placeholder="Context"
          value={entry.context}
        />
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            checked={entry.verification.state === "verified"}
            onChange={(event) =>
              onChange({
                ...entry,
                verification: event.target.checked
                  ? { state: "verified", verifiedAt: Date.now() }
                  : { state: "unverified" },
              })
            }
            type="checkbox"
          />{" "}
          Verified
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={entry.reusable}
            onChange={(event) =>
              onChange({ ...entry, reusable: event.target.checked })
            }
            type="checkbox"
          />{" "}
          Reusable
        </label>
        <label className="flex items-center gap-2">
          Confidence{" "}
          <input
            className="w-24"
            max="1"
            min="0"
            onChange={(event) =>
              onChange({ ...entry, confidence: Number(event.target.value) })
            }
            step="0.1"
            type="range"
            value={entry.confidence}
          />{" "}
          {Math.round(entry.confidence * 100)}%
        </label>
      </div>
    </article>
  )
}

function RuleEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: Rule
  onChange: (entry: Rule) => void
  onRemove: () => void
}) {
  return (
    <article className="grid gap-3 border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <Textarea
          className="min-h-20 flex-1"
          onChange={(event) =>
            onChange({ ...entry, instruction: event.target.value })
          }
          placeholder="e.g. Keep summaries under three lines and never use first person"
          value={entry.instruction}
        />
        <Button
          aria-label="Remove rule"
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="h-9 border border-input bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...entry,
              scope: event.target.value as Rule["scope"],
              roleFamily:
                event.target.value === "global" ? undefined : entry.roleFamily,
            })
          }
          value={entry.scope}
        >
          <option value="global">Global</option>
          <option value="role_family">Role family</option>
        </select>
        {entry.scope === "role_family" ? (
          <Input
            onChange={(event) =>
              onChange({ ...entry, roleFamily: event.target.value })
            }
            placeholder="Role family"
            value={entry.roleFamily ?? ""}
          />
        ) : (
          <div />
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={entry.active}
          onChange={(event) =>
            onChange({ ...entry, active: event.target.checked })
          }
          type="checkbox"
        />{" "}
        Active
      </label>
    </article>
  )
}

function MemorySection({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  description: string
  title: string
}) {
  return (
    <section className="border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed"
}
