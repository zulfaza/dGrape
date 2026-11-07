import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createRoot } from "react-dom/client"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Database01Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  Link01Icon,
  Moon02Icon,
  PlayIcon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  Settings01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog"
import { Checkbox } from "../components/ui/checkbox"
import { Skeleton } from "../components/ui/skeleton"
import { Separator } from "../components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Badge } from "../components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table"
import { Spinner } from "../components/ui/spinner"
import { toast, Toaster } from "../components/ui/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import { cn } from "../lib/utils"
import "./base.css"
import "./theme.css"

type Theme = "light" | "dark"
type View = "workspace" | "foundations" | "components" | "patterns"
type Icon = typeof Database01Icon

const mascotSource =
  document.getElementById("sloth-source")?.getAttribute("src") ||
  "/brand/sloth-concept.png"
const brandSource =
  document.getElementById("brand-source")?.getAttribute("src") || "/favicon.svg"
const mascotReferenceSource =
  document.getElementById("mascot-reference-source")?.getAttribute("src") ||
  "/brand/mascot-reference.png"
const mascotPosesSource =
  document.getElementById("mascot-poses-source")?.getAttribute("src") ||
  "/brand/mascot-poses.png"

const faviconOptions = [
  { name: "Sloth head", source: brandSource },
  {
    name: "Green badge",
    source:
      document.getElementById("badge-source")?.getAttribute("src") ||
      "/brand/sloth-badge.svg",
  },
  {
    name: "Monochrome",
    source:
      document.getElementById("mono-source")?.getAttribute("src") ||
      "/brand/sloth-mono.svg",
  },
  {
    name: "Outline",
    source:
      document.getElementById("outline-source")?.getAttribute("src") ||
      "/brand/sloth-outline.svg",
  },
]

const colors = {
  light: {
    background: "#F5F7F5",
    foreground: "#24332B",
    card: "#FFFFFF",
    primary: "#315847",
    primaryForeground: "#FFFFFF",
    muted: "#EEF1EE",
    mutedForeground: "#59665D",
    accent: "#E6BD5B",
    accentForeground: "#302A1C",
    success: "#285B42",
    successSurface: "#E8F1E9",
    warning: "#795119",
    warningSurface: "#FAF0D9",
    destructive: "#B43838",
    destructiveSurface: "#FAEAEA",
  },
  dark: {
    background: "#1E1F21",
    foreground: "#E9EAEC",
    card: "#252628",
    primary: "#8CC9A7",
    primaryForeground: "#142D20",
    muted: "#2D2E31",
    mutedForeground: "#B5B8BE",
    accent: "#284435",
    accentForeground: "#BAE5CB",
    success: "#A8D5B8",
    successSurface: "#263A2C",
    warning: "#E5C485",
    warningSurface: "#3D3424",
    destructive: "#F2B4B4",
    destructiveSurface: "#432C2C",
  },
} as const

function IconView({ icon, className }: { icon: Icon; className?: string }) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={1.7}
      data-icon="inline-start"
      className={className}
      aria-hidden="true"
    />
  )
}

