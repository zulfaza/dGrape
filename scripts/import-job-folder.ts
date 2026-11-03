/**
 * Imports a local job-search folder into a collection made from the
 * "applications" template. Read docs/folder-import.md for the layout, the
 * mapping, and the files it skips.
 *
 * Dry run (the default) reads the folder and writes plan.json and report.md.
 * It sends nothing. Apply mode (`--apply <plan.json>`) sends the reviewed plan
 * through the agent HTTP API. A retry does not make duplicates: records use
 * idempotency keys, and artifact names start with the file's SHA-256.
 */
import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { Effect, Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { MAX_ARTIFACT_BYTES } from "../convex/lib/artifactDomain.ts"
import {
  checkRecordValues,
  type RecordValues,
} from "../convex/lib/collectionDomain.ts"
import { collectionTemplates } from "../convex/lib/collectionTemplates.ts"
import * as AgentApi from "../src/mcp/agent-api.ts"

const TEMPLATE_ID = "applications"
const PLAN_VERSION = 1
const TOKEN_ENV = "DGRAPE_AGENT_TOKEN"

const template = collectionTemplates().find(({ id }) => id === TEMPLATE_ID)
if (!template) throw new Error(`Template "${TEMPLATE_ID}" does not exist`)
const templateFields = template.fields

// ---------------------------------------------------------------------------
// Layout

/** File names in an application folder. All keys are optional in the file. */
const LayoutFile = Schema.Struct({
  descriptionFile: Schema.optionalKey(Schema.String),
  statusFile: Schema.optionalKey(Schema.String),
  companyFiles: Schema.optionalKey(Schema.Array(Schema.String)),
})
type Layout = {
  /** Has the header lines (`Company:`, `Role:`, `Source URL:`...). */
  readonly descriptionFile: string
  /** Its presence means the application was sent. */
  readonly statusFile: string
  /** Files in a company folder that every role of that company keeps. */
  readonly companyFiles: readonly string[]
}
const DEFAULT_LAYOUT: Layout = {
  descriptionFile: "job_description.md",
  statusFile: "application_status.md",
  companyFiles: ["summary.md"],
}

// ---------------------------------------------------------------------------
// Plan (written by the dry run, read by apply mode)

const PlannedArtifact = Schema.Struct({
  /** POSIX path relative to the plan root. */
  path: Schema.String,
  sha256: Schema.String,
  size: Schema.Number,
  modifiedAt: Schema.String,
  contentType: Schema.String,
  artifactName: Schema.String,
})
type PlannedArtifact = typeof PlannedArtifact.Type

const PlannedRecord = Schema.Struct({
  folder: Schema.String,
  idempotencyKey: Schema.String,
  values: AgentApi.RecordValues,
  artifacts: Schema.Array(PlannedArtifact),
})
type PlannedRecord = typeof PlannedRecord.Type

const SkipReason = Schema.Literals([
  "hidden",
  "dependency",
  "cache",
  "credential",
  "symlink",
  "too-large",
])
type SkipReason = typeof SkipReason.Type

const PlanException = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("blocked"),
    folder: Schema.String,
    problems: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("notice"),
    folder: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("skipped"),
    path: Schema.String,
    reason: SkipReason,
  }),
  Schema.Struct({
    kind: Schema.Literal("unmapped"),
    path: Schema.String,
    message: Schema.String,
  }),
])
type PlanException = typeof PlanException.Type

const Plan = Schema.Struct({
  version: Schema.Literal(PLAN_VERSION),
  template: Schema.Literal(TEMPLATE_ID),
  root: Schema.String,
  createdAt: Schema.String,
  records: Schema.Array(PlannedRecord),
  exceptions: Schema.Array(PlanException),
})
type Plan = typeof Plan.Type

// ---------------------------------------------------------------------------
// Exclusions

const DEPENDENCY_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "venv",
  "site-packages",
])
const CACHE_DIRS = new Set(["__pycache__"])
const CACHE_FILES = /\.(pyc|pyo|tsbuildinfo)$|^(Thumbs\.db|desktop\.ini)$/i
const CREDENTIAL_FILES =
  /^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials?(\..+)?|secrets?(\..+)?|.+\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk))$/i
