import { useEffect, useRef, useState, type ReactNode } from "react"
import { WavingSloth } from "@/components/landing/waving-sloth"
import { LayoutDashboard, FolderOpen, Plus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
    if (!active || reduced || length === 0) return
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

/** A sample workspace opening in the dashboard. */
function DashboardMock({ step }: { step: number }) {
  return (
    <MockWindow title="DFE / Your dashboard">
      <div className="flex min-h-[19rem] flex-col gap-5 p-5">
        <div className="flex items-center gap-2 border-b pb-4">
          <LayoutDashboard aria-hidden className="size-4 text-primary" />
          <p className="text-sm font-semibold">Your workspaces</p>
          <span className="ml-auto text-xs text-muted-foreground">Example</span>
        </div>
        <div>
          <p className="text-lg font-semibold">A place for your next project</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep your data and agents together in one workspace.
          </p>
        </div>
        {step >= 1 && (
          <div className="dfe-anim dfe-row-in flex items-center gap-3 rounded-lg border p-4">
            <FolderOpen aria-hidden className="size-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Job search</p>
              <p className="text-xs text-muted-foreground">
                Your new workspace
              </p>
            </div>
          </div>
        )}
        <span className="mt-auto flex w-fit items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          <Plus aria-hidden className="size-4" />
          Create workspace
        </span>
      </div>
    </MockWindow>
  )
}

const AGENTS = [
  { id: "claude", name: "Claude", chat: "Claude Code" },
  { id: "codex", name: "Codex", chat: "Codex" },
  { id: "cursor", name: "Cursor", chat: "Cursor's agent chat" },
]

/** Agent choices show a sample connection prompt, without making a connection. */
function AgentMock() {
  return (
    <MockWindow title="Connect your agent">
      <div className="flex min-h-[19rem] flex-col gap-4 p-5">
        <p className="text-sm font-semibold">Use the agent you already know</p>
        <Tabs defaultValue="claude">
          <TabsList aria-label="Choose an agent" className="w-full">
            {AGENTS.map((agent) => (
              <TabsTrigger key={agent.id} value={agent.id}>
                {agent.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {AGENTS.map((agent) => (
            <TabsContent key={agent.id} value={agent.id}>
              <p className="mb-3 text-sm text-muted-foreground">
                Start in {agent.chat} with a prompt like this:
              </p>
              <blockquote className="rounded-lg border bg-secondary p-4 text-sm leading-relaxed">
                Connect to my DFE workspace through{" "}
                <span className="font-medium break-all">
                  https://dfe.makarima.dev/mcp
                </span>
                . Ask me to approve access before you make changes.
              </blockquote>
            </TabsContent>
          ))}
        </Tabs>
        <p className="mt-auto text-xs text-muted-foreground">
          You choose the workspace and approve your agent's access in DFE.
        </p>
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
  length: number
  Mock: (props: { step: number }) => ReactNode
}> = [
  {
    title: "Open your dashboard",
    body: "Sign in to DFE and create a workspace. Start with a project, a question, or something you want to track.",
    length: 1,
    Mock: DashboardMock,
  },
  {
    title: "Connect your agent",
    body: "Choose Claude, Codex, or Cursor. Connect it to DFE, then approve access to the workspace you want it to use.",
    length: 0,
    Mock: AgentMock,
  },
  {
    title: "Set up your dashboard",
    body: "Tell your agent what you want to track. It creates the collections and fields, then adds your data. You see the results in your dashboard.",
    length: NEW_RECORDS.length,
    Mock: RecordsMock,
  },
]

/** A mock with the sloth standing beside it. */
function MockWithSloth({
  active,
  side,
  children,
}: {
  active: boolean
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
      <WavingSloth
        active={active}
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
      <MockWithSloth active={inView} side="right">
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
      <Mock step={current} />
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
