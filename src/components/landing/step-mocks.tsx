import { useEffect, useRef, useState, type ReactNode } from "react"
import { Mascot, type MascotPose } from "@/components/mascot"
import { cn } from "@/lib/utils"

/**
 * "How it works" on the landing page: each step is a small animated mock of
 * the real product with the sloth at its side. A mock plays while it is on
 * screen, holds its finished state, then replays. Reduced-motion users see
 * the finished state only. All data is sample data.
 */

const STEP_MS = 700
const HOLD_MS = 3200

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** True while at least a third of the element is in the viewport. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.33 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, inView }
}

/**
 * Counts from 0 to `length`, one step per STEP_MS while `active`, holds the
 * last step for HOLD_MS, then starts again. Returns `length` (the finished
 * state) when motion is reduced.
 */
function useSequence(length: number, active: boolean) {
  const [step, setStep] = useState(0)
  const [reduced, setReduced] = useState(false)
  useEffect(() => setReduced(prefersReducedMotion()), [])
  useEffect(() => {
    if (!active || reduced) return
    const timer = window.setTimeout(
      () => setStep((current) => (current >= length ? 0 : current + 1)),
      step >= length ? HOLD_MS : STEP_MS
    )
    return () => window.clearTimeout(timer)
  }, [step, active, reduced, length])
  return reduced ? length : step
}

function MockWindow({
  title,
  dark = false,
  children,
}: {
  title: string
  dark?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border shadow-[0_24px_60px_-30px_rgb(36_51_43/0.5)]",
        dark ? "border-[#2f3a33] bg-[#1f2622] text-[#e9eaec]" : "bg-card"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-4 py-2.5",
          dark ? "border-[#2f3a33]" : "bg-secondary"
        )}
      >
        <div aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#e5867a]" />
          <span className="size-2.5 rounded-full bg-[#e6bd5b]" />
          <span className="size-2.5 rounded-full bg-[#8cc9a7]" />
        </div>
        <p
          className={cn(
            "truncate text-xs",
            dark ? "text-[#b5b8be]" : "text-muted-foreground"
          )}
        >
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}

const NEW_FIELDS = [
  { label: "Company", id: "company", type: "Text" },
  { label: "Salary", id: "salary", type: "Number" },
  { label: "Applied", id: "applied", type: "Yes / no" },
]

/** A create-collection dialog that fills itself in. 6 steps. */
function CollectionMock({ step }: { step: number }) {
  return (
    <MockWindow title="Create collection">
      <div className="flex min-h-[19rem] flex-col gap-3 p-5">
        <p className="text-xs font-medium text-muted-foreground">Name</p>
        <div className="flex h-9 items-center rounded-md border px-3 text-sm">
          {step >= 1 && (
            <span className="dfe-anim dfe-type-line font-medium">
              Job applications
            </span>
          )}
          {step < 2 && (
            <span className="dfe-caret ml-px h-4 w-px bg-foreground" />
          )}
        </div>
        <p className="mt-1 text-xs font-medium text-muted-foreground">Fields</p>
        <ul className="flex flex-col gap-2">
          {NEW_FIELDS.map((field, i) =>
            step >= i + 2 ? (
              <li
                key={field.id}
                className="dfe-anim dfe-row-in grid grid-cols-[1fr_1fr_5.5rem] gap-2 text-sm"
              >
                <span className="rounded-md border px-3 py-1.5">
                  {field.label}
                </span>
                <span className="rounded-md border px-3 py-1.5 font-mono text-xs leading-5">
                  {field.id}
                </span>
                <span className="rounded-md border px-3 py-1.5 text-muted-foreground">
                  {field.type}
                </span>
              </li>
            ) : null
          )}
        </ul>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          {step >= 6 ? (
            <span className="dfe-anim dfe-row-in rounded-md bg-success-surface px-2.5 py-1 text-xs font-medium text-success">
              Collection created
            </span>
          ) : (
            <span />
          )}
          <span
            className={cn(
              "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-transform duration-200",
              step === 5 && "scale-95"
            )}
          >
            Create collection
          </span>
        </div>
      </div>
    </MockWindow>
  )
}