function App() {
  const [theme, setTheme] = useState<Theme>("light")
  const [view, setView] = useState<View>("workspace")
  const notify = (message: string) => toast.message(message)
  const [createOpen, setCreateOpen] = useState(false)
  const createReturnFocus = useRef<HTMLElement | null>(null)
  const openCollection = () => {
    createReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setCreateOpen(true)
  }
  const [collections, setCollections] = useState([
    "Applications",
    "Transactions",
    "GitHub activity",
  ])
  useEffect(() => {
    document.documentElement.dataset.dgTheme = theme
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])
  return (
    <div className="design-system">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="ds-sidebar" aria-label="Design system navigation">
        <a
          className="ds-brand"
          href="#workspace"
          onClick={() => setView("workspace")}
        >
          <img
            className="brand-icon"
            src={brandSource}
            width="32"
            height="32"
            alt=""
          />
          <span title="Dashboard for Everything">DFE</span>
          <span className="brand-caption">Reference</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">Z</span>
          <span>
            <strong>Zul’s workspace</strong>
            <small>Personal space</small>
          </span>
          <IconView icon={Settings01Icon} />
        </div>
        <p className="nav-label">Workspace reference</p>
        <nav className="ds-nav">
          {(
            [
              ["workspace", "Workspace sample", DashboardSquare01Icon],
              ["foundations", "Foundations", Database01Icon],
              ["components", "Components", Folder01Icon],
              ["patterns", "Patterns & mascot", Link01Icon],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id)
              }}
              aria-current={view === id ? "page" : undefined}
            >
              <IconView icon={icon} />
              {label}
            </button>
          ))}
        </nav>
        <Separator />
        <p className="nav-label">Workspace collections</p>
        <div className="collection-nav">
          {collections.map((name) => (
            <span key={name}>
              <i />
              {name}
            </span>
          ))}
        </div>
        <Button variant="ghost" onClick={openCollection}>
          <IconView icon={PlusSignIcon} />
          New collection
        </Button>
        <div className="sidebar-bottom">
          <p>
            Dashboard for Everything
            <br />A personal working space.
          </p>
          <Badge variant="secondary">Design reference · v0.2</Badge>
          <small>All workspace data is illustrative.</small>
        </div>
      </aside>
      <div className="ds-main">
        <header className="ds-topbar">
          <span>
            Design system <span aria-hidden="true">/</span>{" "}
            <strong>
              {
                {
                  workspace: "Workspace sample",
                  foundations: "Foundations",
                  components: "Components",
                  patterns: "Patterns & mascot",
                }[view]
              }
            </strong>
          </span>
          <div className="topbar-actions">
            <span className="demo-label">
              <i />
              Interactive sample
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              <IconView icon={theme === "light" ? Moon02Icon : Sun03Icon} />
            </Button>
            <Avatar>
              <AvatarFallback>Z</AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {view === "workspace" && (
            <Workspace onCreate={openCollection} onNotice={notify} />
          )}
          {view === "foundations" && <Foundations theme={theme} />}
          {view === "components" && <Components onNotice={notify} />}
          {view === "patterns" && <Patterns onCreate={openCollection} />}
        </main>
        <footer className="ds-footer">
          <span>DFE design reference</span>
          <span>
            Real shadcn components. Local sample state. No live account data.
          </span>
        </footer>
      </div>
      <CreateCollection
        open={createOpen}
        returnFocus={createReturnFocus.current}
        onOpenChange={setCreateOpen}
        onCreate={(name) => {
          setCollections([...collections, name])
          notify(`“${name}” added to this sample workspace.`)
        }}
        existing={collections}
      />
      <div className="sample-toasts">
        <Toaster theme={theme} />
      </div>
    </div>
  )
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

/** One row of the specimen workspace table. */
type WorkspaceRow = {
  company: string
  role: string
  initials: string
  status: string
  tone: StatusTone
  date: string
  source: string
}

const applicationRows = [
  {
    company: "Linear",
    role: "Product engineer",
    initials: "L",
    status: "Interviewing",
    tone: "success",
    date: "Nov 2",
    source: "Careers page",
  },
  {
    company: "PostHog",
    role: "Full-stack engineer",
    initials: "P",
    status: "Applied",
    tone: "accent",
    date: "Nov 1",
    source: "Company website",
  },
  {
    company: "GitHub",
    role: "Backend engineer",
    initials: "G",
    status: "Ready to review",
    tone: "warning",
    date: "Oct 31",
    source: "Agent research",
  },
  {
    company: "Railway",
    role: "Software engineer",
    initials: "R",
    status: "Saved",
    tone: "neutral",
    date: "Oct 30",
    source: "Careers page",
  },
] satisfies ReadonlyArray<WorkspaceRow>
const transactionRows = [
  {
    company: "GitHub",
    role: "Developer tools",
    initials: "G",
    status: "Recorded",
    tone: "success",
    date: "Nov 2",
    source: "$12.00",
  },
  {
    company: "Cloudflare",
    role: "Infrastructure",
    initials: "C",
    status: "Recorded",
    tone: "success",
    date: "Nov 1",
    source: "$5.00",
  },
  {
    company: "Figma",
    role: "Design tools",
    initials: "F",
    status: "Needs category",
    tone: "warning",
    date: "Oct 31",
    source: "$15.00",
  },
] satisfies ReadonlyArray<WorkspaceRow>

