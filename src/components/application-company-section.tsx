import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Building2, ExternalLink, Loader2, Pencil, Sparkles } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

type CompanyFormValues = {
  name: string;
  website: string;
  industry: string;
  hqLocation: string;
  size: string;
  summary: string;
};

function toFormValues(company: Doc<"companies">): CompanyFormValues {
  return {
    name: company.name,
    website: company.website,
    industry: displayValue(company.industry),
    hqLocation: displayValue(company.hqLocation),
    size: displayValue(company.size),
    summary: displayValue(company.summary),
  };
}

function displayValue(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "unknown" ? "" : value;
}

function formatDisplay(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLocaleLowerCase() !== "unknown" ? trimmed : "Unknown";
}

export function ApplicationCompanySection({ company }: { company: Doc<"companies"> | null }) {
  if (!company) {
    return (
      <section className="flex h-full flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Company</h2>
        </div>
        <p className="px-4 py-4 text-sm text-muted-foreground">No company linked.</p>
      </section>
    );
  }

  return <ApplicationCompanyPanel company={company} />;
}

function ApplicationCompanyPanel({ company }: { company: Doc<"companies"> }) {
  const updateCompany = useMutation(api.companies.update);
  const enrichCompany = useAction(api.companies.enrich);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CompanyFormValues>(() => toFormValues(company));
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const busy = submitting || enriching;
  const website = toExternalUrl(company.website);

  const handleEdit = useCallback(() => {
    setValues(toFormValues(company));
    setError(undefined);
    setEditing(true);
  }, [company]);
  const handleCancel = useCallback(() => {
    setEditing(false);
    setError(undefined);
  }, []);
  const handleEnrich = useCallback(async () => {
    setEnriching(true);
    setError(undefined);
    try {
      await enrichCompany({ companyId: company._id });
      setEditing(false);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setEnriching(false);
    }
  }, [company._id, enrichCompany]);
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      try {
        await updateCompany({
          companyId: company._id,
          name: values.name,
          website: values.website,
          industry: values.industry,
          hqLocation: values.hqLocation,
          size: values.size,
          summary: values.summary,
        });
        setEditing(false);
      } catch (cause) {
        setError(toErrorMessage(cause));
      } finally {
        setSubmitting(false);
      }
    },
    [company._id, updateCompany, values],
  );
  const updateField = useCallback(
    (field: keyof CompanyFormValues) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValues((current) => ({ ...current, [field]: event.target.value }));
      },
    [],
  );

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CompanyAvatar logo={company.logo} name={company.name} />
          <h2 className="truncate text-sm font-medium text-foreground">{company.name}</h2>
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={handleEdit} size="sm" type="button" variant="outline">
              <Pencil />
              Edit
            </Button>
            <Button
              disabled={busy}
              onClick={handleEnrich}
              size="sm"
              type="button"
              variant="outline"
            >
              {enriching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles />}
              {enriching ? "Enriching..." : "Enrich"}
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form className="grid flex-1 gap-4 p-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="company-name">Name</Label>
            <Input id="company-name" onChange={updateField("name")} required value={values.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-website">Website</Label>
            <Input
              id="company-website"
              onChange={updateField("website")}
              placeholder="https://company.com"
              type="url"
              value={values.website}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-industry">Industry</Label>
            <Input
              id="company-industry"
              onChange={updateField("industry")}
              value={values.industry}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-hq">Headquarters</Label>
            <Input id="company-hq" onChange={updateField("hqLocation")} value={values.hqLocation} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-size">Size</Label>
            <Input id="company-size" onChange={updateField("size")} value={values.size} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-summary">Summary</Label>
            <Textarea
              id="company-summary"
              onChange={updateField("summary")}
              value={values.summary}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={busy} size="sm" type="submit">
              {submitting ? "Saving..." : "Save"}
            </Button>
            <Button
              disabled={busy}
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <dl className="grid flex-1 gap-4 sm:grid-cols-2">
            <SummaryItem label="Industry">{formatDisplay(company.industry)}</SummaryItem>
            <SummaryItem label="Headquarters">{formatDisplay(company.hqLocation)}</SummaryItem>
            <SummaryItem label="Size">{formatDisplay(company.size)}</SummaryItem>
            {company.summary.trim() && company.summary.trim().toLocaleLowerCase() !== "unknown" ? (
              <SummaryItem className="sm:col-span-2" label="Summary">
                <p className="whitespace-pre-wrap leading-6">{company.summary}</p>
              </SummaryItem>
            ) : null}
          </dl>
          {website ? (
            <a
              className="mt-4 inline-flex items-center gap-1 text-sm"
              href={website}
              rel="noreferrer"
              target="_blank"
            >
              Website
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      )}

      {error ? <p className="px-4 pb-4 text-sm text-red-300">{error}</p> : null}
    </section>
  );
}

function CompanyAvatar({ logo, name }: { logo: string; name: string }) {
  if (logo) {
    return (
      <img
        alt=""
        className="size-7 shrink-0 rounded-md border border-border object-cover"
        decoding="async"
        loading="lazy"
        src={logo}
      />
    );
  }

  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
      <Building2 aria-hidden className="size-3.5" />
      <span className="sr-only">{name}</span>
    </div>
  );
}

function SummaryItem({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function toExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed";
}