const TERMINAL_LINES: ReadonlyArray<{
  text: string
  tone: "command" | "ok" | "prompt" | "tool" | "plain"
  typed?: boolean
}> = [
  {
    text: "$ claude mcp add --transport http dfe https://dfe.makarima.dev/mcp",
    tone: "command",
    typed: true,
  },
  { text: "Added HTTP MCP server dfe", tone: "ok" },
  {
    text: "> Track my Linear application: product engineer, $165k",
    tone: "prompt",
    typed: true,
  },
  { text: "dfe records_create (Job applications)", tone: "tool" },
  { text: "  created, revision 1", tone: "plain" },
  { text: "Added Linear to Job applications.", tone: "plain" },
]

const TONE: Record<(typeof TERMINAL_LINES)[number]["tone"], string> = {
  command: "text-[#e9eaec]",
  ok: "text-[#8cc9a7]",
  prompt: "text-[#e6bd5b]",
  tool: "text-[#a1b6c4]",
  plain: "text-[#b5b8be]",
}

/** A terminal that connects the agent and runs one tool call. 6 steps. */
function AgentMock({ step }: { step: number }) {
  return (
    <MockWindow title="Terminal" dark>
      <div className="flex min-h-[19rem] flex-col gap-2 p-5 font-mono text-[13px] leading-5">
        {TERMINAL_LINES.map((line, i) =>
          step >= i + 1 ? (
            <p
              key={line.text}
              className={cn(
                "dfe-anim min-w-0 whitespace-pre-wrap",
                line.typed ? "dfe-type-line" : "dfe-row-in",
                TONE[line.tone]
              )}
            >
              {line.tone === "tool" && (
                <span aria-hidden className="mr-2 text-[#8cc9a7]">
                  ●
                </span>
              )}
              {line.text}
            </p>
          ) : null
        )}
        {step < TERMINAL_LINES.length && (
          <span className="dfe-caret h-4 w-2 bg-[#e9eaec]" />
        )}
      </div>
    </MockWindow>
  )
}

const NEW_RECORDS = [
  {
    company: "Linear",
    role: "Product engineer",
    salary: "$165k",
    applied: true,
  },
  {
    company: "PostHog",
    role: "Full-stack engineer",
    salary: "$150k",
    applied: true,
  },
  {
    company: "Railway",
    role: "Software engineer",
    salary: "$140k",
    applied: false,
  },
  {
    company: "Vercel",
    role: "Developer advocate",
    salary: "$145k",
    applied: true,
  },
]