/** Common token shapes. Best effort: it cannot find every secret. */
const CREDENTIAL_CONTENT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
]
const TEXT_FILES =
  /\.(md|txt|html?|json|csv|ya?ml|toml|ini|cfg|conf|js|ts|py|sh)$/i

/** Why a file or folder is skipped from its name alone, or null. */
function skipByName(name: string, isDirectory: boolean): SkipReason | null {
  if (name.startsWith(".")) return "hidden"
  if (isDirectory) {
    if (DEPENDENCY_DIRS.has(name)) return "dependency"
    if (CACHE_DIRS.has(name)) return "cache"
    return null
  }
  if (CACHE_FILES.test(name)) return "cache"
  if (CREDENTIAL_FILES.test(name)) return "credential"
  return null
}

// ---------------------------------------------------------------------------
// Folder scan

const CONTENT_TYPES = new Map([
  [".md", "text/markdown"],
  [".txt", "text/plain"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".json", "application/json"],
  [".csv", "text/csv"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
])

const MAX_ARTIFACT_NAME = 200

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex")
}

function toPosix(relative: string) {
  return relative.split(path.sep).join("/")
}

type Scan = {
  readonly root: string
  readonly exceptions: PlanException[]
}

/**
 * Reads one file into a planned artifact. Returns null, and adds an
 * exception, when the file is a symlink, too large, or looks like it holds a
 * credential.
 */
async function planFile(scan: Scan, absolute: string) {
  const relative = toPosix(path.relative(scan.root, absolute))
  const stat = await lstat(absolute)
  if (stat.isSymbolicLink()) {
    scan.exceptions.push({ kind: "skipped", path: relative, reason: "symlink" })
    return null
  }
  if (stat.size > MAX_ARTIFACT_BYTES) {
    scan.exceptions.push({
      kind: "skipped",
      path: relative,
      reason: "too-large",
    })
    return null
  }
  const bytes = await readFile(absolute)
  const name = path.basename(absolute)
  if (
    TEXT_FILES.test(name) &&
    CREDENTIAL_CONTENT.some((pattern) => pattern.test(bytes.toString("utf8")))
  ) {
    scan.exceptions.push({
      kind: "skipped",
      path: relative,
      reason: "credential",
    })
    return null
  }
  const digest = sha256(bytes)
  const artifact: PlannedArtifact = {
    path: relative,
    sha256: digest,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    contentType:
      CONTENT_TYPES.get(path.extname(name).toLowerCase()) ??
      "application/octet-stream",
    artifactName: `${digest.slice(0, 16)}-${name}`.slice(0, MAX_ARTIFACT_NAME),
  }
  return artifact
}

/** Lists the entries of a folder that are not skipped by name. */
async function entries(scan: Scan, folder: string) {
  const kept: { name: string; absolute: string; isDirectory: boolean }[] = []
  const dirents = await readdir(folder, { withFileTypes: true })
  dirents.sort((a, b) => a.name.localeCompare(b.name))
  for (const dirent of dirents) {
    const absolute = path.join(folder, dirent.name)
    if (dirent.isSymbolicLink()) {
      scan.exceptions.push({
        kind: "skipped",
        path: toPosix(path.relative(scan.root, absolute)),
        reason: "symlink",
      })
      continue
    }
    const reason = skipByName(dirent.name, dirent.isDirectory())
    if (reason) {
      scan.exceptions.push({
        kind: "skipped",
        path: toPosix(path.relative(scan.root, absolute)),
        reason,
      })
      continue
    }
    kept.push({
      name: dirent.name,
      absolute,
      isDirectory: dirent.isDirectory(),
    })
  }
  return kept
}

/** Plans every kept file in `folder` and its subfolders. */
async function planTree(scan: Scan, folder: string) {
  const artifacts: PlannedArtifact[] = []
  for (const entry of await entries(scan, folder)) {
    if (entry.isDirectory)
      artifacts.push(...(await planTree(scan, entry.absolute)))
    else {
      const artifact = await planFile(scan, entry.absolute)
      if (artifact) artifacts.push(artifact)
    }
  }
  return artifacts
}

// ---------------------------------------------------------------------------
// Mapping

const KEY_LINE =
  /^\s*(?:[-*]\s+)?\*{0,2}([A-Za-z][A-Za-z /]{0,40}?)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/

