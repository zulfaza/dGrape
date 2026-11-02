import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { cn } from "@/lib/utils"

/**
 * The landing page's example dashboard. It shows sample data only and cycles
 * through use cases. Rotation pauses while the pointer or focus is inside,
 * and never starts for reduced-motion users. The tabs are real controls.
 */

type Tone = "success" | "warning" | "neutral"

type UseCase = {
  id: string
  label: string
  collection: string
  metrics: ReadonlyArray<{ label: string; value: string }>
  chart: { label: string; bars: ReadonlyArray<number> }
  columns: readonly [string, string, string]
  rows: ReadonlyArray<{
    primary: string
    secondary: string
    value: string
    status: { label: string; tone: Tone }
  }>
}

const USE_CASES: ReadonlyArray<UseCase> = [
  {
    id: "jobs",
    label: "Job applications",
    collection: "Job applications",
    metrics: [
      { label: "Applied", value: "12" },
      { label: "Interviews", value: "3" },
      { label: "Offers", value: "1" },
    ],
    chart: { label: "Applications per week", bars: [2, 4, 3, 6, 5, 8] },
    columns: ["Company and role", "Salary", "Status"],
    rows: [
      {
        primary: "Linear",
        secondary: "Product engineer",
        value: "$165k",
        status: { label: "Interviewing", tone: "success" },
      },
      {
        primary: "PostHog",
        secondary: "Full-stack engineer",
        value: "$150k",
        status: { label: "Applied", tone: "warning" },
      },
      {
        primary: "Railway",
        secondary: "Software engineer",
        value: "$140k",
        status: { label: "Saved", tone: "neutral" },
      },
    ],
  },
  {
    id: "spending",
    label: "Spending",
    collection: "Monthly spending",
    metrics: [
      { label: "This month", value: "$1,240" },
      { label: "Groceries", value: "$380" },
      { label: "Subscriptions", value: "$64" },
    ],
    chart: { label: "Spending per week", bars: [7, 5, 6, 4, 8, 3] },
    columns: ["Merchant", "Amount", "Category"],
    rows: [
      {
        primary: "Fresh Market",
        secondary: "Nov 2",
        value: "$86.40",
        status: { label: "Groceries", tone: "success" },
      },
      {
        primary: "City Transit",
        secondary: "Nov 1",
        value: "$24.00",
        status: { label: "Transport", tone: "neutral" },
      },
      {
        primary: "Music stream",
        secondary: "Oct 31",
        value: "$10.99",
        status: { label: "Subscription", tone: "warning" },
      },
    ],
  },
  {
    id: "github",
    label: "GitHub activity",
    collection: "GitHub activity",
    metrics: [
      { label: "PRs merged", value: "18" },
      { label: "Reviews", value: "26" },
      { label: "Issues closed", value: "9" },
    ],
    chart: { label: "Commits per day", bars: [3, 7, 4, 9, 6, 2] },
    columns: ["Pull request", "Changes", "State"],
    rows: [
      {
        primary: "Add agent write tools",
        secondary: "dfe/app",
        value: "+412",
        status: { label: "Merged", tone: "success" },
      },
      {
        primary: "Share record checks",
        secondary: "dfe/app",
        value: "+96",
        status: { label: "In review", tone: "warning" },
      },
      {
        primary: "Normalize lockfile",
        secondary: "dfe/app",
        value: "+181",
        status: { label: "Draft", tone: "neutral" },
      },
    ],
  },
]

const ROTATE_MS = 5000

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  neutral: "bg-secondary text-secondary-foreground",
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** Cycles through the use cases unless paused or motion is reduced. */
function useRotation(
  count: number,
  paused: boolean
): [number, Dispatch<SetStateAction<number>>] {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (paused || prefersReducedMotion()) return
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % count),
      ROTATE_MS
    )
    return () => window.clearTimeout(timer)
  }, [index, paused, count])
  return [index, setIndex]
}

export function HeroDashboard({
  onChange,
}: {
  /** Called with the use case index each time the view changes. */
  onChange?: (index: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useRotation(USE_CASES.length, hovered || focused)
  const active = USE_CASES[index] ?? USE_CASES[0]
  useEffect(() => onChange?.(index), [index, onChange])
  const max = Math.max(...active.chart.bars)

  return (
    <div
      className="dfe-anim dfe-rise overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_24px_60px_-28px_rgb(36_51_43/0.45)]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false)
      }}
    >
      <div className="flex items-center gap-3 border-b bg-secondary px-4 py-2.5">
        <div aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          Example workspace, sample data
        </p>
      </div>
      <div className="grid md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Example collections"
          className="hidden flex-col gap-1 bg-sidebar p-3 text-sidebar-foreground md:flex"
        >
          <p className="mb-1 flex items-center gap-2 px-2 py-1 text-sm font-semibold">
            <img src="/favicon.svg" alt="" width={20} height={20} />
            DFE
          </p>
          {USE_CASES.map((useCase, i) => (
            <span
              key={useCase.id}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs transition-colors duration-300",
                i === index
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-muted"
              )}
            >
              {useCase.collection}
            </span>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
          <div
            role="tablist"
            aria-label="Example use cases"
            className="flex flex-wrap gap-1 self-start rounded-lg bg-secondary p-1"
          >
            {USE_CASES.map((useCase, i) => (
              <button
                key={useCase.id}
                type="button"
                role="tab"
                id={`hero-tab-${useCase.id}`}
                aria-selected={i === index}
                aria-controls="hero-panel"
                onClick={() => setIndex(i)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === index
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {useCase.label}
              </button>
            ))}
          </div>
          <div
            key={active.id}
            id="hero-panel"
            role="tabpanel"
            aria-labelledby={`hero-tab-${active.id}`}
            className="flex flex-col gap-4"
          >
            <ul className="grid grid-cols-3 gap-2 sm:gap-3">
              {active.metrics.map((metric, i) => (
                <li
                  key={metric.label}
                  className="dfe-anim dfe-row-in rounded-lg border px-3 py-2.5"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <p className="truncate text-xs text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="text-lg font-semibold tabular-nums sm:text-xl">
                    {metric.value}
                  </p>
                </li>
              ))}
            </ul>
            <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <figure className="flex flex-col gap-2 rounded-lg border p-3">
                <figcaption className="text-xs text-muted-foreground">
                  {active.chart.label}
                </figcaption>
                <div
                  className="flex min-h-24 flex-1 items-end gap-2"
                  role="img"
                  aria-label={`${active.chart.label}: ${active.chart.bars.join(", ")}`}
                >
                  {active.chart.bars.map((bar, i) => (
                    <span
                      key={i}
                      className={cn(
                        "dfe-anim dfe-bar-grow flex-1 rounded-t-sm",
                        i === active.chart.bars.length - 1
                          ? "bg-chart-3"
                          : "bg-chart-1"
                      )}
                      style={{
                        height: `${(bar / max) * 100}%`,
                        animationDelay: `${150 + i * 60}ms`,
                      }}
                    />
                  ))}
                </div>
              </figure>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{active.collection}</caption>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">{active.columns[0]}</th>
                    <th className="pb-2 text-right font-medium">
                      {active.columns[1]}
                    </th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      {active.columns[2]}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {active.rows.map((row, i) => (
                    <tr
                      key={row.primary}
                      className="dfe-anim dfe-row-in"
                      style={{ animationDelay: `${250 + i * 90}ms` }}
                    >
                      <td className="py-2 pr-3">
                        <span className="block truncate font-medium">
                          {row.primary}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.secondary}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.value}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            TONE_CLASSES[row.status.tone]
                          )}
                        >
                          {row.status.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
