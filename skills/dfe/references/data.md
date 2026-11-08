# Collections, records, schema changes, artifacts

## Create a collection

1. `collections_templates`: use a template (jobs, transactions, GitHub activity) when one fits. Pass its name and fields to `collections_create`.
2. Otherwise design the fields:
   - `id`: starts with a lowercase letter, then lowercase letters, numbers, underscores; at most 64 characters. It never changes. The `label` can change.
   - Types: `text`, `number`, `integer`, `boolean`, `currency`, `date`, `timestamp`, `select`, `multiSelect`, `recordReference`, `artifactReference`, `object`, `secretRef`.
   - `select` and `multiSelect` need `options` (1 to 100 texts). `recordReference` needs `collectionId`.
   - Set `indexed: true` on the fields you will filter or sort by (at most 5). `object` and `secretRef` cannot be indexed.
   - Set `optional: true` when a record can leave the field out.
3. `collections_create` with an `idempotencyKey`.

## Write records

- `records_create` with `values` keyed by field id. Use the source ID as `idempotencyKey`, so a retry returns `status: "existing"`, not a duplicate.
- For a large import, write in batches and keep a list of the keys you sent. When a call fails, retry it with the same key.
- `records_update` replaces **all** values. Read the record first, change the values, and send the full set with `expectedRevision`.
- `records_delete` fails when another record references it. It cannot be undone.

## Read records

- `records_list`: all records, oldest first.
- `records_query`: one indexed field. `where` is `{ eq }` or `{ lower?, upper? }` with bounds `{ value, inclusive? }`. Records with no value for the field are left out. On a `multiSelect` field, `where` must be `{ eq: option }`.
- For filters on more fields, or totals, use a saved query (see [pages.md](pages.md)).

## Change a schema

| Change                                                                          | Tool                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Add a field                                                                     | `collections_add_field` (always optional)         |
| Change a label                                                                  | `collections_rename_field` with `expectedVersion` |
| Change a type, make a field required, remove a field or options, change indexes | a migration                                       |

Migration steps:

1. `migrations_plan` with `expectedVersion` and the complete target `fields`. Keep the id of each field that stays. Give `defaults` for new required fields. MCP migrations cannot keep `object` or `secretRef` fields: a collection with one of these needs a person to change it in the dashboard.
2. `migrations_dry_run`, then call `migrations_get` until `state.kind` is `"checked"`.
3. When `misfitCount` is more than 0, fix the records in `misfits`, or plan again. Do the dry run again.
4. Read `rollbackLimitations`. Tell the user. Get approval.
5. `migrations_start`. The collection is locked until it ends. Call `migrations_get` until `state.kind` is `"active"`. After a `state.error`, call `migrations_start` again to resume.
6. Saved queries and pages keep the old schema version. Save new query revisions and bind the pages to them.

If `migrations_get` says `outdated: true`, the schema changed after the plan. Plan again.

## Artifacts

- Upload: `artifacts_create_upload` with a `name` (at most 25 MB). PUT the bytes to `uploadUrl` with a `Content-Type` header, for example `curl --upload-file report.pdf -H "Content-Type: application/pdf" "<uploadUrl>"`. Then `artifacts_complete_upload` with the `uploadId` within 15 minutes.
- Download: `artifacts_download_url` gives a URL for 5 minutes. It needs no token.
- Link to a record: `records_link_artifact` with `relation` `attachment`, `image`, or `report`. An HTML `report` needs a report data timestamp, which a person sets in the dashboard. At most 20 links for each record.
