import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  BUDGET_KEYS,
  BUDGET_SPECS,
  type BudgetKey,
  type BudgetOverrides,
  type BudgetSpec,
} from "../../convex/lib/budgets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"

function formatAmount(value: number, unit: BudgetSpec["unit"]) {
  switch (unit) {
    case "count":
      return value.toLocaleString()
    case "bytes":
      if (value < 1024) return `${value} B`
      if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
      if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
      return `${(value / 1024 ** 3).toFixed(1)} GB`
    case "ms":
      return value < 60_000
        ? `${(value / 1000).toFixed(1)} s`
        : `${(value / 60_000).toFixed(1)} min`
    case "days":
      return `${value.toLocaleString()} days`
  }
}

type Usage = FunctionReturnType<typeof api.workspaceBudgets.usage>

/** A lower bound while a count is still being scanned. */
type Used = { value: number; partial: boolean; note?: string } | null

function usedFor(key: BudgetKey, usage: Usage): Used {
  switch (key) {
    case "recordsPerCollection": {
      let largest: Usage["collections"][number] | null = null
      for (const c of usage.collections)
        if (!largest || (c.records?.count ?? 0) > (largest.records?.count ?? 0))
          largest = c
      if (!largest) return null
      return {
        value: largest.records?.count ?? 0,
        partial: largest.records?.kind !== "counted",
        note: largest.name,
      }
    }
    case "indexedFieldsPerCollection": {
      const most = Math.max(0, ...usage.collections.map((c) => c.indexedFields))
      return usage.collections.length ? { value: most, partial: false } : null
    }
    case "artifactTotalBytes":
      return {
        value: usage.artifacts?.bytes ?? 0,
        partial: usage.artifacts?.kind !== "counted",
      }
    case "runSteps":
      return usage.recentRuns.mostSteps === null
        ? null
        : { value: usage.recentRuns.mostSteps, partial: false }
    case "runDurationMs":
      return usage.recentRuns.longestMs === null
        ? null
        : { value: usage.recentRuns.longestMs, partial: false }
    case "queryRowsRead":
    case "queryBytesRead":
    case "artifactFileBytes":
    case "runRetentionDays":
      return null
  }
}

/**
 * The workspace's budgets next to what it uses, and a form to lower them.
 * Each budget is at most its platform ceiling.
 */
export function WorkspaceUsage({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const budgets = useQuery(api.workspaceBudgets.get, { workspaceId })
  const usage = useQuery(api.workspaceBudgets.usage, { workspaceId })
  if (!budgets || !usage)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading usage…
      </p>
    )
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="usage-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="usage-heading" className="text-base font-semibold">
            Usage
          </h2>
          <p className="text-sm text-muted-foreground">
            Work that would go over a budget does not start. A lower budget
            never deletes data.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Budget</TableHead>
              <TableHead className="text-right">In use</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Ceiling</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BUDGET_KEYS.map((key) => {
              const spec = BUDGET_SPECS[key]
              const used = usedFor(key, usage)
              return (
                <TableRow key={key}>
                  <TableCell>{spec.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {used === null ? (
                      "—"
                    ) : (
                      <>
                        {used.partial ? "≥ " : ""}
                        {formatAmount(used.value, spec.unit)}
                        {used.note ? (
                          <span className="block text-xs text-muted-foreground">
                            {used.note}
                          </span>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(budgets.budgets[key], spec.unit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(spec.max, spec.unit)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {usage.recentRuns.count > 0
            ? `Run figures use the last ${usage.recentRuns.count} runs. `
            : ""}
          “≥” marks a count that is still being calculated.
        </p>
      </section>
      <section
        aria-labelledby="collections-usage-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="collections-usage-heading" className="text-base font-semibold">
          Collections
        </h2>
        {usage.collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collection</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Indexed fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.collections.map((c) => (
                <TableRow key={c.collectionId}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.records === null
                      ? "Not counted yet"
                      : `${c.records.kind === "counted" ? "" : "≥ "}${c.records.count.toLocaleString()}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.indexedFields}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {usage.moreCollections ? (
          <p className="text-xs text-muted-foreground">
            Only the first {usage.collections.length} collections are shown.
          </p>
        ) : null}
      </section>
      <BudgetForm
        key={JSON.stringify(budgets.overrides)}
        workspaceId={workspaceId}
        overrides={budgets.overrides}
      />
    </div>
  )
}

/** Each field is empty for the default. Saving replaces all overrides. */
function BudgetForm({
  workspaceId,
  overrides,
}: {
  workspaceId: Id<"workspaces">
  overrides: BudgetOverrides
}) {
  const save = useMutation(api.workspaceBudgets.set)
  const [values, setValues] = useState<Partial<Record<BudgetKey, string>>>(
    () => {
      const initial: Partial<Record<BudgetKey, string>> = {}
      for (const key of BUDGET_KEYS) {
        const value = overrides[key]
        if (value !== undefined) initial[key] = String(value)
      }
      return initial
    }
  )
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: BudgetOverrides = {}
    for (const key of BUDGET_KEYS) {
      const text = values[key]?.trim()
      if (!text) continue
      const value = Number(text)
      const { label, min, max } = BUDGET_SPECS[key]
      if (!Number.isSafeInteger(value) || value < min || value > max) {
        toast.error(`${label} must be an integer from ${min} to ${max}`)
        return
      }
      next[key] = value
    }
    setBusy(true)
    try {
      await save({ workspaceId, overrides: next })
      toast.success("Budgets saved")
    } catch {
      toast.error("Could not save the budgets")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="budgets-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="budgets-heading" className="text-base font-semibold">
          Change budgets
        </h2>
        <p className="text-sm text-muted-foreground">
          Leave a field empty to use the default. Amounts use the base unit:
          bytes, milliseconds or days.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {BUDGET_KEYS.map((key) => {
            const spec = BUDGET_SPECS[key]
            const id = `budget-${key}`
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-sm font-medium">
                  {spec.label}
                </label>
                <Input
                  id={id}
                  inputMode="numeric"
                  placeholder={String(spec.default)}
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {spec.min} to {spec.max}. Default{" "}
                  {formatAmount(spec.default, spec.unit)}.
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save budgets"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setValues({})}
          >
            Clear all
          </Button>
        </div>
      </form>
    </section>
  )
}
