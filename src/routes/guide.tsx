import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState, type ReactNode } from "react"
import { CopyButton } from "@/components/copy-button"
import { MockWindow } from "@/components/landing/step-mocks"
import { Mascot } from "@/components/mascot"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [{ title: "Getting started — DFE" }],
  }),
  component: Guide,
})

const MCP_URL = "https://dfe.makarima.dev/mcp"
const CONNECT_PROMPT = `Connect to my DFE workspace through ${MCP_URL}. Ask me to approve access before you make changes.`
const MCP_COMMAND = `claude mcp add --transport http dfe ${MCP_URL} --header "Authorization: Bearer <credential>"`
const TRACK_PROMPT =
  "Make a collection for my job applications with company, role, status, and applied date. Then add the jobs from this list."
/** A sample code for the example windows. Real codes come from the agent. */
const SAMPLE_CODE = "482913"

const STEPS = [
  { id: "workspace", title: "Make a workspace" },
  { id: "agent", title: "Connect your agent" },
  { id: "track", title: "Tell your agent what to track" },
  { id: "access", title: "Keep control of access" },
] as const

type StepId = (typeof STEPS)[number]["id"]

/**
 * The last step whose section starts above 30% of the viewport height, or
 * the last step when the page is scrolled to the bottom. Starts at the
 * first step, so the server render and the first client render agree.
 */
