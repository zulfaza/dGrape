import type { CollectionField } from "./collectionDomain"
import type { Recipe } from "./recipeDomain"

/**
 * Where a template's records come from. `manual` records are written by people
 * or agents. A `github` source names a read of the GitHub read-only connector;
 * {@link githubTemplateRecipe} turns it into a recipe for one connection.
 */
export type TemplateSource =
  | { kind: "manual" }
  | {
      kind: "github"
      read: "recent_authored_pull_requests"
      /** The GitHub field that identifies a record across syncs. */
      identityField: "id"
    }
/** Stable field IDs let human and agent clients use the same templates. */
export type CollectionTemplate = {
  id: "applications" | "transactions" | "github_pull_requests"
  name: string
  description: string
  fields: CollectionField[]
  source: TemplateSource
}

/** Money has no implicit conversion or scale: amount is in currency minor units. */
export function collectionTemplates(): CollectionTemplate[] {
  return [
    {
      id: "applications",
      name: "Applications",
      description: "Track jobs by stage, source, and application date.",
      fields: [
        { id: "company", label: "Company", type: "text", indexed: true },
        { id: "role", label: "Role", type: "text" },
        { id: "stage", label: "Stage", type: "text", indexed: true },
        { id: "source", label: "Source", type: "text", indexed: true },
        { id: "date", label: "Application date", type: "date", indexed: true },
        { id: "url", label: "Job URL", type: "text", optional: true },
      ],
      source: { kind: "manual" },
    },
    {
      id: "transactions",
      name: "Transactions",
      description:
        "Store signed minor-unit amounts. Keep totals separate by currency.",
      fields: [
        { id: "date", label: "Date", type: "date", indexed: true },
        { id: "amount", label: "Amount (minor units)", type: "integer" },
        { id: "currency", label: "Currency", type: "currency", indexed: true },
        { id: "category", label: "Category", type: "text", indexed: true },
        {
          id: "description",
          label: "Description",
          type: "text",
          optional: true,
        },
      ],
      source: { kind: "manual" },
    },
    {
      id: "github_pull_requests",
      name: "GitHub pull requests",
      description:
        "Sync your 50 most recently updated authored pull requests from a GitHub connection. Dates are ISO 8601 UTC.",
      fields: [
        { id: "id", label: "GitHub ID", type: "integer", indexed: true },
        { id: "number", label: "Number", type: "integer" },
        { id: "title", label: "Title", type: "text" },
        { id: "state", label: "State", type: "text", indexed: true },
        { id: "draft", label: "Draft", type: "boolean", optional: true },
        { id: "html_url", label: "URL", type: "text" },
        { id: "repository_url", label: "Repository API URL", type: "text" },
        { id: "comments", label: "Comments", type: "integer", optional: true },
        { id: "created_at", label: "Created", type: "text", indexed: true },
        { id: "updated_at", label: "Updated", type: "text", indexed: true },
        { id: "closed_at", label: "Closed", type: "text", optional: true },
      ],
      source: {
        kind: "github",
        read: "recent_authored_pull_requests",
        identityField: "id",
      },
    },
  ]
}

/**
 * A recipe that fetches the template's GitHub read, keeps only its fields, and
 * upserts them by GitHub ID. The read is one page, so one fetch is complete.
 * Publish it with recipes.publish, then schedule it.
 */
export function githubTemplateRecipe(
  template: CollectionTemplate,
  ids: { connectionId: string; collectionId: string }
): Recipe {
  if (template.source.kind !== "github")
    throw new Error("This template has no GitHub source")
  return {
    steps: [
      {
        kind: "fetch",
        connectionId: ids.connectionId,
        route: template.source.read,
        maxPages: 1,
      },
      {
        kind: "map",
        fields: Object.fromEntries(
          template.fields.map((field) => [field.id, field.id])
        ),
      },
      {
        kind: "upsert",
        collectionId: ids.collectionId,
        source: "github",
        identityField: template.source.identityField,
      },
    ],
    limits: { rows: 50, bytes: 500_000, durationMs: 60_000, attempts: 3 },
  }
}
