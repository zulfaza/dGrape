import { type ChangeEvent, type FormEvent, useCallback, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { z } from "zod"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { format } from "date-fns"

import { api } from "../../../../convex/_generated/api"
import { ApplicationActivitySection } from "#/components/application-activity-section.tsx"
import { ApplicationAgentWorkspace } from "#/components/application-agent-workspace.tsx"
import { ApplicationCompanySection } from "#/components/application-company-section.tsx"
import { ApplicationDetailHeader } from "#/components/application-detail-header.tsx"
import { ApplicationStatusProgress } from "#/components/application-status-progress.tsx"
import { Button } from "#/components/ui/button.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs.tsx"
import {
  APPLICATION_STATUSES,
  STATUS_STYLES,
  toApplicationStatus,
  type ApplicationStatus,
} from "#/lib/applications.ts"

const searchSchema = z.object({
  tab: z.enum(["details", "chat"]).optional(),
  threadId: z.string().optional(),
})

export const Route = createFileRoute("/dashboard/applications/$applicationId")({
  validateSearch: searchSchema,
  component: ApplicationDetailPage,
})

type FormValues = {
  position: string
  status: ApplicationStatus
  appliedOn: string
  sourceUrl: string
  jobDescription: string
}

type Application = NonNullable<FunctionReturnType<typeof api.applications.get>>

function ApplicationDetailPage() {
  const { applicationId } = Route.useParams()
  const navigate = useNavigate()
  const routeNavigate = Route.useNavigate()
  const { tab = "details", threadId } = Route.useSearch()
  const {
    data: application,
    error: applicationError,
    isPending: applicationLoading,
  } = useQuery(convexQuery(api.applications.get, { applicationId }))
  const updateApplication = useMutation(api.applications.update)
  const removeApplication = useMutation(api.applications.remove)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<FormValues>()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const handleTabChange = useCallback(
    (value: string) => {
      const nextTab =
        value === "details" || value === "chat" ? value : "details"
      void routeNavigate({
        search: (prev) => ({ ...prev, tab: nextTab }),
      })
    },
    [routeNavigate]
  )

  const handleSelectThread = useCallback(
    (id: string | undefined) => {
      void routeNavigate({
        to: ".",
        search: (prev) => ({ ...prev, threadId: id }),
      })
    },
    [routeNavigate]
  )

  const handleEdit = useCallback(() => {
    if (!application) return
    setValues({
      position: application.position,
      status: application.status,
      appliedOn: application.appliedOn
        ? format(application.appliedOn, "yyyy-MM-dd")
        : "",
      sourceUrl: application.sourceUrl ?? "",
      jobDescription: application.jobDescription ?? "",
    })
    setError(undefined)
    setEditing(true)
    void routeNavigate({
      search: (prev) => ({ ...prev, tab: "details" }),
    })
  }, [application, routeNavigate])
  const handleCancel = useCallback(() => {
    setEditing(false)
    setError(undefined)
  }, [])
  const handlePositionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) =>
        current ? { ...current, position: event.target.value } : current
      )
    },
    []
  )
  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const status = toApplicationStatus(event.target.value)
      setValues((current) => (current ? { ...current, status } : current))
    },
    []
  )
  const handleAppliedOnChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) =>
        current ? { ...current, appliedOn: event.target.value } : current
      )
    },
    []
  )
  const handleSourceUrlChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) =>
        current ? { ...current, sourceUrl: event.target.value } : current
      )
    },
    []
  )
  const handleJobDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValues((current) =>
        current ? { ...current, jobDescription: event.target.value } : current
      )
    },
    []
  )
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!values) return
      setSubmitting(true)
      setError(undefined)
      try {
        await updateApplication({
          applicationId,
          position: values.position,
          status: values.status,
          ...(toOptionalTimestamp(values.appliedOn) === undefined
            ? {}
            : { appliedOn: toOptionalTimestamp(values.appliedOn) }),
          ...(values.sourceUrl.trim()
            ? { sourceUrl: values.sourceUrl.trim() }
            : {}),
          ...(values.jobDescription.trim()
            ? { jobDescription: values.jobDescription.trim() }
            : {}),
        })
        setEditing(false)
      } catch (cause) {
        setError(toErrorMessage(cause))
      } finally {
        setSubmitting(false)
      }
    },
    [applicationId, updateApplication, values]
  )
  const handleDelete = useCallback(async () => {
    if (
      !application ||
      !window.confirm(
        `Delete ${application.position} at ${application.company?.name ?? "Unknown"}?`
      )
    ) {
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      await removeApplication({ applicationId })
      await navigate({ to: "/dashboard/applications" })
    } catch (cause) {
      setError(toErrorMessage(cause))
      setSubmitting(false)
    }
  }, [application, applicationId, navigate, removeApplication])

  if (applicationLoading) {
    return <ApplicationDetailSkeleton />
  }
  if (applicationError) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <p className="text-sm text-red-300">{applicationError.message}</p>
        <Button asChild className="w-fit" variant="outline">
          <Link to="/dashboard/applications">Back to applications</Link>
        </Button>
      </main>
    )
  }
  if (application === null) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <Button asChild className="w-fit" variant="outline">
          <Link to="/dashboard/applications">Back to applications</Link>
        </Button>
      </main>
    )
  }

  const sourceUrl = toExternalUrl(application.sourceUrl)

  return (
    <main
      className={`flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6 ${
        tab === "chat" ? "min-h-0 overflow-hidden" : ""
      }`}
      style={tab === "chat" ? { height: "calc(100svh - 4rem)" } : undefined}
    >
      <Button asChild className="-mb-2 w-fit" size="sm" variant="ghost">
        <Link to="/dashboard/applications">
          <ArrowLeft />
          Applications
        </Link>
      </Button>

      <ApplicationDetailHeader
        company={application.company}
        disabled={submitting}
        onDelete={handleDelete}
        onEdit={handleEdit}
        position={application.position}
        status={application.status}
      />

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <Tabs
        className={tab === "chat" ? "min-h-0 min-w-0 flex-1" : "min-w-0"}
        onValueChange={handleTabChange}
        value={tab}
      >
        <TabsList aria-label="Application sections">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent className="flex flex-col gap-6" value="details">
          {editing && values ? (
            <section className="rounded-lg border border-border bg-card">
              <EditForm
                onAppliedOnChange={handleAppliedOnChange}
                onCancel={handleCancel}
                onJobDescriptionChange={handleJobDescriptionChange}
                onPositionChange={handlePositionChange}
                onSourceUrlChange={handleSourceUrlChange}
                onStatusChange={handleStatusChange}
                onSubmit={handleSubmit}
                submitting={submitting}
                values={values}
              />
            </section>
          ) : (
            <>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <ApplicationDetails
                  application={application}
                  sourceUrl={sourceUrl}
                />
                <ApplicationCompanySection company={application.company} />
              </div>

              <JobDescriptionSection
                jobDescription={application.jobDescription}
              />
            </>
          )}

          <ApplicationActivitySection
            applicationId={applicationId}
            events={application.events}
          />
        </TabsContent>

        <TabsContent
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          value="chat"
        >
          <ApplicationAgentWorkspace
            applicationId={applicationId}
            companyName={application.company?.name ?? "Unknown"}
            position={application.position}
            onSelectThread={handleSelectThread}
            selectedThreadId={threadId}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}

