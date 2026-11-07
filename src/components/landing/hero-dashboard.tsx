import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react"
import { cn } from "@/lib/utils"

/**
 * The landing page's example dashboard: the DFE app in a browser window,
 * laid out at a 1440x900 laptop screen and scaled to fit. It shows sample
 * data only and cycles through use cases. Rotation pauses while the pointer
 * or focus is inside, and never starts for reduced-motion users. The
 * sidebar collections are real tabs.
 */

const SCREEN = { width: 1440, height: 900 }

/**
 * Custom properties that the hero's classes read: the screen size and fit
 * transform (the `aspect-`, `w-`, `h-` and `transform-` classes), the bar
 * height, and the stagger delay of the motion classes in src/app.css.
 */
type HeroStyle = CSSProperties & {
  "--hero-aspect"?: string
  "--hero-width"?: string
  "--hero-height"?: string
  "--hero-transform"?: string
  "--hero-bar-height"?: string
  "--dfe-delay"?: string
}

type Tone = "success" | "warning" | "neutral"

type UseCase = {
  id: string
  collection: string
  updated: string
  metrics: ReadonlyArray<{ label: string; value: string; note: string }>
  chart: {
    label: string
    unit: string
    bars: ReadonlyArray<number>
    labels: ReadonlyArray<string>
  }
  activity: ReadonlyArray<{ action: string; time: string }>
  columns: readonly [string, string, string, string]
  rows: ReadonlyArray<{
    primary: string
    secondary: string
    value: string
    date: string
    status: { label: string; tone: Tone }
  }>
}

const WEEKS = ["Sep 8", "", "", "Sep 29", "", "", "Oct 20", "", "", "Nov 2"]

