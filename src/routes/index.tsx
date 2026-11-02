import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Cable,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  Paperclip,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { LyingSloth } from "@/components/landing/lying-sloth"
import { HowItWorks, WorkspacesShowcase } from "@/components/landing/step-mocks"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Home })

const planned: ReadonlyArray<{
  title: string
  icon: LucideIcon
  body: string
}> = [
  {
    title: "Connect and compute",
    icon: Cable,
    body: "Connectors will gather API data. Fixed recipes will map, combine, and total it without a model call on each run.",
  },
  {
    title: "Run on your schedule",
    icon: CalendarClock,
    body: "Plan one-off or recurring runs, inspect history, retry failures, and see when data was last refreshed.",
  },
  {
    title: "Keep the source",
    icon: Paperclip,
    body: "Store private files next to your data, with previews of the material behind your work.",
  },
  {
    title: "Make the view yours",
    icon: LayoutDashboard,
    body: "Build versioned pages with tables, metrics, charts, and isolated custom HTML reports.",
  },
  {
    title: "Connect without pasting",
    icon: KeyRound,
    body: "Agent registration will let your agent ask for access, and you approve it in DFE.",
  },
  {
    title: "Stay in control",
    icon: ShieldCheck,
    body: "Credentials for other services will use secret references, so records never show their values.",
  },
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

/** The example dashboard with the sloth resting on its top edge. */
function HeroShowcase() {
  // The sloth's belly line sits at 78% of its height (it is 2:1), so a top
  // padding of width x 1/2 x 0.78 puts the belly on the window's top edge:
  // 45% wide and centered on phones (17.5%), 20% wide on the right above.
  return (
    <div className="relative mt-14 w-full pt-[17.5%] text-left sm:pt-[7.8%]">
      <div className="pointer-events-none absolute top-0 left-1/2 z-10 w-[45%] -translate-x-1/2 sm:right-[6%] sm:left-auto sm:w-[20%] sm:translate-x-0">
        <div className="dfe-anim dfe-sloth-settle">
          <LyingSloth />
        </div>
      </div>
      <HeroDashboard />
    </div>
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
          <section className="flex flex-col items-center py-12 text-center md:py-20">
            <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
              A tidy home for your data, kept by your agent.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              DFE, the Dashboard for Everything, holds the tables you track: job
              applications, spending, project activity. The agent you already
              use reads and fills them in.
            </p>
            <div className="mt-8">
              <WorkspaceLink signedIn={signedIn} />
            </div>
            <HeroShowcase />
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
            <HowItWorks />
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
                <li key={item.title} className="flex gap-4 border-t py-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <item.icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-14 grid items-center gap-10 rounded-xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Start with one table.
              </h2>
              <p className="mt-3 max-w-xl text-primary-foreground/85">
                Make a workspace for a project, a process, or a question you
                want to answer. Add your agent when you are ready.
              </p>
              <div className="mt-6">
                <WorkspaceLink signedIn={signedIn} variant="secondary" />
              </div>
            </div>
            <WorkspacesShowcase />
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
