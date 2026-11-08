# Saved queries and pages

A page shows blocks. A live block reads one revision of a saved query. Queries and pages are versioned: each save makes a new revision.

## Save a query

`queries_save` with `collectionId`, `name`, and `query`:

- `fieldId`: an indexed field. `order`: `"asc"` or `"desc"`.
- `where`: `{ eq }`, `{ lower?, upper? }`, or `{ in: [values] }` (1 to 20 values). On a `multiSelect` field, `where` must be `{ eq: option }`.
- `filters` (optional, up to 5): `{ fieldId, op, value }` with `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, or `{ fieldId, op: "in", values }`. They apply after the indexed read, so a page of results can be short.
- `select` (optional): 1 to 50 field ids.
- `aggregate` (optional, not with `select`): `{ measures, groupBy? }`. Measures: `{ op: "count" }` or `{ op: "sum" | "average" | "min" | "max", fieldId }`. `groupBy: { fieldId, bucket? }` with bucket `day`, `week`, `month`, `year` (UTC). Result fields: the group field, `count`, and `<op>_<fieldId>`.

To change a query, pass `queryId` and `expectedRevision`. Keep the returned `queryId` and `revision`.

## Read a query

- `queries_run` for a plain query. Check `completeness`: `"partial"` means more pages.
- `queries_aggregate` for an aggregate query. When it fails with `QueryTooExpensive`, narrow the query, or write a recipe with an `aggregate` step into a summary collection and query that.
- `queries_list` shows `status: "stale"` when the schema changed. Save the query again before you bind it.

## Build a page

1. Save the queries. Run each one to check the result fields.
2. `pages_save_draft` with a `definition`: `title` and up to 20 `blocks`. Omit `pageId` for a new page.
   - `{ "kind": "markdown", "text": "..." }`
   - `{ "kind": "table", "title", "binding": { "queryId", "revision" }, "fields": [...] }`
   - `{ "kind": "metric", "title", "binding": {...}, "field", "unit", "operation": "sum" | "count" }`
   - `{ "kind": "chart", "title", "binding": {...}, "chart": { "type": "bar" | "line" | "area" | "pie", "labelField", "valueField", "unit" } }`
   - Scatter: `"chart": { "type": "scatter", "labelField", "xField", "xUnit", "valueField", "unit" }`
   - `{ "kind": "artifact" | "htmlReport", "title", "artifactId" }`. An `htmlReport` needs an HTML artifact with a report data timestamp. MCP cannot set it: a person sets it in the dashboard.
   - Live HTML report: an `htmlReport` with `"live": { "bindings": [{ "name", "queryId", "revision" }] }`. It needs no data timestamp, and saving it needs the `data.read` scope. Use 1 to 5 bindings. Each `name` is lowercase letters, digits and `_`, starts with a letter, and has at most 32 characters. The scripts of the report run in a sandbox with no network access. They read data only with `await window.dgrape.query("<name>")`, which returns `{ kind, fields: [{ id, label, type }], rows: [{ <fieldId>: value }], completeness, evaluatedAt, dataAsOf }`. A result has at most 200 rows and 256 KB. Secret reference fields are left out. A failed query rejects with an error that has a `code`: `invalid_request`, `unavailable`, `rate_limited` (a burst of 10, then 1 each second), `too_many_pending` (at most 4 at once) or `failed`. `window.dgrape.ready` resolves when the bridge is open, and `window.dgrape.bindings()` lists the names.
   - Optional `layout: { x, y, w, h }` on a 12-column grid. Panels must not overlap.
3. `pages_get` with the draft `revision`. Each `bindings` entry must be `null`.
4. Show the user the plan. Then `pages_publish` with `revision`, `expectedRevision`, and `expectedPublishedRevision` (`null` when never published). To roll back, publish an earlier revision.

Rules for bound fields: each field must be in the query result. Sum, chart values, and the scatter `xField` must be `number` or `integer`. Pie values must be 0 or more. For an aggregate query, bind the group field as the label and a measure as the value.

## After a migration

Pages keep their old query revisions. Save each query again, update the bindings to the new revision with `pages_save_draft`, check with `pages_get`, then publish.
