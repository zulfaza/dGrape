import { createFileRoute, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Home })

const planned = [
  {
    title: "Bring your own agent",
    body: "Keep using your existing agent harness for research and writing. Read-only MCP access works now. Planned write tools and self-service agent registration will let it build in your workspace.",
  },
  {
    title: "Connect and compute",
    body: "Planned connectors will gather API data. Deterministic recipes will map, combine, and aggregate it without a model call on each run.",
  },
  {
    title: "Run on your schedule",
    body: "Plan one-off or recurring runs, inspect history, retry failures, and see when data was last refreshed.",
  },
  {
    title: "Keep the source",
    body: "Store private files and artifacts alongside your data, with previews for the materials behind your work.",
  },
  {
    title: "Make the view yours",
    body: "Build versioned pages with tables, metrics, charts, and isolated custom HTML reports. Publish a view that fits the question.",
  },
  {
    title: "Stay in control",
    body: "Approve scoped agent access and connections. Credentials will use safe secret references, so ordinary records do not expose their values.",
  },
]

function WorkspaceLink() {
  return (
    <Button asChild size="lg">
      <Link to="/dashboard/workspaces">Open workspaces</Link>
    </Button>
  )
}

function Home() {
  const { user } = Route.useRouteContext()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-border py-5">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            DFE{" "}
            <span className="hidden font-normal text-muted-foreground sm:inline">
              / Dashboard for Everything
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-4">
            <a
              href="#capabilities"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Capabilities
            </a>
            <Button asChild variant="outline" size="sm">
              {user ? (
                <Link to="/dashboard/workspaces">Open workspaces</Link>
              ) : (
                <a href="/sign-in">Sign in</a>
              )}
            </Button>
          </nav>
        </header>

        <main>
          <section className="grid gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
            <div>
              <p className="text-sm font-medium text-primary">
                Dashboard for Everything
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                A workspace for your data and your agent.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Organize the information you work with today. Build toward
                connected data, repeatable jobs, and useful reports with the
                agent you already use.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <WorkspaceLink />
                <span className="text-sm text-muted-foreground">
                  Start with a workspace and a collection.
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
              <p className="text-sm font-medium text-primary">
                One workspace, many uses
              </p>
              <div className="mt-5 flex flex-col divide-y divide-border">
                <div className="py-4">
                  <h2 className="font-semibold">Job applications</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Track roles, stages, and follow-ups.
                  </p>
                </div>
                <div className="py-4">
                  <h2 className="font-semibold">Transactions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Organize imports and review spending.
                  </p>
                </div>
                <div className="py-4">
                  <h2 className="font-semibold">GitHub activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bring work into a report alongside other data.
                  </p>
                </div>
              </div>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                These are examples. Connections and reports are planned.
              </p>
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-20">
            <div className="grid gap-6 md:grid-cols-2 md:gap-16">
              <div>
                <p className="text-sm font-medium text-primary">
                  Available now
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                  Give your data a home.
                </h2>
              </div>
              <div className="flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  Create workspaces and flexible collections for the things you
                  need to track. Define typed fields and keep records in a
                  structure that fits your work.
                </p>
                <p>
                  Give your agent a read-only workspace credential. It can then
                  read your collections and records through MCP or the HTTP API.
                </p>
              </div>
            </div>
          </section>

          <section
            id="capabilities"
            className="border-t border-border py-14 sm:py-20"
          >
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-primary">
                Planned capabilities
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                From information to a useful view.
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                The next parts of DFE bring your data, agent, and reports
                together. These capabilities are planned and are not available
                yet.
              </p>
            </div>
            <div className="mt-10 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
              {planned.map((item) => (
                <div key={item.title} className="border-t border-border py-6">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Schema versions and portable exports of data and definitions are
              also planned, so your work can evolve and move with you.
            </p>
          </section>

          <section className="border-t border-border py-14 sm:py-20">
            <h2 className="text-3xl font-semibold tracking-tight">
              Start with what matters to you.
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              Make a workspace for a project, a process, or a question you want
              to answer.
            </p>
            <div className="mt-6">
              <WorkspaceLink />
            </div>
          </section>
        </main>
        <footer className="border-t border-border py-6 text-sm text-muted-foreground">
          DFE · Dashboard for Everything
        </footer>
      </div>
    </div>
  )
}
