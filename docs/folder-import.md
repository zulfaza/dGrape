# Folder import

`scripts/import-job-folder.ts` imports a local job-search folder into a
collection made from the `applications` template
(`convex/lib/collectionTemplates.ts`).

The script has two modes:

1. **Dry run** (the default). It reads the folder and writes `plan.json` and
   `report.md`. It sends nothing.
2. **Apply** (`--apply <plan.json>`). It sends the reviewed plan through the
   agent HTTP API. Use it only after you review `report.md`.

## Folder layout

```text
<jobs-folder>/
  <Company>/
    summary.md                 # optional: kept with each role of the company
    <Role>/
      job_description.md       # header lines give the values
      application_status.md    # optional: its presence means "applied"
      CV.pdf, cover_letter.md, drafts/...   # kept as artifacts
```

- Each `<Company>/<Role>/` folder becomes one record.
- Files in a role folder, and in its subfolders, become artifacts of that
  record.
- Company files that the layout names (default `summary.md`) become artifacts
  of each role of that company.
- Other files at the root or in a company folder are "not mapped". The report
  lists them.

To use other file names, give a layout file with `--layout`. Each key is
optional:

```json
{
  "descriptionFile": "job_description.md",
  "statusFile": "application_status.md",
  "companyFiles": ["summary.md"]
}
```

## Mapping

The script reads `Key: value` lines. It accepts `- Key: value`,
`**Key:** value` and `- **Key**: value`. In the description file, it reads
only the lines before the first `## ` heading. The first line for a key wins.

| Field   | Value                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| company | `Company:` in the description, else the company folder name                                                                                                                                                              |
| role    | `Role:`, else the `# ` title, else the role folder name                                                                                                                                                                  |
| url     | The first URL in `Source URL:`, `Source:`, `Sources:`, `Source/application:`, `Job:` or `URL:` (description first, then status file)                                                                                     |
| source  | The host name of the URL, without `www.`                                                                                                                                                                                 |
| stage   | `researching` when there is no status file. Else from its `Status:` line: `rejected`, `offer`, `interviewing`, `prepared` (draft, pending, not submitted) or `applied`. A status file without `Status:` gives `applied`. |
| date    | With a status file: its `Date:` line. Else (or when that is missing) `Date checked:`, `Checked:` or `Date:` in the description. Only real `YYYY-MM-DD` dates count.                                                      |

A record is **blocked** when it has no URL, no date, or a status that the
script cannot map. The server rules (`checkRecordValues`) also run in the dry
run. Blocked records are in the report and not in the plan.

## Skipped paths

The script never follows symbolic links. It skips these paths, and the report
lists each one:

| Reason     | Paths                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| hidden     | Names that start with `.` (`.DS_Store`, `.env`, `.git`, `.cache`...)                                                                        |
| dependency | `node_modules`, `bower_components`, `jspm_packages`, `vendor`, `venv`, `site-packages`                                                      |
| cache      | `__pycache__`, `*.pyc`, `*.pyo`, `*.tsbuildinfo`, `Thumbs.db`, `desktop.ini`                                                                |
| credential | Key and credential file names (`id_rsa`, `*.pem`, `*.key`, `credentials*`, `secrets*`...), and text files that contain a common token shape |
| symlink    | Symbolic links                                                                                                                              |
| too-large  | Files over the artifact limit (25 MiB)                                                                                                      |

Token detection is best effort. It cannot find every secret. Read the report
before you apply.

## Run it

```sh
# Dry run. --out must be outside the jobs folder.
node scripts/import-job-folder.ts "<jobs-folder>" --out ./import-out

# Apply, after you review import-out/report.md.
DGRAPE_AGENT_TOKEN=<read-and-write credential> \
  node scripts/import-job-folder.ts --apply ./import-out/plan.json \
  --api-url https://<deployment>.convex.site --collection-id <collection id>
```

Make the collection from the `applications` template first. Apply mode stops
when the collection does not have the template fields.

## Apply, retries and provenance

- Records use the idempotency key `folder-import:v1:<hash of the folder
  path>`. A retry returns the record that exists. It does not change it.
- Each artifact name is `<first 16 hex digits of SHA-256>-<file name>`. Apply
  lists the workspace artifacts and does not upload a name that exists.
- Before an upload, apply reads the file again and compares its SHA-256 with
  the plan. When the file changed, apply stops. Run the dry run again.
- The agent API cannot bind an artifact to a record. Apply uploads one
  manifest artifact, `import-provenance-<plan hash>.json`, that gives for each
  record its folder, record ID, and artifacts (ID, source path, SHA-256, size,
  modification time). It also writes `apply-result.json` next to the plan.
