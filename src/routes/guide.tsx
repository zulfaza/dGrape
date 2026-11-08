import { createFileRoute, Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [{ title: "Getting started — DFE" }],
  }),
  component: Guide,
})

const MCP_URL = "https://dfe.makarima.dev/mcp"

/** One step of the guide. `id` is the anchor for links to the step. */
type Step = {
  id: string
  title: string
  body: ReactNode
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
      <code>{children}</code>
    </pre>
  )
}

function Path({ children }: { children: string }) {
  return <span className="font-medium text-foreground">{children}</span>
}

const steps: ReadonlyArray<Step> = [
  {
    id: "sign-in",
    title: "Sign in",
    body: (
      <p>
        Select <Path>Start a workspace</Path> on the home page. Sign in or make
        an account. DFE then opens your workspaces.
      </p>
    ),
  },
  {
    id: "workspace",
    title: "Create a workspace",
    body: (
      <p>
        Select <Path>Create workspace</Path> and give it a name, for example
        &ldquo;Job search&rdquo;. A workspace keeps its own collections,
        records, files, and agent access.
      </p>
    ),
  },
  {
    id: "agent",
    title: "Connect your agent",
    body: (
      <>
        <p>Use one of these two methods.</p>
        <h3 className="mt-5 font-semibold text-foreground">
          A. Let your agent ask for access
        </h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            Give this prompt to Claude Code, Codex, Cursor, or another agent
            that supports MCP:
            <Code>{`Connect to my DFE workspace through ${MCP_URL}. Ask me to approve access before you make changes.`}</Code>
          </li>
          <li>Your agent shows a link and a code. Open the link.</li>
          <li>
            Sign in with the email that you gave your agent. Choose the
            workspace and the access (<Path>Read only</Path> or{" "}
            <Path>Read and write</Path>).
          </li>
          <li>Type the code from your agent, then confirm.</li>
        </ol>
        <h3 className="mt-5 font-semibold text-foreground">
          B. Make a credential yourself
        </h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            In the workspace, go to <Path>Settings</Path> →{" "}
            <Path>Connections</Path>.
          </li>
          <li>
            Choose the access and the number of days (1 to 30), then select{" "}
            <Path>Create credential</Path>.
          </li>
          <li>
            Copy the credential at once. You cannot see it again. For Claude
            Code, run the command that DFE shows. It has this form:
            <Code>{`claude mcp add --transport http dfe ${MCP_URL} --header "Authorization: Bearer <credential>"`}</Code>
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "collections",
    title: "Tell your agent what to track",
    body: (
      <>
        <p>
          Your agent makes the collections and fields, then adds the records.
          For example:
        </p>
        <Code>
          Make a collection for my job applications with company, role, status,
          and applied date. Then add the jobs from this list.
        </Code>
        <p className="mt-3">
          You can also make a collection yourself in <Path>Settings</Path> →{" "}
          <Path>Collections</Path>.
        </p>
      </>
    ),
  },
  {
    id: "dashboards",
    title: "See your data",
    body: (
      <p>
        Open the workspace to see your records. Ask your agent to make a
        dashboard with tables, metrics, and charts, or edit one in{" "}
        <Path>Settings</Path> → <Path>Dashboards</Path>.
      </p>
    ),
  },
  {
    id: "access",
    title: "Keep control of access",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <Path>Connections</Path> shows each connected agent and credential.
          Disconnect an agent or revoke a credential to stop its access at once.
        </li>
        <li>
          <Path>Members</Path> lets you invite other people to the workspace.
        </li>
        <li>
          <Path>Activity</Path> shows the changes that you and your agents made.
        </li>
      </ul>
    ),
  },
]

function Guide() {
  const { user } = Route.useRouteContext()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <header className="flex items-center justify-between gap-4 py-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-semibold tracking-tight"
          >
            <img src="/favicon.svg" alt="" width={32} height={32} />
            DFE
          </Link>
          <Button asChild variant="outline" size="sm">
            {user ? (
              <Link to="/dashboard/workspaces">Open workspaces</Link>
            ) : (
              <a href="/sign-in">Sign in</a>
            )}
          </Button>
        </header>

        <main className="py-10 sm:py-14">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Getting started
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Set up DFE in a few minutes: make a workspace, connect your agent,
            and let it fill in your data.
          </p>

          <nav
            aria-label="Steps"
            className="mt-8 rounded-xl border bg-card p-5"
          >
            <ol className="grid gap-2 text-sm sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <a
                    href={`#${step.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {index + 1}. {step.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <ol className="mt-10">
            {steps.map((step, index) => (
              <li
                key={step.id}
                id={step.id}
                className="flex scroll-mt-6 gap-4 border-t py-8"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">{step.title}</h2>
                  <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </main>

        <footer className="flex items-center gap-2 border-t py-6 text-sm text-muted-foreground">
          <img src="/favicon.svg" alt="" width={20} height={20} />
          DFE, Dashboard for Everything
        </footer>
      </div>
    </div>
  )
}
