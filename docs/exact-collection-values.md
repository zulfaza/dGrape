# Exact collection values

All collection writers use the same field validation, including human forms,
agent HTTP/MCP writes, source upserts, and snapshot chunks. Two additional scalar
field kinds support exact transaction data:

- `integer`: a JSON number in the inclusive range -9007199254740991 to
  9007199254740991, without a fractional part. Use it for amounts already expressed
  in the currency's minor units. Negative values can represent refunds or debits.
- `currency`: a string of exactly three uppercase ASCII letters, such as `USD`,
  `IDR`, or `JPY`. This validates shape, not membership in a currency registry.

For example, create a collection through `collections_create` (MCP),
`POST /agent/collections` (HTTP), or the human create-collection form using:

```json
{
  "name": "Transactions",
  "fields": [
    {
      "id": "amount_minor",
      "label": "Amount (minor units)",
      "type": "integer",
      "indexed": true
    },
    {
      "id": "currency",
      "label": "Currency",
      "type": "currency",
      "indexed": true
    },
    { "id": "category", "label": "Category", "type": "text", "indexed": true }
  ]
}
```

A record `{ "amount_minor": -125, "currency": "USD", "category": "Refund" }`
represents -1.25 USD. The platform does not convert decimal amounts or infer a
currency's exponent. Ingestion must convert decimal source values exactly before
writing. Do not multiply a floating point value and round it implicitly.

Indexed equality and range bounds enforce the same field constraints as writes.
The UI presents integer inputs with a step of one. Wire values, projections,
snapshot values, and CSV export retain their existing scalar representations.
Existing `number` fields remain general finite numbers.

Totals must group by currency, and addition must check safe integer overflow at
each step. These field kinds do not implement aggregation or currency conversion.
Collection templates and materialized reports are separate follow-up work.

## Dates and times

Two field kinds keep dates exact and sortable:

- `timestamp`: a safe integer of milliseconds since 1970-01-01T00:00:00Z, in
  the range of a JavaScript `Date`. The UI shows and edits it in local time.
  CSV export writes it as ISO 8601 text in UTC; JSON export keeps the number.
- `date`: a calendar date with no time zone, written as `YYYY-MM-DD`. The value
  must be a real date, so `2026-02-30` is not valid.

Both kinds can be indexed. Index ranges sort them in time order.

## Select and multi-select

A `select` or `multiSelect` field has `options`: 1 to 100 different texts of 1
to 100 characters each. The server trims each option.

- `select`: a value is one of the options.
- `multiSelect`: a value is an array of different options, such as
  `["remote", "senior"]`. An empty array is valid.

An indexed multi-select field keeps one index entry for each chosen option. A
query on it must use `{ eq: option }`, and returns the records that chose that
option. A schema change may add options, but cannot remove them. CSV export
writes a multi-select value as a JSON array.

## References

- `recordReference`: the field has `collectionId`, a collection in the same
  workspace. A value is the ID of a record in that collection.
- `artifactReference`: a value is the ID of an artifact in the same workspace.

Every write checks that the target exists in the correct collection or
workspace. The `recordReferences` and `artifactReferences` tables keep one row
for each reference value. A record or artifact that another record references
cannot be deleted: the human API returns `"referenced"`, and the agent API
returns HTTP 409 with the referencing record ID. A record that references only
itself can be deleted. Snapshot rows are checked when they are staged, but they
do not keep their targets from deletion. Both kinds can be indexed, so an
equal query finds the records that reference one target.

## Objects

An `object` field keeps a JSON object, such as
`{ "address": { "city": "Jakarta", "lines": ["Jl. Sudirman 1"] } }`. These
limits apply:

- Objects and arrays nest at most 4 levels deep, the top object included.
- The value is at most 10000 characters as JSON, and counts toward the text
  limit of the record.
- Each key has 1 to 100 printable ASCII characters, and does not start with
  `$` or `_`.
- Leaves are text, finite numbers, `true`, `false`, or `null`.

An object field cannot be indexed, so a query cannot filter or sort by it.
CSV export writes the value as JSON.

## Secret references

A `secretRef` field keeps the ID of a secret in the `secretRefs` table, never
the secret. Every write checks that the secret is in the same workspace, is
owned by the workspace (not a private secret), and is not being deleted.

- A secret reference field cannot be indexed, so a query cannot filter, sort,
  or group by it.
- Page tables and charts cannot use it, and a recipe upsert cannot use it as
  the source identity.
- CSV export writes an empty cell, and JSON export leaves the value out.
- The record table shows "Secret reference", not the ID.

The ID alone does not give permission to use the secret. A connection still
needs its own grant.

## Pasted credentials

Every record write and import rejects a value that looks like a common
credential: a private key block, or an AWS, GitHub, Slack, Stripe, Google, or
`sk-` API key, or a JSON web token. The check looks in text, options, and
object keys and values. The error names the field and the kind of credential,
never the value.

This check is best effort. It finds only these known shapes. It does not find
other secrets in text, files, or API payloads, and it does not clean records
that exist already. If a credential was saved or sent to a model, remove it
and rotate it with its provider. Keep credentials as secrets, and refer to
them with a `secretRef` field.
