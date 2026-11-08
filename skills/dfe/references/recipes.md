# Recipes and schedules

A recipe is a fixed list of steps. It runs without a model, so each run gives the same result for the same input. A published version never changes.

## Steps

The last step must be an output step (`upsert`, `snapshot`, or `artifact`). At most 32 steps.

| Step        | Shape                                                                                                | Note                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`     | `{ kind, connectionId, route, maxPages }`                                                            | One for each recipe. `maxPages` 1 to 20. Needs `connections.use`.                                                                                                                   |
| `query`     | `{ kind, queryId, revision, maxPages }`                                                              | Reads a plain saved query revision. An aggregate query fails: use an `aggregate` step. Needs `data.read`.                                                                           |
| `map`       | `{ kind, fields: { target: source } }`                                                               | Renames and selects fields. 1 to 64 fields.                                                                                                                                         |
| `filter`    | `{ kind, field, equals }`, `{ kind, field, in: [...] }`, or `{ kind, field, range: { min?, max? } }` |                                                                                                                                                                                     |
| `join`      | `{ kind, field, rightField, prefix, rows \| collectionId \| step }`                                  | Right side: inline `rows` (at most 100), a collection, or the 0-based index of an earlier step. Each joined field is named `<prefix>_<field>` (`prefix: "repo"` gives `repo_name`). |
| `aggregate` | `{ kind, groupBy, operation, field?, output }`                                                       | `count`, `sum`, `min`, `max`, `average`. Only `count` has no `field`.                                                                                                               |
| `upsert`    | `{ kind, collectionId, source, identityField }`                                                      | Output. Updates the record with the same identity, or creates one.                                                                                                                  |
| `snapshot`  | `{ kind, collectionId }`                                                                             | Output.                                                                                                                                                                             |
| `artifact`  | `{ kind, name, format: "json" }`                                                                     | Output. Writes a JSON file.                                                                                                                                                         |

`limits` is required: `rows` 1 to 1000, `bytes` 1 to 500000, `durationMs` 1000 to 900000, `attempts` 1 to 5.

An `upsert` or `snapshot` writes at most 100 rows, and its collection must have at most 100 records. For more rows, write an `artifact`, or aggregate the rows first.

## Build a recipe

1. Find the source:
   - API: `connections_list`, then `connections_describe`. Use only a connection with `usable: true`. The fetch `route` is a route `path` (HTTP connection) or a read ID from `reads` (GitHub connection). Map only the `fields` it returns. If none is usable, tell the user to add or fix the credential in the dashboard.
   - Workspace data: `queries_list` for a saved query `queryId` and `revision`.
2. `collections_describe` on the output collection. Map each output field id to a source field.
3. `recipes_validate`. Fix each `error`.
4. `recipes_preview` with a `sample` of real-shaped rows. The sample replaces the fetch rows. Use `[]` when there is no fetch step. Check the row count after each step and the output rows. A preview reads only the first 50 records of a `query` step, and fails with more than one `query` step, so a run can give more rows.
5. `recipes_publish` with a `name` and an `idempotencyKey`. It returns the `versionId`.

Example: GitHub pull requests into a template collection.

```json
{
  "name": "GitHub PRs",
  "recipe": {
    "steps": [
      {
        "kind": "fetch",
        "connectionId": "<id>",
        "route": "recent_authored_pull_requests",
        "maxPages": 1
      },
      {
        "kind": "map",
        "fields": {
          "id": "id",
          "number": "number",
          "title": "title",
          "state": "state",
          "html_url": "html_url",
          "repository_url": "repository_url",
          "created_at": "created_at",
          "updated_at": "updated_at"
        }
      },
      {
        "kind": "upsert",
        "collectionId": "<id>",
        "source": "github",
        "identityField": "id"
      }
    ],
    "limits": {
      "rows": 500,
      "bytes": 500000,
      "durationMs": 60000,
      "attempts": 3
    }
  }
}
```

## Run

- `recipes_trigger` with `versionId` and an `idempotencyKey`. Reuse the key to retry the same request.
- `recipes_runs` lists runs with `state`: `pending`, `running`, `succeeded`, `failed`, `cancelled`, `skipped`.
- `recipes_history` with `runId` lists each step attempt and its `error`.
- `recipes_cancel` stops a run. `recipes_retry` starts a new run of the same version. Use a new key for each retry.

## Schedule

- `recipes_schedule` with `versionId` and `timing`:
  - `{ "kind": "cron", "expression": "0 6 * * *" }`: five fields, **UTC**. Convert the user's local time to UTC and tell them.
  - `{ "kind": "once", "at": <ms since epoch> }`.
- A due run is skipped while the prior run of the schedule is active. After missed times, one run starts for the latest due time only.
- To use a new recipe version: `recipes_schedules`, then `schedules_update` with `expectedRevision` (0 when absent), the new `versionId`, and `timing`.
- `recipes_set_enabled` turns a schedule on or off.
- Only the recipe creator manages schedules and run access (`recipes_set_run_access`).
