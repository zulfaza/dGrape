import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { ApplicationCreateSheet } from "#/components/application-create-sheet.tsx";
import { ApplicationStatusFilter } from "#/components/application-status-filter.tsx";
import { ApplicationsTable } from "#/components/applications-table.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { DEFAULT_STATUS_FILTER, type ApplicationStatus } from "#/lib/applications.ts";

export const Route = createFileRoute("/dashboard/applications/")({
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const [selectedStatuses, setSelectedStatuses] = useState(
    () => new Set<ApplicationStatus>(DEFAULT_STATUS_FILTER),
  );
  const [query, setQuery] = useState("");
  const {
    data: applications,
    error: applicationsError,
    isPending: applicationsLoading,
  } = useQuery(convexQuery(api.applications.list));
  const applicationList = useMemo(() => applications ?? [], [applications]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredApplications = useMemo(
    () =>
      applicationList.filter((application) => {
        const matchesStatus = selectedStatuses.has(application.status);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          application.position.toLocaleLowerCase().includes(normalizedQuery) ||
          application.company.toLocaleLowerCase().includes(normalizedQuery);
        return matchesStatus && matchesQuery;
      }),
    [applicationList, normalizedQuery, selectedStatuses],
  );

  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track roles, parse job posts, and tailor CV drafts per application.
          </p>
        </div>
        <ApplicationCreateSheet />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Label className="relative block w-full max-w-sm" htmlFor="application-search">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            id="application-search"
            onChange={handleQueryChange}
            placeholder="Search position or company"
            type="search"
            value={query}
          />
        </Label>
        <ApplicationStatusFilter
          onSelectedStatusesChange={setSelectedStatuses}
          selectedStatuses={selectedStatuses}
        />
      </div>

      {applicationsError ? (
        <p className="text-sm text-red-300">{applicationsError.message}</p>
      ) : null}

      <ApplicationsTable
        applications={applicationList}
        loading={applicationsLoading}
        visibleApplications={filteredApplications}
      />
    </main>
  );
}