/** A records table that the agent fills row by row. 4 steps. */
function RecordsMock({ step }: { step: number }) {
  const shown = NEW_RECORDS.slice(0, step)
  return (
    <MockWindow title="Job applications">
      <div className="flex min-h-[19rem] flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">Job applications</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {shown.length === 1 ? "1 record" : `${shown.length} records`}
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium">Company and role</th>
              <th className="px-5 py-2 text-right font-medium">Salary</th>
              <th className="px-5 py-2 text-right font-medium">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((record, i) => (
              <tr
                key={record.company}
                className={cn(
                  "dfe-anim",
                  i === shown.length - 1 ? "dfe-flash" : "dfe-row-in"
                )}
              >
                <td className="px-5 py-2.5">
                  <span className="flex items-center gap-2 font-medium">
                    {record.company}
                    {i === shown.length - 1 && (
                      <span className="rounded-full bg-mascot-surface px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        Added by agent
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {record.role}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {record.salary}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {record.applied ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockWindow>
  )
}

const STEPS: ReadonlyArray<{
  title: string
  body: string
  pose: MascotPose
  length: number
  Mock: (props: { step: number }) => ReactNode
}> = [
  {
    title: "Make a collection",
    body: "Name the fields you care about, such as company, salary, and applied. There is no database to set up, and you can add fields later.",
    pose: "chart",
    length: 6,
    Mock: CollectionMock,
  },
  {
    title: "Connect your agent",
    body: "Create a credential and add DFE to your agent over MCP with one command. Choose read only, or read and write.",
    pose: "laptop",
    length: TERMINAL_LINES.length,
    Mock: AgentMock,
  },
  {
    title: "Let it fill the table",
    body: "Your agent adds and updates records while it works. You see each change here, and retries never make duplicates.",
    pose: "celebrate",
    length: NEW_RECORDS.length,
    Mock: RecordsMock,
  },
]

/** A mock with the sloth standing beside it. */
function MockWithSloth({
  pose,
  side,
  children,
}: {
  pose: MascotPose
  side: "left" | "right"
  children: ReactNode
}) {
  return (
    // Phones: the sloth stands on the window's title bar. Wider: it stands
    // beside the window, overlapping only its edge, never its content.
    <div
      className={cn(
        "relative pt-24 sm:pt-0 sm:pb-6",
        side === "left" ? "sm:pl-36" : "sm:pr-36"
      )}
    >
      {children}
      <Mascot
        pose={pose}
        size={192}
        className={cn(
          "absolute top-0 right-2 h-auto w-28 sm:top-auto sm:bottom-0 sm:w-44",
          side === "left" ? "sm:right-auto sm:-left-4" : "sm:-right-4"
        )}
      />
    </div>
  )
}

const WORKSPACES = [
  { name: "Job search", detail: "3 collections" },
  { name: "Home budget", detail: "2 collections" },
  { name: "Side project", detail: "1 collection" },
]

/** The workspace list filling up, for the closing call to action. 3 steps. */
function WorkspacesMock({ step }: { step: number }) {
  return (
    <MockWindow title="Your workspaces">
      <ul className="flex min-h-[9.5rem] flex-col divide-y text-foreground">
        {WORKSPACES.slice(0, step).map((workspace, i) => (
          <li
            key={workspace.name}
            className={cn(
              "dfe-anim flex items-center justify-between gap-4 px-5 py-3.5",
              i === step - 1 ? "dfe-flash" : "dfe-row-in"
            )}
          >
            <span className="font-medium">{workspace.name}</span>
            <span className="text-sm text-muted-foreground">
              {workspace.detail}
            </span>
          </li>
        ))}
      </ul>
    </MockWindow>
  )
}

export function WorkspacesShowcase() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const current = useSequence(WORKSPACES.length, inView)
  return (
    <div ref={ref} className="w-full sm:w-[30rem]">
      <MockWithSloth pose="wave" side="right">
        <WorkspacesMock step={current} />
      </MockWithSloth>
    </div>
  )
}

function StepRow({
  index,
  step,
}: {
  index: number
  step: (typeof STEPS)[number]
}) {
  const { ref, inView } = useInView<HTMLLIElement>()
  const current = useSequence(step.length, inView)
  const mockFirst = index % 2 === 1
  const { Mock } = step
  return (
    <li ref={ref} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
      <div className={cn("flex flex-col gap-3", mockFirst && "md:order-last")}>
        <p className="text-sm font-medium text-muted-foreground tabular-nums">
          Step {index + 1}
        </p>
        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {step.title}
        </h3>
        <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
          {step.body}
        </p>
      </div>
      <MockWithSloth pose={step.pose} side={mockFirst ? "right" : "left"}>
        <Mock step={current} />
      </MockWithSloth>
    </li>
  )
}

export function HowItWorks() {
  return (
    <ol className="mt-12 flex flex-col gap-20 sm:gap-24">
      {STEPS.map((step, index) => (
        <StepRow key={step.title} index={index} step={step} />
      ))}
    </ol>
  )
}
