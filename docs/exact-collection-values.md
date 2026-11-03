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
    { "id": "amount_minor", "label": "Amount (minor units)", "type": "integer", "indexed": true },
    { "id": "currency", "label": "Currency", "type": "currency", "indexed": true },
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
