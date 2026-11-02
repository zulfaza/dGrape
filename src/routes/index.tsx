import { createFileRoute, Link } from "@tanstack/react-router"
import { Mascot, type MascotPose } from "@/components/mascot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Home })

const steps: ReadonlyArray<{
  pose: MascotPose
  title: string
  body: string
}> = [
  {
    pose: "chart",
    title: "Make a collection",
    body: "Name the fields you care about, such as company, salary, and applied. No database setup.",
  },
  {
    pose: "laptop",
    title: "Connect your agent",
    body: "Create a credential and add DFE to your agent over MCP. Choose read only, or read and write.",
  },
  {
    pose: "celebrate",
    title: "Let it fill the table",
    body: "Your agent adds and updates records while it works. You review them here.",
  },
]

const planned = [
  {
    title: "Connect and compute",
    body: "Connectors will gather API data. Fixed recipes will map, combine, and total it without a model call on each run.",
  },
  {
    title: "Run on your schedule",
    body: "Plan one-off or recurring runs, inspect history, retry failures, and see when data was last refreshed.",
  },
  {
    title: "Keep the source",
    body: "Store private files next to your data, with previews of the material behind your work.",
  },
  {
    title: "Make the view yours",
    body: "Build versioned pages with tables, metrics, charts, and isolated custom HTML reports.",
  },
  {
    title: "Connect without pasting",
    body: "Agent registration will let your agent ask for access, and you approve it in DFE.",
  },
  {
    title: "Stay in control",
    body: "Credentials for other services will use secret references, so records never show their values.",
  },
]

const sampleRecords = [
  { company: "Linear", role: "Product engineer", applied: true },
  { company: "PostHog", role: "Full-stack engineer", applied: true },
  { company: "Railway", role: "Software engineer", applied: false },
]

function WorkspaceLink({
  signedIn,
  variant = "default",
}: {
  signedIn: boolean
  variant?: "default" | "secondary"
}) {
  return (
    <Button asChild size="lg" variant={variant}>
      {signedIn ? (
        <Link to="/dashboard/workspaces">Open workspaces</Link>
      ) : (
        <a href="/sign-in">Start a workspace</a>
      )}
    </Button>
  )
}

/** A static example of what an agent writes. It is not live data. */
function AgentActivityCard() {
  return (
    <figure className="w-full rounded-lg border bg-card text-card-foreground shadow-[var(--dfe-shadow-overlay)]">
      <figcaption className="border-b px-4 py-3 text-sm">
        <span className="font-semibold">Your agent added 3 records</span>
        <span className="block text-muted-foreground">to Job applications</span>
      </figcaption>
      <table className="w-full text-left text-sm">
        <thead className="sr-only">
          <tr>
            <th>Company</th>
            <th>Role</th>
            <th>Applied</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sampleRecords.map((record) => (
            <tr key={record.company}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{record.company}</span>
                <span className="block text-xs text-muted-foreground">
                  {record.role}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Badge
                  variant="secondary"
                  className={
                    record.applied ? "bg-success-surface text-success" : ""
                  }
                >
                  {record.applied ? "Applied" : "Saved"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function Home() {
  const { user } = Route.useRouteContext()
  const signedIn = Boolean(user)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex items-center justify-between gap-4 py-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-semibold tracking-tight"
          >
            <img src="/favicon.svg" alt="" width={32} height={32} />
            DFE
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-5">
            <a
              href="#how-it-works"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              How it works
            </a>
            <a
              href="#planned"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Planned
            </a>
            <Button asChild variant="outline" size="sm">
              {signedIn ? (
                <Link to="/dashboard/workspaces">Open workspaces</Link>
              ) : (
                <a href="/sign-in">Sign in</a>
              )}
            </Button>
          </nav>
        </header>

        <main>
          <section className="grid items-center gap-10 py-12 md:grid-cols-[1fr_1fr] md:py-20">
            <div>
              <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
                A tidy home for your data, kept by your agent.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                DFE, the Dashboard for Everything, holds the tables you track:
                job applications, spending, project notes. The agent you already
                use reads and fills them in.
              </p>
              <div className="mt-8">
                <WorkspaceLink signedIn={signedIn} />
              </div>
            </div>
            <div className="relative flex min-h-[26rem] flex-col items-center gap-4 overflow-hidden rounded-xl bg-mascot-surface px-5 pt-8 sm:block">
              <div className="w-full max-w-64 sm:absolute sm:top-8 sm:right-6">
                <AgentActivityCard />
              </div>
              <Mascot
                pose="wave"
                size={256}
                className="-mb-4 h-auto w-56 sm:absolute sm:bottom-0 sm:left-4 sm:w-64"
              />
            </div>
          </section>

          <section
            id="how-it-works"
            aria-labelledby="how-heading"
            className="border-t py-14 sm:py-20"
          >
            <h2
              id="how-heading"
              className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Set it up once. Your agent does the typing.
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <div className="flex h-44 items-end justify-center rounded-xl bg-card">
                    <Mascot pose={step.pose} size={160} className="-mb-2" />
                  </div>
                  <h3 className="mt-2 text-lg font-semibold">
                    <span className="mr-2 text-muted-foreground tabular-nums">
                      {index + 1}.
                    </span>
                    {step.title}
                  </h3>
                  <p className="leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section
            id="planned"
            aria-labelledby="planned-heading"
            className="border-t py-14 sm:py-20"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2
                id="planned-heading"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Coming next
              </h2>
              <Badge variant="outline">Planned, not available yet</Badge>
            </div>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              Collections, records, and agent access over MCP and HTTP work
              today. These parts bring your data, agent, and reports closer
              together.
            </p>
            <ul className="mt-10 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
              {planned.map((item) => (
                <li key={item.title} className="border-t py-6">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-14 flex flex-col items-center gap-6 rounded-xl bg-primary px-6 py-12 text-center text-primary-foreground sm:flex-row sm:px-12 sm:text-left">
            <div className="flex size-40 shrink-0 items-center justify-center rounded-full bg-mascot-surface">
              <Mascot pose="laptop" size={136} />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-semibold tracking-tight">
                Start with one table.
              </h2>
              <p className="mt-3 max-w-xl text-primary-foreground/85">
                Make a workspace for a project, a process, or a question you
                want to answer. Add your agent when you are ready.
              </p>
            </div>
            <WorkspaceLink signedIn={signedIn} variant="secondary" />
          </section>
        </main>
        <footer className="flex items-center gap-2 border-t py-6 text-sm text-muted-foreground">
          <img src="/favicon.svg" alt="" width={20} height={20} />
          DFE, Dashboard for Everything
        </footer>
      </div>
    </div>
  )
}
