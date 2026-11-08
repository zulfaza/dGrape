---
name: dfe
description: Use the DFE (Dashboard for Everything) MCP server to store data in collections, change schemas, run recipes on a schedule, and publish dashboard pages. Use when the user asks to connect DFE, save or read workspace data, import records, build a dashboard or page, fetch an API on a schedule, or when tools named `workspace_describe`, `records_*`, `recipes_*`, `queries_*` or `pages_*` are available.
---

# DFE MCP

DFE is a data workspace for agents. The MCP server gives you typed collections, files (artifacts), deterministic recipes, saved queries, and pages. The dashboard shows the results to the user.

## Connect

To set up the MCP server or get a token, read the setup guide: `https://<dfe-origin>/guide#agent` (for example https://dfe.makarima.dev/guide#agent). The guide always has the current steps.

Some clients add a prefix to tool names (for example `mcp__dfe__records_list`). This skill uses the names without a prefix.

Do not write the token in chat, in a report, or in a file in a repository.

## Start every task

1. `capabilities_list`: read the scopes and which capabilities are `allowed`. Do not call a tool that is not allowed. Tell the user which scope is missing.
2. `workspace_describe`: find collection IDs and the `indexed` fields.
3. `collections_describe` before you write records or change a schema. Keep the `version`.

## Rules

- **Pagination.** List tools return `isDone` and `continueCursor`. While `isDone` is false, call again with `cursor` (recipe tools: `paginationOpts: { numItems, cursor }`, first cursor `null`). Do not report a total from one page.
- **Idempotency.** Send an `idempotencyKey` on each write you can retry. Use a new key for each intended change, and reuse it only to retry that change. For most writes, the same key with other input fails. `records_create` is different: the same key returns the existing record and does not compare the values, so use a stable source ID (for example `import:<source>:<id>`). `recipes_trigger` needs a key.
- **Optimistic revisions.** Updates and deletes need the current value: `expectedRevision` (records, saved queries, pages, schedules), `expectedVersion` (schemas), `expectedPublishedRevision` (pages). When the call fails because the object changed, read it again, then decide again. Do not retry with the new number blindly.
- **Values.** Key record values by field `id`, not label. Money is `integer` minor units plus a separate currency field. Dates are `YYYY-MM-DD`. Timestamps are integer milliseconds UTC.
- **Destructive tools.** `records_delete`, `migrations_start`, `pages_publish`, `recipes_trigger`, `recipes_schedule` and `schedules_update` change live state. Tell the user what will change and get approval first, unless the user already asked for that exact change.
- **Secrets.** You never see secret values. A person adds API credentials in the dashboard. Use `connections_list` to find a usable connection.

## Tasks

| Task                                                | Read                                                         |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Create a collection, write records, change a schema | [references/data.md](references/data.md)                     |
| Fetch an API, transform rows, run on a schedule     | [references/recipes.md](references/recipes.md)               |
| Saved queries, charts, dashboard pages              | [references/pages.md](references/pages.md)                   |
| Upload or link files                                | [references/data.md#artifacts](references/data.md#artifacts) |

## Check your work

- After writes: `records_query` or `records_list` to read the result.
- After a recipe run: `recipes_runs`, then `recipes_history` with the `runId` for the failed step and its `error`.
- After a page change: `pages_get` and check that each `bindings` entry is `null`.
- `activity_list` shows who changed what.
- `workspace_export` returns all definitions as JSON (no records, no secrets). Use it for a backup before a large change.
