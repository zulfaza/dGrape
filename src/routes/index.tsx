import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { getAuth } from "@workos/authkit-tanstack-react-start"
import { Authenticated, Unauthenticated } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TerminalIcon,
  ArrowRight01Icon,
  DocumentAttachmentIcon,
  Link01Icon,
  AiMagicIcon,
  Message01Icon,
  StickyNote01Icon,
  Analytics01Icon,
  Robot01Icon,
  Target01Icon,
  AiBrain01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    const { user } = await getAuth()
    if (user) {
      throw redirect({ to: "/dashboard" })
    }
  },
})

const PIPELINE = [
  {
    id: "01",
    title: "Drop your CV",
    body: "Paste your resume or profile. We index your skills, history and strengths.",
    icon: DocumentAttachmentIcon,
  },
  {
    id: "02",
    title: "Add the job",
    body: "Paste a URL or the raw job description. Any company, any board.",
    icon: Link01Icon,
  },
  {
    id: "03",
    title: "Parsed on Convex",
    body: "Structured in real time — role, requirements, keywords, signals.",
    icon: AiMagicIcon,
  },
  {
    id: "04",
    title: "Tailor with AI",
    body: "Chat to rewrite your CV to match, prep interviews, or research the company.",
    icon: Message01Icon,
  },
  {
    id: "05",
    title: "Track + note",
    body: "Add notes per application and move status across your pipeline.",
    icon: StickyNote01Icon,
  },
  {
    id: "06",
    title: "Analyze outcomes",
    body: "Understand why you advanced, why you didn't, and what to do next.",
    icon: Analytics01Icon,
  },
]

const FEATURES = [
  {
    icon: Robot01Icon,
    title: "AI co-pilot",
    body: "A chat that knows your CV and the job. Tailor bullet points, draft cover letters, and rehearse answers grounded in the real description.",
  },
  {
    icon: Target01Icon,
    title: "Match scoring",
    body: "See how your profile lines up against each role — surfaced keywords, missing requirements, and the gaps worth closing.",
  },
  {
    icon: AiBrain01Icon,
    title: "Company research",
    body: "Ask about the team, the stack, recent news, and likely interview themes before you ever hit submit.",
  },
  {
    icon: Analytics01Icon,
    title: "Outcome insights",
    body: "Every stage is logged. Learn what moves you forward and where pipelines stall — across the whole search, not one role.",
  },
]

function Home() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <style>{`
        @keyframes jt-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
        @keyframes jt-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        .jt-rise { animation: jt-rise .7s cubic-bezier(.2,.7,.2,1) both }
        .jt-grid {
          background-image:
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
        }
      `}</style>

      {/* background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 jt-grid opacity-50" />
        <div
          className="absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--primary)" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5">
        {/* nav */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-x border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={TerminalIcon}
                strokeWidth={2}
                className="size-4"
              />
            </span>
            <span className="text-sm font-semibold tracking-tight">dGrape</span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a
              href="#pipeline"
              className="transition-colors hover:text-foreground"
            >
              pipeline
            </a>
            <a
              href="#features"
              className="transition-colors hover:text-foreground"
            >
              features
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Authenticated>
              <Link to="/dashboard">
                <Button size="sm">
                  open dashboard
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                </Button>
              </Link>
            </Authenticated>
            <Unauthenticated>
              <a href="/sign-in">
                <Button variant="ghost" size="sm">
                  sign in
                </Button>
              </a>
              <a href="/sign-up">
                <Button size="sm">
                  get started
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                </Button>
              </a>
            </Unauthenticated>
          </div>
        </header>

        {/* hero */}
        <section className="jt-rise flex flex-col items-center border-x border-border px-6 py-20 text-center lg:py-28">
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Run your job search like an{" "}
            <span className="text-primary">operating system</span>
          </h1>

          <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Feed it your CV and any job description. Tailor your application
            with AI, track every stage, and learn exactly why you advanced — or
            didn't.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Unauthenticated>
              <a href="/sign-up">
                <Button size="lg">
                  start tracking
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                </Button>
              </a>
              <a href="/sign-in">
                <Button variant="outline" size="lg">
                  sign in
                </Button>
              </a>
            </Unauthenticated>
            <Authenticated>
              <Link to="/dashboard">
                <Button size="lg">
                  open dashboard
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                </Button>
              </Link>
            </Authenticated>
          </div>
        </section>

        {/* pipeline */}
        <section
          id="pipeline"
          className="scroll-mt-20 border-x border-t border-border"
        >
          <div className="flex flex-col gap-2 border-b border-border px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
                // the pipeline
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Six steps, one workflow
              </h2>
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              From raw input to real insight — every application moves through
              the same predictable flow.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((step, i) => (
              <div
                key={step.id}
                className={`group relative border-border p-6 transition-colors hover:bg-card/60 ${
                  i % 3 !== 2 ? "lg:border-r" : ""
                } ${i % 2 === 0 ? "sm:border-r lg:border-r" : ""} ${
                  i < PIPELINE.length - 1 ? "border-b" : ""
                } ${i >= PIPELINE.length - 3 ? "lg:border-b-0" : ""}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                    {step.id}
                  </span>
                  <span className="flex size-8 items-center justify-center border border-border text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                    <HugeiconsIcon
                      icon={step.icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </span>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* features */}
        <section
          id="features"
          className="scroll-mt-20 border-x border-t border-border"
        >
          <div className="border-b border-border px-6 py-8">
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
              // intelligence
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              More than a spreadsheet
            </h2>
          </div>
          <div className="grid md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`p-6 sm:p-8 ${i % 2 === 0 ? "md:border-r" : ""} ${
                  i < FEATURES.length - 2
                    ? "border-b"
                    : "border-b md:border-b-0"
                } border-border`}
              >
                <span className="flex size-9 items-center justify-center bg-primary/10 text-primary">
                  <HugeiconsIcon
                    icon={f.icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* cta */}
        <section className="border-x border-t border-border">
          <div className="relative overflow-hidden px-6 py-16 text-center sm:py-20">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40 opacity-20 blur-3xl"
              style={{ background: "var(--primary)" }}
              aria-hidden
            />
            <p className="relative text-[10px] tracking-widest text-muted-foreground uppercase">
              ready when you are
            </p>
            <h2 className="relative mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Stop guessing. Start landing the right roles.
            </h2>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Unauthenticated>
                <a href="/sign-up">
                  <Button size="lg">
                    create your workspace
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                  </Button>
                </a>
              </Unauthenticated>
              <Authenticated>
                <Link to="/dashboard">
                  <Button size="lg">
                    open dashboard
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                  </Button>
                </Link>
              </Authenticated>
            </div>
          </div>
        </section>

        {/* footer */}
        <footer className="flex flex-col items-center justify-between gap-3 border-x border-t border-b border-border px-4 py-5 text-xs text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={TerminalIcon}
                strokeWidth={2}
                className="size-3"
              />
            </span>
            dGrape
          </span>
          <span>© 2026</span>
        </footer>
      </div>
    </div>
  )
}