function Workspace({
  onCreate,
  onNotice,
}: {
  onCreate: () => void
  onNotice: (message: string) => void
}) {
  const [dataset, setDataset] = useState("applications")
  const [search, setSearch] = useState("")
  const rows = (
    dataset === "applications" ? applicationRows : transactionRows
  ).filter((row) =>
    `${row.company} ${row.role} ${row.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  return (
    <>
      <SectionHeading
        title="Workspace"
        description="Applications, spending, and the work you have set in motion."
        action={
          <Button onClick={onCreate}>
            <IconView icon={PlusSignIcon} />
            Create collection
          </Button>
        }
      />
      <div className="workspace-context">
        <span>
          <i className="status-dot" />
          Local example workspace
        </span>
        <span>Monday, November 2, 2026</span>
      </div>
      <div className="workspace-columns">
        <div className="workspace-primary">
          <section
            className="surface collection-surface"
            aria-labelledby="collections-title"
          >
            <div className="surface-heading">
              <div>
                <h2 id="collections-title">Collections</h2>
                <p>Choose a dataset, then find the record you need.</p>
              </div>
              <Badge variant="outline">Sample data</Badge>
            </div>
            <Tabs value={dataset} onValueChange={setDataset}>
              <TabsList aria-label="Sample datasets">
                <TabsTrigger value="applications">
                  Applications <span>4</span>
                </TabsTrigger>
                <TabsTrigger value="transactions">
                  Transactions <span>3</span>
                </TabsTrigger>
              </TabsList>
              <div className="table-toolbar">
                <Field>
                  <FieldLabel htmlFor="record-search" className="sr-only">
                    Search sample records
                  </FieldLabel>
                  <div className="search-field">
                    <IconView icon={Search01Icon} />
                    <Input
                      id="record-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search company, category, or status"
                    />
                  </div>
                </Field>
                <small>{rows.length} records</small>
              </div>
              {["applications", "transactions"].map((value) => (
                <TabsContent value={value} key={value}>
                  <Table data-dataset={value}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {value === "applications"
                            ? "Company & role"
                            : "Merchant & category"}
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>
                          {value === "applications" ? "Source" : "Amount (USD)"}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.company}>
                          <TableCell>
                            <div className="company-cell">
                              <span>
                                <strong>{row.company}</strong>
                                <small>{row.role}</small>
                                {value === "transactions" && (
                                  <small className="mobile-record-meta">
                                    {row.date} · {row.status}
                                  </small>
                                )}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Status tone={row.tone}>{row.status}</Status>
                          </TableCell>
                          <TableCell className="tabular">{row.date}</TableCell>
                          <TableCell
                            className={cn(
                              value === "transactions" && "tabular"
                            )}
                          >
                            {row.source}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length === 0 && (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>No matching records</EmptyTitle>
                        <EmptyDescription>
                          Try another company, category, or status.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button variant="outline" onClick={() => setSearch("")}>
                          Clear search
                        </Button>
                      </EmptyContent>
                    </Empty>
                  )}
                </TabsContent>
              ))}
            </Tabs>
            <div className="surface-footnote">
              <span>Snapshot from Nov 2, 2026</span>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  onNotice(
                    "This example uses local sample records. The live collection view will use indexed, paginated queries."
                  )
                }
              >
                How this view works
                <IconView icon={ArrowUpRight01Icon} />
              </Button>
            </div>
          </section>
          <section
            className="surface activity-surface"
            aria-labelledby="activity-title"
          >
            <div className="surface-heading">
              <div>
                <h2 id="activity-title">Applications this week</h2>
                <p>Saved applications, Monday through Sunday</p>
              </div>
              <span className="chart-total">
                34 <small>total</small>
              </span>
            </div>
            <ActivityChart />
            <details className="chart-details">
              <summary>View the sample numbers</summary>
              <p>
                Mon 3 · Tue 6 · Wed 4 · Thu 8 · Fri 5 · Sat 3 · Sun 5.
                Illustrative SVG; the production renderer will use the chart
                adapter.
              </p>
            </details>
          </section>
          <div className="workspace-method">
            <IconView icon={Link01Icon} />
            <p>
              <strong>Your agent works here, too.</strong> Collections, recipes,
              and pages share the same workspace. Keep using the harness you
              already use.
            </p>
          </div>
        </div>
        <aside className="workspace-secondary">
          <section className="sloth-note" aria-labelledby="sloth-note-title">
            <img src={brandSource} alt="" width="62" height="62" />
            <div>
              <h2 id="sloth-note-title">Connect your agent</h2>
              <p>
                Keep your current harness. MCP access will connect it to your
                collections, recipes, and reports.
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  onNotice(
                    "Agent access is planned, not connected in this local sample. The MCP interface will expose collections, recipes, artifacts, and pages after you authorize your harness."
                  )
                }
              >
                About agent access
              </Button>
            </div>
          </section>
          <section className="rail-section" aria-labelledby="scheduled-title">
            <div className="rail-heading">
              <h2 id="scheduled-title">Scheduled work</h2>
              <small>Example recipes</small>
            </div>
            <div className="recipe">
              <span className="recipe-icon">
                <IconView icon={RefreshIcon} />
              </span>
              <div>
                <strong>Morning GitHub sync</strong>
                <small>Daily at 08:00 UTC</small>
                <Status tone="success">Last run succeeded</Status>
              </div>
            </div>
            <div className="recipe">
              <span className="recipe-icon">
                <IconView icon={Calendar03Icon} />
              </span>
              <div>
                <strong>Application recap</strong>
                <small>Monday at 09:00 UTC</small>
                <Status tone="neutral">Next run scheduled</Status>
              </div>
            </div>
            <Button
              variant="outline"
              className="full-width"
              onClick={() => {
                onNotice(
                  "Sample recipe completed locally. No external APIs were called."
                )
              }}
            >
              <IconView icon={PlayIcon} />
              Run sample recipe
            </Button>
          </section>
          <section
            className="rail-section artifact-surface"
            aria-labelledby="artifacts-title"
          >
            <div className="rail-heading">
              <h2 id="artifacts-title">Recent artifacts</h2>
              <small>Files linked to your records</small>
            </div>
            <div className="artifact-row">
              <span className="file-icon">PDF</span>
              <span>
                <strong>Backend engineer CV</strong>
                <small>Applications / GitHub</small>
              </span>
            </div>
            <div className="artifact-row">
              <span className="file-icon html">HTML</span>
              <span>
                <strong>October recap</strong>
                <small>Report snapshot</small>
              </span>
            </div>
            <Button
              variant="link"
              onClick={() =>
                onNotice(
                  "Artifact previews in this sample are illustrative. No files are uploaded or downloaded."
                )
              }
            >
              Browse artifacts
              <IconView icon={ArrowRight01Icon} />
            </Button>
          </section>
        </aside>
      </div>
    </>
  )
}

type StatusTone = "neutral" | "success" | "warning" | "accent" | "destructive"

/** A status label. theme.css colors each `data-tone`. */
function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: StatusTone
}) {
  return (
    <Badge variant="secondary" className="ds-status" data-tone={tone}>
      <i aria-hidden="true" />
      {children}
    </Badge>
  )
}

function ActivityChart() {
  const values = [3, 6, 4, 8, 5, 3, 5]
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]
  const [activePoint, setActivePoint] = useState<number | null>(null)
  return (
    <TooltipProvider delayDuration={0}>
      <div className="activity-chart">
        <svg
          viewBox="0 0 600 160"
          role="group"
          aria-labelledby="activity-chart-title"
        >
          <title id="activity-chart-title">
            Illustrative saved applications by day: Monday 3, Tuesday 6,
            Wednesday 4, Thursday 8, Friday 5, Saturday 3, Sunday 5.
          </title>
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1="25"
              x2="585"
              y1={25 + i * 45}
              y2={25 + i * 45}
              className="chart-grid"
            />
          ))}
          {values.map((value, i) => (
            <Tooltip
              key={days[i]}
              open={activePoint === i}
              onOpenChange={(open) => setActivePoint(open ? i : null)}
            >
              <TooltipTrigger asChild>
                <g
                  tabIndex={0}
                  role="button"
                  data-chart-bar={i}
                  aria-label={`${days[i]}: ${value} saved applications`}
                  onFocus={() => setActivePoint(i)}
                  onBlur={() => setActivePoint(null)}
                  onPointerEnter={() => setActivePoint(i)}
                  onPointerLeave={(event) => {
                    if (document.activeElement !== event.currentTarget)
                      setActivePoint(null)
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === "touch") {
                      event.preventDefault()
                      event.currentTarget.focus()
                      setActivePoint(i)
                    }
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    setActivePoint(i)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setActivePoint(null)
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setActivePoint(i)
                    }
                  }}
                >
                  <rect
                    x={45 + i * 78}
                    y={130 - value * 12}
                    width="29"
                    height={value * 12}
                    rx="3"
                    className={i === 3 ? "chart-bar-selected" : "chart-bar"}
                  />
                  <text x={59 + i * 78} y="153" textAnchor="middle">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </text>
                </g>
              </TooltipTrigger>
              <TooltipContent className="chart-tooltip" sideOffset={8}>
                <strong>{days[i]}</strong>
                <span>{value} saved applications</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </svg>
      </div>
    </TooltipProvider>
  )
}

/** The dynamic values of the foundation specimens; theme.css reads them. */
type SpecimenStyle = CSSProperties & {
  "--pair-bg"?: string
  "--pair-fg"?: string
  "--bar-width"?: string
  "--corner-radius"?: string
}

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const c = hex.replace("#", "")
    const values = [0, 2, 4]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
  }
  const la = luminance(a),
    lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function Foundations({ theme }: { theme: Theme }) {
  const palette = colors[theme]
  // Each pair names its hex values for the contrast label and the CSS
  // tokens with the same values for the swatch.
  const pairs = [
    {
      name: "Canvas & ink",
      bg: palette.background,
      fg: palette.foreground,
      bgToken: "var(--background)",
      fgToken: "var(--foreground)",
    },
    {
      name: "Primary action",
      bg: palette.primary,
      fg: palette.primaryForeground,
      bgToken: "var(--primary)",
      fgToken: "var(--primary-foreground)",
    },
    {
      name: "Quiet text",
      bg: palette.background,
      fg: palette.mutedForeground,
      bgToken: "var(--background)",
      fgToken: "var(--muted-foreground)",
    },
    {
      name: "Accent",
      bg: palette.accent,
      fg: palette.accentForeground,
      bgToken: "var(--accent)",
      fgToken: "var(--accent-foreground)",
    },
    {
      name: "Success",
      bg: palette.successSurface,
      fg: palette.success,
      bgToken: "var(--success-surface)",
      fgToken: "var(--success)",
    },
    {
      name: "Needs attention",
      bg: palette.warningSurface,
      fg: palette.warning,
      bgToken: "var(--warning-surface)",
      fgToken: "var(--warning)",
    },
  ]
  return (
    <>
      <SectionHeading
        title="Foundations"
        description="Color, type, and shape have distinct roles. Inspect the same system in either theme."
      />
      <section className="surface foundation-section">
        <h2>Color has a job</h2>
        <p className="section-copy">
          Forest marks actions. Yellow marks selection. White gives records
          room. Status always includes a readable label.
        </p>
        <div className="color-grid">
          {pairs.map(({ name, bg, fg, bgToken, fgToken }) => {
            const ratio = contrast(bg, fg)
            const swatchStyle: SpecimenStyle = {
              "--pair-bg": bgToken,
              "--pair-fg": fgToken,
            }
            return (
              <article className="color-pair" key={name}>
                <div style={swatchStyle}>
                  Aa <span>{name}</span>
                </div>
                <footer>
                  <code>
                    {bg} / {fg}
                  </code>
                  <span>
                    {ratio.toFixed(2)}:1{" "}
                    <strong>
                      {ratio >= 4.5 ? "AA text" : "Large text only"}
                    </strong>
                  </span>
                </footer>
              </article>
            )
          })}
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>One family, a useful hierarchy</h2>
        <div className="type-specimen">
          <small>Page title · IBM Plex Sans · 32 / 40 · 600</small>
          <p className="type-display">Your working set</p>
          <small>Section title · IBM Plex Sans · 20 / 28 · 600</small>
          <p className="type-heading">Application follow-ups</p>
          <small>Body · IBM Plex Sans · 16 / 24 · 400</small>
          <p className="type-body">
            Connect a source, let a recipe do the routine work, and make your
            data useful.
          </p>
          <small>Data · tabular numbers · 14 / 20</small>
          <p className="type-data">
            $1,250.00 &nbsp; 08:30 UTC &nbsp; 365,000 records
          </p>
          <small>Caption · IBM Plex Sans · 12 / 18 · 400</small>
          <p className="type-caption">
            Updated from the last successful sync. All figures here are
            examples.
          </p>
        </div>
      </section>
      <div className="foundation-columns">
        <section className="surface foundation-section">
          <h2>Space that keeps its rhythm</h2>
          <div className="spacing-ladder">
            {[4, 8, 12, 16, 24, 32, 48].map((value) => {
              const barStyle: SpecimenStyle = {
                "--bar-width": `${value * 3}px`,
              }
              return (
                <div key={value}>
                  <code>{value}px</code>
                  <span style={barStyle} />
                </div>
              )
            })}
          </div>
          <p className="section-copy">
            4px base. 16px within groups, 24px between groups, 32–48px between
            sections.
          </p>
        </section>
        <section className="surface foundation-section">
          <h2>Corners follow the object</h2>
          <div className="radius-ladder">
            {[
              ["4px", "Small controls"],
              ["6px", "Inputs & actions"],
              ["8px", "Data panels"],
              ["12px", "Notes"],
            ].map(([radius, label]) => {
              const cornerStyle: SpecimenStyle = { "--corner-radius": radius }
              return (
                <div key={radius}>
                  <span style={cornerStyle} />
                  <strong>{radius}</strong>
                  <small>{label}</small>
                </div>
              )
            })}
          </div>
          <div className="elevation-ladder">
            <span>Flat data surface</span>
            <span>Floating overlay</span>
          </div>
          <p className="section-copy">
            Borders define data surfaces. Reserve elevation for overlays.
          </p>
        </section>
      </div>
    </>
  )
}

function Components({ onNotice }: { onNotice: (message: string) => void }) {
  const [dialog, setDialog] = useState(false)
  const [checked, setChecked] = useState(true)
  const [showLoading, setShowLoading] = useState(true)
  return (
    <Dialog open={dialog} onOpenChange={setDialog}>
      <SectionHeading
        title="Components"
        description="Actual shadcn components with shared tokens. Try the controls and inspect the edge cases."
      />
      <section className="surface foundation-section">
        <h2>Actions</h2>
        <p className="section-copy">
          One primary action per group. Secondary actions stay secondary.
        </p>
        <div className="button-showcase">
          <Button
            onClick={() => onNotice("Primary action activated in the sample.")}
          >
            Create collection
          </Button>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <Button
            variant="secondary"
            onClick={() => onNotice("Secondary action activated.")}
          >
            Save draft
          </Button>
          <Button
            variant="ghost"
            onClick={() => onNotice("Ghost action activated.")}
          >
            View details
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              onNotice("Destructive specimen only. Nothing was deleted.")
            }
          >
            Delete record
          </Button>
          <Button disabled>Unavailable</Button>
          <Button disabled>
            <Spinner data-icon="inline-start" />
            Saving…
          </Button>
        </div>
        <div className="button-showcase size-ladder">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add a record">
            <IconView icon={PlusSignIcon} />
          </Button>
        </div>
        <div className="state-matrix">
          <div>
            <small>Default</small>
            <Button>Publish page</Button>
          </div>
          <div>
            <small>Hover specimen</small>
            <Button data-preview="hover">Publish page</Button>
          </div>
          <div>
            <small>Focus specimen</small>
            <Button data-preview="focus">Publish page</Button>
          </div>
          <div>
            <small>Pressed specimen</small>
            <Button data-preview="active">Publish page</Button>
          </div>
          <div>
            <small>Disabled</small>
            <Button disabled>Publish page</Button>
          </div>
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>Stacked notifications</h2>
        <p className="section-copy">
          One toast per event. Hover or press Alt+T to expand multiple updates.
        </p>
        <div className="button-showcase">
          <Button
            variant="outline"
            onClick={() => {
              toast.success("Sample collection saved.")
              toast.message("Sample import completed.")
              toast.success("Sample report ready.")
            }}
          >
            Preview stacked toasts
          </Button>
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>Inputs that explain themselves</h2>
        <div className="input-examples">
          <FieldGroup className="input-column">
            <Field>
              <FieldLabel htmlFor="example-name">Collection name</FieldLabel>
              <Input id="example-name" defaultValue="Applications" />
              <FieldDescription>
                Use a name your agent and you will recognize.
              </FieldDescription>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="example-disabled">Workspace</FieldLabel>
              <Input
                id="example-disabled"
                disabled
                value="Personal workspace"
                readOnly
              />
              <FieldDescription>
                Managed in workspace settings.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <FieldGroup className="input-column">
            <Field data-invalid>
              <FieldLabel htmlFor="example-invalid">Connection URL</FieldLabel>
              <Input
                id="example-invalid"
                aria-invalid
                aria-describedby="invalid-help"
                defaultValue="github"
              />
              <FieldError id="invalid-help">
                Enter a complete HTTPS address.
              </FieldError>
            </Field>
          </FieldGroup>
        </div>
        <FieldGroup className="preference-field">
          <Field orientation="horizontal">
            <Checkbox
              id="example-checkbox"
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            <FieldLabel htmlFor="example-checkbox">
              Include a table with every chart
            </FieldLabel>
          </Field>
        </FieldGroup>
      </section>
      <section className="surface foundation-section">
        <h2>Status, without guessing</h2>
        <div className="button-showcase">
          <Status tone="success">Sync succeeded</Status>
          <Status tone="warning">Needs attention</Status>
          <Status tone="accent">Running</Status>
          <Status>Scheduled</Status>
          <Status tone="destructive">Connection failed</Status>
        </div>
        <div className="state-columns">
          <div>
            <Alert variant="destructive">
              <AlertTitle>GitHub connection needs attention</AlertTitle>
              <AlertDescription>
                The credential has expired. Reconnect to resume scheduled
                updates.
              </AlertDescription>
            </Alert>
            <Button
              variant="outline"
              onClick={() =>
                onNotice(
                  "Reconnect is a sample action. No credential is requested."
                )
              }
            >
              Reconnect
            </Button>
          </div>
          <div>
            <div className="surface-heading">
              <h3>Loading records</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLoading(!showLoading)}
              >
                {showLoading ? "Finish loading" : "Show loading"}
              </Button>
            </div>
            {showLoading ? (
              <div
                className="loading-sample"
                aria-label="Loading sample records"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : (
              <p role="status">Your sample records are ready.</p>
            )}
          </div>
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>Missing images have a useful fallback</h2>
        <div className="avatar-examples">
          <Avatar>
            <AvatarImage alt="" />
            <AvatarFallback>Z</AvatarFallback>
          </Avatar>
          <p>
            A missing profile image becomes initials. The rest of the interface
            still works.
          </p>
        </div>
      </section>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>A focused moment</DialogTitle>
          <DialogDescription>
            Dialogs inherit the current theme, keep keyboard focus inside, and
            restore focus when dismissed.
          </DialogDescription>
        </DialogHeader>
        <p>
          This is a real shadcn dialog. Press Escape or use the close button to
          return to the component gallery.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setDialog(false)
              onNotice("Dialog confirmed in the sample.")
            }}
          >
            Confirm example
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Patterns({ onCreate }: { onCreate: () => void }) {
  return (
    <>
      <SectionHeading
        title="Patterns and mascot"
        description="Practical compositions for data, background work, and the occasional helpful sloth."
      />
      <section className="surface foundation-section">
        <h2>Sloth marks</h2>
        <p className="section-copy">
          Four options shown at 16, 24, 32, and 48 pixels. Previewing a mark
          changes this tab only.
        </p>
        <div className="favicon-gallery">
          {faviconOptions.map((option) => (
            <article className="favicon-option" key={option.name}>
              <h3>{option.name}</h3>
              <div className="favicon-sizes">
                {[16, 24, 32, 48].map((size) => (
                  <img
                    key={size}
                    src={option.source}
                    width={size}
                    height={size}
                    alt=""
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Preview ${option.name} favicon`}
                onClick={() => {
                  let icon =
                    document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
                  if (!icon) {
                    icon = document.createElement("link")
                    icon.rel = "icon"
                    document.head.append(icon)
                  }
                  icon.href = option.source
                  icon.type = "image/svg+xml"
                  toast.message(
                    `${option.name} favicon applied to this preview tab.`
                  )
                }}
              >
                Preview in this tab
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>Meet the sloth</h2>
        <p className="section-copy">
          Calm, capable, and paying attention. Initial artwork for curation, not
          a final logo.
        </p>
        <div className="mascot-sheet">
          <img
            src={mascotSource}
            alt="Sloth concept showing welcome, organization, and a completed report"
          />
        </div>
        <div className="mascot-labels">
          <span>Welcome</span>
          <span>Organizing</span>
          <span>Report ready</span>
        </div>
        <p className="section-copy">
          Use it in onboarding, feature explanations, and empty states. Keep
          routine tables and status text clear of illustration.
        </p>
      </section>
      <section className="surface foundation-section">
        <h2>Character reference</h2>
        <p className="section-copy">
          Front T-pose, side, and back views for generating consistent poses.
        </p>
        <div className="mascot-sheet">
          <img
            src={mascotReferenceSource}
            alt="Sloth model reference: front T-pose, side view, and back T-pose"
            loading="lazy"
          />
        </div>
      </section>
      <section className="surface foundation-section">
        <h2>A sloth for each moment</h2>
        <p className="section-copy">
          Six concept poses for curation: welcome, thinking, working,
          presenting, celebrating, and resting.
        </p>
        <div className="mascot-sheet">
          <img
            src={mascotPosesSource}
            alt="Six sloth poses: waving, thinking, using a laptop, presenting a chart, celebrating, and sitting"
            loading="lazy"
          />
        </div>
      </section>
      <section className="surface empty-pattern">
        <Empty>
          <EmptyHeader>
            <span className="empty-symbol" aria-hidden="true">
              <IconView icon={Database01Icon} />
            </span>
            <EmptyTitle>No collections yet</EmptyTitle>
            <EmptyDescription>
              Create a collection for applications, transactions, or something
              entirely your own. Your agent can help fill it in.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onCreate}>
              <IconView icon={PlusSignIcon} />
              Create your first collection
            </Button>
          </EmptyContent>
        </Empty>
      </section>
      <div className="pattern-pairs">
        <section className="surface foundation-section">
          <span className="do-label">Do</span>
          <h3>Make the next step clear</h3>
          <div className="button-showcase">
            <Button onClick={onCreate}>Create collection</Button>
            <Button variant="outline">See an example</Button>
          </div>
          <p className="section-copy">
            A primary action and a quieter alternative.
          </p>
        </section>
        <section className="surface foundation-section">
          <span className="dont-label">Avoid</span>
          <h3>Make everything compete</h3>
          <div className="button-showcase">
            <Button>Start</Button>
            <Button>Explore</Button>
            <Button>Learn more</Button>
          </div>
          <p className="section-copy">
            Identical emphasis leaves the user choosing blindly.
          </p>
        </section>
      </div>
      <section className="surface foundation-section">
        <h2>Five features, one concrete story</h2>
        <div className="feature-list">
          {(
            [
              [
                Database01Icon,
                "Flexible data",
                "Create the fields your workflow needs.",
              ],
              [
                Link01Icon,
                "Connected sources",
                "Reuse approved API access without exposing its secret.",
              ],
              [
                Clock01Icon,
                "Background recipes",
                "Run the same bounded steps on a schedule.",
              ],
              [
                Folder01Icon,
                "Artifacts with context",
                "Keep files and reports beside the records they explain.",
              ],
              [
                DashboardSquare01Icon,
                "Pages made useful",
                "Combine live tables, charts, and custom HTML snapshots.",
              ],
            ] satisfies ReadonlyArray<readonly [Icon, string, string]>
          ).map(([icon, title, description]) => (
            <div key={String(title)}>
              <IconView icon={icon} />
              <span>
                <strong>{String(title)}</strong>
                <p>{String(description)}</p>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function CreateCollection({
  open,
  onOpenChange,
  onCreate,
  existing,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
  existing: string[]
  returnFocus: HTMLElement | null
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const id = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        setError("")
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a collection</DialogTitle>
          <DialogDescription>
            Create a collection in this local sample. No account or database
            changes are made.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const value = name.trim()
            if (!value) {
              setError("Give your collection a name.")
              return
            }
            if (
              existing.some(
                (item) => item.toLowerCase() === value.toLowerCase()
              )
            ) {
              setError(
                "A collection with that name already exists in this sample."
              )
              return
            }
            onCreate(value)
            setError("")
            setName("")
            onOpenChange(false)
          }}
        >
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={id}>Collection name</FieldLabel>
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Reading list"
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-description`}
                maxLength={60}
              />
              {error ? (
                <FieldError id={`${id}-description`}>{error}</FieldError>
              ) : (
                <FieldDescription id={`${id}-description`}>
                  Start with a name. Your agent can help define the fields.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter className="collection-dialog-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError("")
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Create collection</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("Design system root element is missing")
createRoot(root).render(<App />)
