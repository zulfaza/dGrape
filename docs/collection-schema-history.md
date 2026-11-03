# Collection schema history

New human and agent collections preserve version 1 in `collectionSchemaVersions`.
Optional field additions append a new definition and update the active collection
in the same transaction. Stored versions have no update/delete API.

`collectionSchemas.renameField` requires membership and `expectedVersion`. It
changes only a label; IDs, record values, record revisions, and index projections
stay stable. A stale expected version fails without writing anything. Saved query
revisions remain pinned to their original result schema; the existing PR60
contract still requires explicitly saving a new query revision after a schema edit.

`collectionSchemas.get` returns an exact definition or null. For legacy
collections the current definition can be read before any edit. Their first edit
persists that baseline. Versions discarded before schema history was introduced
cannot be recovered. `history` lists persisted versions newest first with native
pagination and a maximum page size of 50.

Reusable transaction-local helpers live in `convex/lib/collectionSchemas.ts`.
Callers must authorize access. `publishCompatibleSchema` re-reads the active
version, validates field definitions and only accepts labels and optional
additions. Removing fields or changing types, requiredness, IDs, or indexes is
rejected; this helper must not be used to activate an incompatible migration.

Remaining implementation scope: migration plans/dry runs/backfill and guarded
activation; richer typed values and authorized record/artifact/secret references
(coordinate with secret/recipe siblings); exact minor-unit money and currency
metadata with job/transaction templates; materialized summaries and bounded,
retry-safe correction/deletion rebuilds with freshness/completeness/error state;
HTTP/MCP/human UI for these features, sources, and saved queries. This slice
exposes authenticated Convex APIs only. It neither accepts proposed ADRs nor
selects a vendor or deploys to shared dev/production.

Proof: 16 backend tests including history/rename, membership, optimistic conflicts,
legacy baselines, compatibility rejection, transactional rollback, and both
human/agent creation/addition. Isolated local backend at 127.0.0.1:3430 accepted
the functions; signed-in create/insert/rename/exact-history/stale-revision flow
passed against it. No shared dev writes or deployments were performed.