function useCurrentStep() {
  const [current, setCurrent] = useState<StepId>(STEPS[0].id)
  useEffect(() => {
    let frame = 0
    const update = () => {
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      const line = window.innerHeight * 0.3
      const passed = STEPS.filter((step) => {
        const element = document.getElementById(step.id)
        return element !== null && element.getBoundingClientRect().top <= line
      })
      const step = atBottom ? STEPS.at(-1) : passed.at(-1)
      setCurrent(step?.id ?? STEPS[0].id)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [])
  return current
}

/** Text that the reader copies into their agent or terminal. */
function Snippet({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-card py-2 pr-2 pl-4">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-xs leading-relaxed break-words">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  )
}

/** A name of a button, page, or option in DFE. */
function UiName({ children }: { children: string }) {
  return <span className="font-medium text-foreground">{children}</span>
}

function Section({
  id,
  number,
  title,
  children,
}: {
  id: StepId
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-8 border-t py-12 first:border-t-0 first:pt-0"
    >
      <h2
        id={`${id}-heading`}
        className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight"
      >
        <span className="text-muted-foreground tabular-nums">{number}</span>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-5 leading-relaxed text-muted-foreground [&_ol]:max-w-prose [&_p]:max-w-prose">
        {children}
      </div>
    </section>
  )
}

/** The six digits of a code, as the claim page shows them. */
function CodeDigits({ code }: { code: string }) {
  return (
    <span className="flex gap-1">
      {code.split("").map((digit, index) => (
        <span
          key={index}
          className="flex h-8 w-6 items-center justify-center rounded-sm bg-accent font-mono text-sm font-medium text-accent-foreground"
        >
          {digit}
        </span>
      ))}
    </span>
  )
}

/**
 * Two example windows: the agent conversation and the DFE claim page. The
 * same code shows in both, in the accent color, to connect them.
 */
function Handshake() {
  return (
    <figure className="flex flex-col gap-3">
      <div className="grid gap-4 md:grid-cols-2">
        <MockWindow title="Your agent" dark>
          <div className="flex flex-col gap-4 p-4 font-mono text-xs leading-relaxed">
            <p>
              <span className="text-terminal-muted">you › </span>
              Connect to my DFE workspace through dfe.makarima.dev/mcp.
            </p>
            <div className="flex flex-col gap-2">
              <p>
                <span className="text-terminal-muted">agent › </span>
                Open this link to approve me:
              </p>
              <p className="text-terminal-muted">
                dfe.makarima.dev/claim?claim_attempt_token=…
              </p>
              <p className="flex items-center gap-2">
                Code:
                <span className="rounded-sm bg-accent px-1.5 font-medium text-accent-foreground">
                  {SAMPLE_CODE}
                </span>
              </p>
            </div>
          </div>
        </MockWindow>
        <MockWindow title="dfe.makarima.dev/claim">
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="font-semibold text-foreground">Connect your agent</p>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-xs">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="rounded-md border px-2 py-1.5 text-foreground">
                Job search
              </dd>
              <dt className="text-muted-foreground">Access</dt>
              <dd className="text-foreground">Read and write</dd>
              <dt className="text-muted-foreground">Code</dt>
              <dd>
                <CodeDigits code={SAMPLE_CODE} />
              </dd>
            </dl>
            <span className="mt-1 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Connect agent
            </span>
          </div>
        </MockWindow>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Example. Your agent gives its own link and code. They stay valid for 10
        minutes.
      </figcaption>
    </figure>
  )
}

function StepNav({ current }: { current: StepId }) {
  return (
    <nav aria-label="Steps" className="sticky top-8 hidden self-start lg:block">
      <ol className="flex flex-col gap-1 text-sm">
        {STEPS.map((step, index) => {
          const active = step.id === current
          return (
            <li key={step.id}>
              <a
                href={`#${step.id}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex gap-3 rounded-md py-2 pr-3 pl-4 outline-none before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-sm before:bg-accent before:opacity-0 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary font-medium text-foreground before:opacity-100"
                    : "text-muted-foreground"
                )}
              >
                <span className="tabular-nums">{index + 1}</span>
                {step.title}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Guide() {
  const { user } = Route.useRouteContext()
  const signedIn = Boolean(user)
  const current = useCurrentStep()

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <header className="flex items-center justify-between gap-4 py-5">
            <Link
              to="/"
              className="flex items-center gap-2 text-xl font-semibold tracking-tight"
            >
              <img src="/favicon.svg" alt="" width={32} height={32} />
              DFE
            </Link>
            <Button asChild variant="outline" size="sm">
              {signedIn ? (
                <Link to="/dashboard/workspaces">Open workspaces</Link>
              ) : (
                <a href="/sign-in">Sign in</a>
              )}
            </Button>
          </header>

          <div className="flex items-end justify-between gap-6 border-b py-10 sm:py-14">
            <div className="max-w-2xl">
              <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
                Set up DFE with your agent
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Make a workspace, connect the agent you already use, and tell it
                what to track. You approve each step.
              </p>
            </div>
            <Mascot
              pose="wave"
              size={144}
              className="hidden shrink-0 sm:block"
            />
          </div>

          <div className="grid gap-12 py-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <StepNav current={current} />

            <main className="max-w-3xl">
              <Section id="workspace" number={1} title="Make a workspace">
                <p>
                  Sign in or make an account. Then select{" "}
                  <UiName>Create workspace</UiName> and give it a name, for
                  example &ldquo;Job search&rdquo;. Each workspace keeps its own
                  collections, records, files, and agent access.
                </p>
                <div>
                  <Button asChild>
                    {signedIn ? (
                      <Link to="/dashboard/workspaces">Open workspaces</Link>
                    ) : (
                      <a href="/sign-in">Sign in to DFE</a>
                    )}
                  </Button>
                </div>
              </Section>

              <Section id="agent" number={2} title="Connect your agent">
                <p>
                  DFE works with Claude Code, Codex, Cursor, and other agents
                  that support MCP. Use one of these methods.
                </p>
                <Tabs defaultValue="ask">
                  <TabsList
                    aria-label="Connection method"
                    className="self-start"
                  >
                    <TabsTrigger value="ask">Ask your agent</TabsTrigger>
                    <TabsTrigger value="credential">
                      Make a credential
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="ask">
                    <div className="flex flex-col gap-5">
                      <p>Give this prompt to your agent:</p>
                      <Snippet value={CONNECT_PROMPT} label="prompt" />
                      <p>
                        Your agent replies with a link and a code. Open the
                        link, sign in with the email that you gave your agent,
                        choose the workspace and the access, and type the code.
                      </p>
                      <Handshake />
                    </div>
                  </TabsContent>
                  <TabsContent value="credential">
                    <div className="flex flex-col gap-5">
                      <ol className="flex list-decimal flex-col gap-2 pl-5">
                        <li>
                          In the workspace, go to <UiName>Settings</UiName> →{" "}
                          <UiName>Connections</UiName>.
                        </li>
                        <li>
                          Choose the access and the number of days (1 to 30).
                          Then select <UiName>Create credential</UiName>.
                        </li>
                        <li>
                          Copy the credential at once. You cannot see it again.
                        </li>
                      </ol>
                      <p>
                        For Claude Code, DFE shows a command with the credential
                        in it. It has this form:
                      </p>
                      <Snippet value={MCP_COMMAND} label="command" />
                    </div>
                  </TabsContent>
                </Tabs>
              </Section>

              <Section
                id="track"
                number={3}
                title="Tell your agent what to track"
              >
                <p>
                  Your agent makes the collections and fields, then adds the
                  records. For example:
                </p>
                <Snippet value={TRACK_PROMPT} label="prompt" />
                <p>
                  The records show in your workspace. Ask your agent for a
                  dashboard with tables, metrics, and charts. You can also
                  change collections in <UiName>Settings</UiName> →{" "}
                  <UiName>Collections</UiName>, and dashboards in{" "}
                  <UiName>Settings</UiName> → <UiName>Dashboards</UiName>.
                </p>
              </Section>

              <Section id="access" number={4} title="Keep control of access">
                <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-[8rem_1fr] sm:gap-y-3 [&>dd]:mb-3 sm:[&>dd]:mb-0">
                  <dt className="font-medium text-foreground">Connections</dt>
                  <dd>
                    Disconnect an agent or revoke a credential. Its access stops
                    at once.
                  </dd>
                  <dt className="font-medium text-foreground">Members</dt>
                  <dd>Invite people as viewers, editors, or owners.</dd>
                  <dt className="font-medium text-foreground">Activity</dt>
                  <dd>See the changes that you and your agents made.</dd>
                </dl>
              </Section>
            </main>
          </div>

          <footer className="flex items-center gap-2 border-t py-6 text-sm text-muted-foreground">
            <img src="/favicon.svg" alt="" width={20} height={20} />
            DFE, Dashboard for Everything
          </footer>
        </div>
      </div>
    </TooltipProvider>
  )
}