const USE_CASES: ReadonlyArray<UseCase> = [
  {
    id: "jobs",
    collection: "Job applications",
    updated: "Your agent added 3 records 2 minutes ago",
    metrics: [
      { label: "Applied", value: "24", note: "6 this week" },
      { label: "Interviews", value: "5", note: "2 scheduled" },
      { label: "Offers", value: "1", note: "Reply by Nov 9" },
      { label: "Response rate", value: "38%", note: "Up from 30%" },
    ],
    chart: {
      label: "Applications per week",
      unit: "applications",
      bars: [1, 3, 2, 4, 2, 5, 3, 6, 4, 6],
      labels: WEEKS,
    },
    activity: [
      { action: "Added Linear, product engineer", time: "2 min ago" },
      { action: "Moved PostHog to Interviewing", time: "1 hr ago" },
      { action: "Saved salary range for Railway", time: "Yesterday" },
    ],
    columns: ["Company and role", "Salary", "Updated", "Status"],
    rows: [
      {
        primary: "Linear",
        secondary: "Product engineer",
        value: "$165k",
        date: "Nov 2",
        status: { label: "Applied", tone: "warning" },
      },
      {
        primary: "PostHog",
        secondary: "Full-stack engineer",
        value: "$150k",
        date: "Nov 2",
        status: { label: "Interviewing", tone: "success" },
      },
      {
        primary: "Railway",
        secondary: "Software engineer",
        value: "$140k",
        date: "Nov 1",
        status: { label: "Saved", tone: "neutral" },
      },
      {
        primary: "GitHub",
        secondary: "Backend engineer",
        value: "$170k",
        date: "Oct 31",
        status: { label: "Offer", tone: "success" },
      },
      {
        primary: "Vercel",
        secondary: "Developer advocate",
        value: "$145k",
        date: "Oct 30",
        status: { label: "Applied", tone: "warning" },
      },
    ],
  },
  {
    id: "spending",
    collection: "Monthly spending",
    updated: "Your agent imported 42 transactions this morning",
    metrics: [
      { label: "This month", value: "$1,240", note: "Budget $1,800" },
      { label: "Groceries", value: "$380", note: "31% of total" },
      { label: "Subscriptions", value: "$64", note: "7 active" },
      { label: "Saved", value: "$560", note: "Up $120" },
    ],
    chart: {
      label: "Spending per week",
      unit: "dollars",
      bars: [320, 280, 410, 260, 300, 350, 240, 390, 310, 270],
      labels: WEEKS,
    },
    activity: [
      { action: "Imported 42 bank transactions", time: "8:02 AM" },
      { action: "Tagged 6 transactions as groceries", time: "8:03 AM" },
      { action: "Flagged a duplicate charge", time: "Yesterday" },
    ],
    columns: ["Merchant", "Amount", "Date", "Category"],
    rows: [
      {
        primary: "Fresh Market",
        secondary: "Card ending 4021",
        value: "$86.40",
        date: "Nov 2",
        status: { label: "Groceries", tone: "success" },
      },
      {
        primary: "City Transit",
        secondary: "Monthly pass",
        value: "$24.00",
        date: "Nov 1",
        status: { label: "Transport", tone: "neutral" },
      },
      {
        primary: "Music stream",
        secondary: "Family plan",
        value: "$10.99",
        date: "Oct 31",
        status: { label: "Subscription", tone: "warning" },
      },
      {
        primary: "Corner Cafe",
        secondary: "Card ending 4021",
        value: "$6.50",
        date: "Oct 31",
        status: { label: "Eating out", tone: "neutral" },
      },
      {
        primary: "Home Supply",
        secondary: "Card ending 7788",
        value: "$42.15",
        date: "Oct 30",
        status: { label: "Home", tone: "neutral" },
      },
    ],
  },
  {
    id: "github",
    collection: "GitHub activity",
    updated: "Your agent synced 3 repositories an hour ago",
    metrics: [
      { label: "PRs merged", value: "18", note: "This month" },
      { label: "Reviews", value: "26", note: "4 waiting" },
      { label: "Issues closed", value: "9", note: "3 opened" },
      { label: "Median merge", value: "6 h", note: "Down from 9 h" },
    ],
    chart: {
      label: "Commits per week",
      unit: "commits",
      bars: [12, 18, 9, 22, 15, 26, 19, 31, 24, 28],
      labels: WEEKS,
    },
    activity: [
      { action: "Synced dfe/app pull requests", time: "1 hr ago" },
      { action: "Linked 2 PRs to open issues", time: "1 hr ago" },
      { action: "Summarized last week's reviews", time: "Monday" },
    ],
    columns: ["Pull request", "Changes", "Updated", "State"],
    rows: [
      {
        primary: "Add agent write tools",
        secondary: "dfe/app #24",
        value: "+412",
        date: "Nov 2",
        status: { label: "Merged", tone: "success" },
      },
      {
        primary: "Share record checks",
        secondary: "dfe/app #21",
        value: "+96",
        date: "Nov 2",
        status: { label: "Merged", tone: "success" },
      },
      {
        primary: "Animate landing sloth",
        secondary: "dfe/app #28",
        value: "+188",
        date: "Nov 2",
        status: { label: "In review", tone: "warning" },
      },
      {
        primary: "Record schema changes",
        secondary: "dfe/app #29",
        value: "+240",
        date: "Nov 1",
        status: { label: "Draft", tone: "neutral" },
      },
      {
        primary: "Normalize lockfile",
        secondary: "dfe/app #11",
        value: "+181",
        date: "Oct 30",
        status: { label: "Merged", tone: "success" },
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

/** The hero's width on a wide screen (max-w-6xl less padding) over SCREEN. */
const DEFAULT_SCALE = 1088 / SCREEN.width

/** The scale that fits a SCREEN-sized layout into the element's width. */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null)
  // The server cannot measure, so it renders at the widest layout's scale.
  // The client corrects it before the first paint after hydration.
  const [scale, setScale] = useState(DEFAULT_SCALE)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setScale(element.clientWidth / SCREEN.width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, scale }
}

export function HeroDashboard() {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useRotation(USE_CASES.length, hovered || focused)
  const active = USE_CASES[index] ?? USE_CASES[0]
  const { ref, scale } = useFitScale()
  const frameStyle: HeroStyle = {
    "--hero-aspect": `${SCREEN.width} / ${SCREEN.height}`,
  }
  const screenStyle: HeroStyle = {
    "--hero-width": `${SCREEN.width}px`,
    "--hero-height": `${SCREEN.height}px`,
    "--hero-transform": `scale(${scale})`,
  }

  return (
    <div
      ref={ref}
      className="relative aspect-(--hero-aspect) w-full overflow-hidden rounded-window border bg-card shadow-window"
      style={frameStyle}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false)
      }}
    >
      <div
        className="dfe-anim dfe-rise absolute top-0 left-0 flex h-(--hero-height) w-(--hero-width) origin-top-left transform-(--hero-transform) flex-col text-card-foreground"
        style={screenStyle}
      >
        <WindowBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar activeIndex={index} onSelect={(i) => setIndex(i)} />
          <Screen useCase={active} />
        </div>
      </div>
    </div>
  )
}

function WindowBar() {
  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b bg-secondary px-4">
      <div aria-hidden className="flex gap-2">
        <span className="size-3 rounded-full bg-window-close" />
        <span className="size-3 rounded-full bg-window-minimize" />
        <span className="size-3 rounded-full bg-window-maximize" />
      </div>
      <p className="mx-auto w-[28rem] truncate rounded-md bg-card px-3 py-1 text-center text-xs text-muted-foreground">
        dfe.makarima.dev, example workspace with sample data
      </p>
      <span aria-hidden className="w-14" />
    </div>
  )
}

