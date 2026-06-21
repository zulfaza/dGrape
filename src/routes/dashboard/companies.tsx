import { type ChangeEvent, useCallback, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { Search } from "lucide-react"

import { api } from "../../../convex/_generated/api"
import {
  CompanyCard,
  type CompanyCardData,
} from "#/components/company-card.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"

export const Route = createFileRoute("/dashboard/companies")({
  component: CompaniesPage,
})

type Company = CompanyCardData & { industry: string }

function CompaniesPage() {
  const [query, setQuery] = useState("")
  const companies = useQuery(api.companies.list)
  const companyList = useMemo((): Company[] => companies ?? [], [companies])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredCompanies = useMemo(
    () =>
      companyList.filter((company) => {
        if (normalizedQuery.length === 0) return true
        return (
          company.name.toLocaleLowerCase().includes(normalizedQuery) ||
          company.hqLocation.toLocaleLowerCase().includes(normalizedQuery) ||
          company.industry.toLocaleLowerCase().includes(normalizedQuery)
        )
      }),
    [companyList, normalizedQuery]
  )

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
    },
    []
  )

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Companies
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Companies linked to your job applications.
        </p>
      </div>

      <Label
        className="relative block w-full max-w-sm"
        htmlFor="company-search"
      >
        <span className="sr-only">Search companies</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          id="company-search"
          onChange={handleQueryChange}
          placeholder="Search company, location, or industry"
          type="search"
          value={query}
        />
      </Label>

      {companies === undefined ? (
        <CompanyGridSkeleton />
      ) : filteredCompanies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {companyList.length === 0
            ? "No companies yet. Add an application to create a company profile."
            : "No companies match your search."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((company) => (
            <li key={company.id}>
              <CompanyCard companies={companyList} company={company} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function CompanyGridSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index}>
          <Skeleton className="h-40 w-full rounded-lg" />
        </li>
      ))}
    </ul>
  )
}
