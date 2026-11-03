import type { CollectionField } from "./collectionDomain"

/** Stable field IDs let human and agent clients use the same templates. */
export type CollectionTemplate = {
  id: "applications" | "transactions"
  name: string
  description: string
  fields: CollectionField[]
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
        {
          id: "date",
          label: "Application date (YYYY-MM-DD)",
          type: "text",
          indexed: true,
        },
        { id: "url", label: "Job URL", type: "text", optional: true },
      ],
    },
    {
      id: "transactions",
      name: "Transactions",
      description:
        "Store signed minor-unit amounts. Keep totals separate by currency. Use YYYY-MM-DD dates.",
      fields: [
        { id: "date", label: "Date (YYYY-MM-DD)", type: "text", indexed: true },
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
    },
  ]
}