function ApplicationDetailSkeleton() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <Skeleton className="h-8 w-28" />

      <div className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-full max-w-md" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>

      <Skeleton className="h-48 w-full rounded-lg" />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </section>
    </main>
  )
}

function ApplicationDetails({
  application,
  sourceUrl,
}: {
  application: Application
  sourceUrl: string | undefined
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Details</h2>
      </div>
      <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <SummaryItem label="Status">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[application.status]}`}
          >
            {application.status}
          </span>
        </SummaryItem>
        <SummaryItem label="Applied on">
          {formatOptionalDate(application.appliedOn)}
        </SummaryItem>
        <SummaryItem label="Last update">
          {format(application.lastUpdate, "MMM d, yyyy")}
        </SummaryItem>
        <SummaryItem label="Job post">
          {sourceUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm"
              href={sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open link
              <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span className="text-muted-foreground">Not saved</span>
          )}
        </SummaryItem>
      </dl>
      <div className="py-4">
        <ApplicationStatusProgress status={application.status} />
      </div>
    </section>
  )
}

function JobDescriptionSection({
  jobDescription,
}: {
  jobDescription: string | undefined
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Job description</h2>
      </div>
      <div className="px-4 py-4">
        {jobDescription ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
            <p className="whitespace-pre-wrap leading-7">{jobDescription}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No job description saved.
          </p>
        )}
      </div>
    </section>
  )
}

function EditForm({
  onAppliedOnChange,
  onCancel,
  onJobDescriptionChange,
  onPositionChange,
  onSourceUrlChange,
  onStatusChange,
  onSubmit,
  submitting,
  values,
}: {
  onAppliedOnChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCancel: () => void
  onJobDescriptionChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onPositionChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSourceUrlChange: (event: ChangeEvent<HTMLInputElement>) => void
  onStatusChange: (event: ChangeEvent<HTMLSelectElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitting: boolean
  values: FormValues
}) {
  return (
    <form className="p-4" onSubmit={onSubmit}>
      <h2 className="text-sm font-medium text-foreground">Edit application</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="position">Position</Label>
          <Input
            id="position"
            onChange={onPositionChange}
            required
            value={values.position}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="source-url">Job URL</Label>
          <Input
            id="source-url"
            onChange={onSourceUrlChange}
            placeholder="https://company.com/jobs/frontend-engineer"
            type="url"
            value={values.sourceUrl}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="job-description">Job description</Label>
          <Textarea
            className="min-h-44"
            id="job-description"
            onChange={onJobDescriptionChange}
            value={values.jobDescription}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            id="status"
            onChange={onStatusChange}
            value={values.status}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="applied-on">Applied on</Label>
          <Input
            id="applied-on"
            onChange={onAppliedOnChange}
            type="date"
            value={values.appliedOn}
          />
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button disabled={submitting} type="submit">
          Save changes
        </Button>
        <Button
          disabled={submitting}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function SummaryItem({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function toOptionalTimestamp(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined
}

function formatOptionalDate(value: number | undefined): string {
  return value === undefined ? "Not set" : format(value, "MMM d, yyyy")
}

function toExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed"
}