/** Removes Markdown emphasis and link syntax from a one-line value. */
function plainText(value: string) {
  return value
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim()
}

/** First value of each `Key: value` line, by lower-case key. */
function keyValues(lines: readonly string[]) {
  const values = new Map<string, string>()
  for (const line of lines) {
    const match = KEY_LINE.exec(line)
    const key = match?.[1]?.trim().toLowerCase()
    const value = match?.[2]?.trim()
    if (key && value && !values.has(key)) values.set(key, value)
  }
  return values
}

function firstOf(values: Map<string, string>, keys: readonly string[]) {
  for (const key of keys) {
    const value = values.get(key)
    if (value) return value
  }
  return undefined
}

function firstUrl(value: string | undefined) {
  const match = value ? /https?:\/\/[^\s)>\]]+/.exec(value) : null
  if (!match) return undefined
  try {
    return new URL(match[0].replace(/[.,;:]+$/, ""))
  } catch {
    return undefined
  }
}

/** The first real YYYY-MM-DD date in `value`. */
function firstDate(value: string | undefined) {
  const match = value ? /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(value) : null
  if (!match) return undefined
  const [text, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.toISOString().startsWith(text) ? text : undefined
}

type Stage =
  | "researching"
  | "prepared"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"

/** Maps a free-text status to a stage. Order matters: "not submitted". */
function stageOf(status: string): Stage | undefined {
  const text = status.toLowerCase()
  if (/reject|declined|closed/.test(text)) return "rejected"
  if (/offer/.test(text)) return "offer"
  if (/interview/.test(text)) return "interviewing"
  if (/not (yet )?(submitted|sent|applied)|draft|pending|blocked/.test(text))
    return "prepared"
  if (/submitted|applied|sent/.test(text)) return "applied"
  return undefined
}

const SOURCE_KEYS = [
  "source url",
  "source",
  "sources",
  "source/application",
  "job",
  "url",
]
const DATE_KEYS = ["date checked", "checked", "date"]

async function readText(folder: string, name: string) {
  try {
    return await readFile(path.join(folder, name), "utf8")
  } catch {
    return undefined
  }
}

type Mapped =
  | { kind: "record"; values: RecordValues; notices: string[] }
  | { kind: "blocked"; problems: string[] }

/** Maps one `<company>/<role>` folder to template values. */
async function mapFolder(
  layout: Layout,
  companyFolder: string,
  roleFolder: string
): Promise<Mapped> {
  const problems: string[] = []
  const notices: string[] = []
  const description = await readText(roleFolder, layout.descriptionFile)
  const status = await readText(roleFolder, layout.statusFile)
  if (description === undefined)
    notices.push(`No ${layout.descriptionFile}: values come from folder names.`)

  const lines = (description ?? "").split(/\r?\n/)
  const firstSection = lines.findIndex((line) => /^##\s/.test(line))
  const header = firstSection === -1 ? lines : lines.slice(0, firstSection)
  const info = keyValues(header)
  const statusInfo = keyValues((status ?? "").split(/\r?\n/))
  const title = header.find((line) => /^#\s/.test(line))?.replace(/^#\s+/, "")

  const company = plainText(info.get("company") ?? path.basename(companyFolder))
  const role = plainText(info.get("role") ?? title ?? path.basename(roleFolder))
  const url =
    firstUrl(firstOf(info, SOURCE_KEYS)) ??
    firstUrl(firstOf(statusInfo, SOURCE_KEYS))
  if (!url) problems.push("No source URL: cannot set source.")

  let stage: Stage | undefined = "researching"
  let date = firstDate(firstOf(info, DATE_KEYS))
  if (status !== undefined) {
    const statusText = statusInfo.get("status")
    stage = statusText === undefined ? "applied" : stageOf(statusText)
    if (statusText === undefined)
      notices.push(
        `${layout.statusFile} has no "Status:" line: stage is applied.`
      )
    if (!stage)
      problems.push(`Unknown status "${plainText(statusText ?? "")}".`)
    date = firstDate(statusInfo.get("date")) ?? date
  }
  if (!date) problems.push("No YYYY-MM-DD date.")

  if (problems.length > 0 || !url || !stage || !date)
    return { kind: "blocked", problems }
  const values: RecordValues = {
    company,
    role,
    stage,
    source: url.hostname.replace(/^www\./, ""),
    date,
    url: url.toString(),
  }
  const checked = checkRecordValues(templateFields, values)
  if (!checked.ok) return { kind: "blocked", problems: [checked.message] }
  return { kind: "record", values: checked.value, notices }
}

/** The dry run: maps `root` to a plan. Reads files only. */
async function buildPlan(root: string, layout: Layout): Promise<Plan> {
  const scan: Scan = { root, exceptions: [] }
  const records: PlannedRecord[] = []
  const unmapped = (absolute: string, message: string) =>
    scan.exceptions.push({
      kind: "unmapped",
      path: toPosix(path.relative(root, absolute)),
      message,
    })

  for (const company of await entries(scan, root)) {
    if (!company.isDirectory) {
      unmapped(company.absolute, "A file at the root is not an application.")
      continue
    }
    const children = await entries(scan, company.absolute)
    const roles = children.filter((child) => child.isDirectory)
    if (roles.length === 0)
      unmapped(company.absolute, "A company folder has no role folders.")
    const shared: PlannedArtifact[] = []
    for (const child of children) {
      if (child.isDirectory) continue
      if (!layout.companyFiles.includes(child.name)) {
        unmapped(child.absolute, "A loose file in a company folder.")
        continue
      }
      const artifact = await planFile(scan, child.absolute)
      if (artifact) shared.push(artifact)
    }
    for (const role of roles) {
      const folder = toPosix(path.relative(root, role.absolute))
      const mapped = await mapFolder(layout, company.absolute, role.absolute)
      const artifacts = await planTree(scan, role.absolute)
      if (mapped.kind === "blocked") {
        scan.exceptions.push({
          kind: "blocked",
          folder,
          problems: mapped.problems,
        })
        continue
      }
      for (const message of mapped.notices)
        scan.exceptions.push({ kind: "notice", folder, message })
      records.push({
        folder,
        idempotencyKey: `folder-import:v${PLAN_VERSION}:${sha256(folder).slice(0, 40)}`,
        values: mapped.values,
        artifacts: [...artifacts, ...shared],
      })
    }
  }
  return {
    version: PLAN_VERSION,
    template: TEMPLATE_ID,
    root,
    createdAt: new Date().toISOString(),
    records,
    exceptions: scan.exceptions,
  }
}

// ---------------------------------------------------------------------------
// Report

function cell(value: string | number | boolean | undefined) {
  return String(value ?? "").replace(/\|/g, "\\|")
}

function renderReport(plan: Plan) {
  const blocked = plan.exceptions.filter((e) => e.kind === "blocked")
  const notices = plan.exceptions.filter((e) => e.kind === "notice")
  const skipped = plan.exceptions.filter((e) => e.kind === "skipped")
  const unmapped = plan.exceptions.filter((e) => e.kind === "unmapped")
  const files = new Set(
    plan.records.flatMap((record) => record.artifacts.map((a) => a.path))
  )
  const out = [
    "# Folder import: dry run",
    "",
    `Root: \`${plan.root}\``,
    `Template: ${plan.template}`,
    "",
    `- Records ready: ${plan.records.length}`,
    `- Records blocked: ${blocked.length}`,
    `- Files kept as artifacts: ${files.size}`,
    `- Paths skipped: ${skipped.length}`,
    `- Paths not mapped: ${unmapped.length}`,
    "",
    "Nothing was sent. Review this report, then run apply mode with plan.json.",
    "",
    "## Mapping",
    "",
    "| Folder | Company | Role | Stage | Source | Date | Files |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...plan.records.map(
      ({ folder, values, artifacts }) =>
        `| ${cell(folder)} | ${cell(values.company)} | ${cell(values.role)} | ${cell(values.stage)} | ${cell(values.source)} | ${cell(values.date)} | ${artifacts.length} |`
    ),
    "",
    "## Exceptions",
    "",
    "### Blocked records",
    "",
    ...(blocked.length === 0 ? ["None."] : []),
    ...blocked.map((e) => `- \`${e.folder}\`: ${e.problems.join(" ")}`),
    "",
    "### Notices",
    "",
    ...(notices.length === 0 ? ["None."] : []),
    ...notices.map((e) => `- \`${e.folder}\`: ${e.message}`),
    "",
    "### Skipped paths",
    "",
    ...(skipped.length === 0 ? ["None."] : []),
    ...skipped.map((e) => `- \`${e.path}\`: ${e.reason}`),
    "",
    "### Paths not mapped",
    "",
    ...(unmapped.length === 0 ? ["None."] : []),
    ...unmapped.map((e) => `- \`${e.path}\`: ${e.message}`),
    "",
  ]
  return out.join("\n")
}

// ---------------------------------------------------------------------------
// Apply

class ImportError extends Schema.TaggedError<ImportError>()("ImportError", {
  message: Schema.String,
}) {}

const fail = (message: string) => Effect.fail(new ImportError({ message }))

/** PUTs bytes to a signed upload URL. */
const putBytes = (
  url: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string
) =>
  Effect.tryPromise({
    try: () =>
      fetch(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes,
        signal: AbortSignal.timeout(120_000),
      }),
    catch: () => new ImportError({ message: "The file upload failed." }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : fail(`The file upload failed with status ${response.status}.`)
    )
  )

/** Uploads bytes as an artifact named `name`, and returns its ID. */
const uploadArtifact = (
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string
) =>
  Effect.gen(function* () {
    const api = yield* AgentApi.AgentApi
    const upload = yield* api.createArtifactUpload({ name })
    yield* putBytes(upload.uploadUrl, bytes, contentType)
    const created = yield* api.completeArtifactUpload({
      uploadId: upload.uploadId,
    })
    return created.id
  })

/** Artifact IDs by name, for every artifact in the workspace. */
const existingArtifacts = Effect.gen(function* () {
  const api = yield* AgentApi.AgentApi
  const byName = new Map<string, string>()
  let cursor: string | undefined
  for (;;) {
    const page = yield* api.listArtifacts({ limit: 50, cursor })
    for (const artifact of page.page) byName.set(artifact.name, artifact.id)
    if (page.isDone) return byName
    cursor = page.continueCursor
  }
})

/** Sends a reviewed plan. Each step is safe to retry. */
const applyPlan = (plan: Plan, planHash: string, collectionId: string) =>
  Effect.gen(function* () {
    const api = yield* AgentApi.AgentApi
    const workspace = yield* api.describeWorkspace
    const collection = workspace.collections.find(
      ({ id }) => id === collectionId
    )
    if (!collection)
      return yield* fail(`Collection ${collectionId} is not in this workspace.`)
    for (const field of templateFields) {
      const target = collection.fields.find(({ id }) => id === field.id)
      if (target?.type !== field.type)
        return yield* fail(
          `Collection ${collection.name} has no ${field.type} field "${field.id}". Make it from the "${TEMPLATE_ID}" template.`
        )
    }

    const artifactIds = yield* existingArtifacts
    const results: {
      folder: string
      recordId: string
      status: "created" | "existing"
      artifacts: (PlannedArtifact & { artifactId: string })[]
    }[] = []
    for (const record of plan.records) {
      const artifacts: (PlannedArtifact & { artifactId: string })[] = []
      for (const artifact of record.artifacts) {
        let artifactId = artifactIds.get(artifact.artifactName)
        if (!artifactId) {
          const bytes = yield* Effect.tryPromise({
            try: () => readFile(path.join(plan.root, artifact.path)),
            catch: () =>
              new ImportError({ message: `Cannot read ${artifact.path}.` }),
          })
          if (sha256(bytes) !== artifact.sha256)
            return yield* fail(
              `${artifact.path} changed after the dry run. Run the dry run again.`
            )
          artifactId = yield* uploadArtifact(
            artifact.artifactName,
            bytes,
            artifact.contentType
          )
          artifactIds.set(artifact.artifactName, artifactId)
        }
        artifacts.push({ ...artifact, artifactId })
      }
      const created = yield* api.createRecord({
        collectionId,
        values: record.values,
        idempotencyKey: record.idempotencyKey,
      })
      results.push({
        folder: record.folder,
        recordId: created.id,
        status: created.status,
        artifacts,
      })
      console.log(`${created.status}: ${record.folder}`)
    }

    // The API cannot bind artifacts to records, so one manifest artifact
    // keeps the provenance: which record came from which files.
    const provenance = {
      planSha256: planHash,
      root: plan.root,
      collectionId,
      appliedAt: new Date().toISOString(),
      records: results,
    }
    const manifestName = `import-provenance-${planHash.slice(0, 16)}.json`
    const manifestId =
      artifactIds.get(manifestName) ??
      (yield* uploadArtifact(
        manifestName,
        new TextEncoder().encode(JSON.stringify(provenance, null, 2)),
        "application/json"
      ))
    return { ...provenance, manifestArtifactId: manifestId }
  })

// ---------------------------------------------------------------------------
// Command line

type Command =
  | { mode: "plan"; root: string; out: string; layoutFile: string | undefined }
  | { mode: "apply"; planFile: string; apiUrl: string; collectionId: string }

const USAGE = `Usage:
  Dry run: node scripts/import-job-folder.ts <jobs-folder> --out <dir> [--layout <layout.json>]
  Apply:   ${TOKEN_ENV}=<token> node scripts/import-job-folder.ts --apply <plan.json> --api-url <convex-site-url> --collection-id <id>`

function parseCommand(argv: string[]): Command {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      layout: { type: "string" },
      apply: { type: "string" },
      "api-url": { type: "string" },
      "collection-id": { type: "string" },
    },
  })
  if (values.apply !== undefined) {
    const apiUrl = values["api-url"]
    const collectionId = values["collection-id"]
    if (!apiUrl || !collectionId || positionals.length > 0)
      throw new Error(USAGE)
    return { mode: "apply", planFile: values.apply, apiUrl, collectionId }
  }
  const [root, ...rest] = positionals
  if (!root || !values.out || rest.length > 0) throw new Error(USAGE)
  return { mode: "plan", root, out: values.out, layoutFile: values.layout }
}