function Sidebar({
  activeIndex,
  onSelect,
}: {
  activeIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <nav
      aria-label="Example workspace"
      className="flex w-64 shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground"
    >
      <p className="flex items-center gap-2 px-2 text-xl font-semibold">
        <img src="/favicon.svg" alt="" width={32} height={32} />
        DFE
      </p>
      <div className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs text-sidebar-muted">
          Personal workspace
        </p>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Example collections"
          className="flex flex-col gap-1"
        >
          {USE_CASES.map((useCase, i) => (
            <button
              key={useCase.id}
              type="button"
              role="tab"
              id={`hero-tab-${useCase.id}`}
              aria-selected={i === activeIndex}
              aria-controls="hero-panel"
              onClick={() => onSelect(i)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                i === activeIndex
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:text-sidebar-foreground"
              )}
            >
              {useCase.collection}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3 px-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">
          A
        </span>
        <span className="text-sm">Alex</span>
      </div>
    </nav>
  )
}

function Screen({ useCase }: { useCase: UseCase }) {
  const max = Math.max(...useCase.chart.bars)
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center border-b bg-card px-8 text-sm text-muted-foreground">
        Workspaces
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-foreground">{useCase.collection}</span>
      </div>
      <div
        key={useCase.id}
        id="hero-panel"
        role="tabpanel"
        aria-labelledby={`hero-tab-${useCase.id}`}
        className="flex min-h-0 flex-col gap-6 overflow-hidden px-8 pt-7"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-3xl font-semibold tracking-tight">
              {useCase.collection}
            </h3>
            <p className="dfe-anim dfe-row-in mt-1 text-base text-muted-foreground">
              {useCase.updated}
            </p>
          </div>
          <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            New record
          </span>
        </div>
        <ul className="grid grid-cols-4 gap-4">
          {useCase.metrics.map((metric, i) => {
            const style: HeroStyle = { "--dfe-delay": `${i * 70}ms` }
            return (
              <li
                key={metric.label}
                className="dfe-anim dfe-row-in rounded-lg border bg-card px-5 py-4"
                style={style}
              >
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {metric.note}
                </p>
              </li>
            )
          })}
        </ul>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
          <figure className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <figcaption className="text-sm font-medium">
              {useCase.chart.label}
            </figcaption>
            <div
              className="flex h-36 items-end gap-3"
              role="img"
              aria-label={`${useCase.chart.label}, ${useCase.chart.unit}: ${useCase.chart.bars.join(", ")}`}
            >
              {useCase.chart.bars.map((bar, i) => {
                const style: HeroStyle = {
                  "--hero-bar-height": `${(bar / max) * 100}%`,
                  "--dfe-delay": `${150 + i * 50}ms`,
                }
                return (
                  <span
                    key={i}
                    className={cn(
                      "dfe-anim dfe-bar-grow h-(--hero-bar-height) flex-1 rounded-t-sm",
                      i === useCase.chart.bars.length - 1
                        ? "bg-chart-3"
                        : "bg-chart-1"
                    )}
                    style={style}
                  />
                )
              })}
            </div>
            <div
              aria-hidden
              className="flex gap-3 text-xs text-muted-foreground"
            >
              {useCase.chart.labels.map((label, i) => (
                <span key={i} className="flex-1 truncate">
                  {label}
                </span>
              ))}
            </div>
          </figure>
          <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <h4 className="text-sm font-medium">Agent activity</h4>
            <ul className="flex flex-col gap-3">
              {useCase.activity.map((item, i) => {
                const style: HeroStyle = { "--dfe-delay": `${200 + i * 90}ms` }
                return (
                  <li
                    key={item.action}
                    className="dfe-anim dfe-row-in flex flex-col"
                    style={style}
                  >
                    <span className="text-sm">{item.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.time}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{useCase.collection}</caption>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">{useCase.columns[0]}</th>
                <th className="px-5 py-3 text-right font-medium">
                  {useCase.columns[1]}
                </th>
                <th className="px-5 py-3 font-medium">{useCase.columns[2]}</th>
                <th className="px-5 py-3 text-right font-medium">
                  {useCase.columns[3]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {useCase.rows.map((row, i) => {
                const style: HeroStyle = { "--dfe-delay": `${300 + i * 80}ms` }
                return (
                  <tr
                    key={row.primary}
                    className="dfe-anim dfe-row-in"
                    style={style}
                  >
                    <td className="px-5 py-3">
                      <span className="block font-medium">{row.primary}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.secondary}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.value}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.date}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                          TONE_CLASSES[row.status.tone]
                        )}
                      >
                        {row.status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