async function readLayout(file: string | undefined): Promise<Layout> {
  if (file === undefined) return DEFAULT_LAYOUT
  const parsed = Schema.decodeUnknownSync(LayoutFile)(
    JSON.parse(await readFile(file, "utf8"))
  )
  return { ...DEFAULT_LAYOUT, ...parsed }
}

async function runPlan(command: Extract<Command, { mode: "plan" }>) {
  const root = path.resolve(command.root)
  const out = path.resolve(command.out)
  const inside = path.relative(root, out)
  if (!inside.startsWith("..") && !path.isAbsolute(inside))
    throw new Error("--out must be outside the folder that you import.")
  if (!(await lstat(root)).isDirectory())
    throw new Error(`${root} is not a folder.`)
  const plan = await buildPlan(root, await readLayout(command.layoutFile))
  await mkdir(out, { recursive: true })
  await writeFile(path.join(out, "plan.json"), JSON.stringify(plan, null, 2))
  await writeFile(path.join(out, "report.md"), renderReport(plan))
  const blocked = plan.exceptions.filter((e) => e.kind === "blocked").length
  console.log(
    `Dry run: ${plan.records.length} records ready, ${blocked} blocked, ${plan.exceptions.length} exceptions.`
  )
  console.log(`Wrote ${path.join(out, "plan.json")} and report.md.`)
}

async function runApply(command: Extract<Command, { mode: "apply" }>) {
  const token = process.env[TOKEN_ENV]
  if (!token)
    throw new Error(`Set ${TOKEN_ENV} to a read-and-write credential.`)
  const text = await readFile(command.planFile, "utf8")
  const plan = Schema.decodeUnknownSync(Plan)(JSON.parse(text))
  const result = await Effect.runPromise(
    applyPlan(plan, sha256(text), command.collectionId).pipe(
      Effect.provide(
        AgentApi.layer(command.apiUrl).pipe(
          Layer.provide(FetchHttpClient.layer)
        )
      ),
      Effect.provideService(AgentApi.AgentCredential, { token })
    )
  )
  const resultFile = path.join(
    path.dirname(command.planFile),
    "apply-result.json"
  )
  await writeFile(resultFile, JSON.stringify(result, null, 2))
  console.log(
    `Applied ${result.records.length} records. Provenance artifact: ${result.manifestArtifactId}. Wrote ${resultFile}.`
  )
}

try {
  const command = parseCommand(process.argv.slice(2))
  await (command.mode === "plan" ? runPlan(command) : runApply(command))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
