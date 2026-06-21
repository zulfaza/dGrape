import { v } from "convex/values";
import { z } from "zod";

export const applicationStatuses: ["Saved", "Applied", "Test", "Interview", "Offer", "Rejected"] = [
  "Saved",
  "Applied",
  "Test",
  "Interview",
  "Offer",
  "Rejected",
];

export const applicationStatusValidator = v.union(
  v.literal("Saved"),
  v.literal("Applied"),
  v.literal("Test"),
  v.literal("Interview"),
  v.literal("Offer"),
  v.literal("Rejected"),
);
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const parsedEmailSchema = z.object({
  id: z.string().min(1),
  threadId: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  date: z.string(),
  snippet: z.string(),
  body: z.string(),
  internalDate: z.number(),
});
export type ParsedEmail = z.infer<typeof parsedEmailSchema>;

export const extractedEventSchema = z.object({
  sourceEmailId: z.string().min(1),
  type: z.enum(applicationStatuses),
  date: z.iso.datetime(),
  note: z.string(),
});

export const extractedApplicationSchema = z.object({
  company: z.string().min(1),
  position: z.string().min(1),
  events: z.array(extractedEventSchema).min(1),
});
export type ExtractedApplication = z.infer<typeof extractedApplicationSchema>;

export const jobPostingDraftSchema = z.object({
  companyName: z.string(),
  companyWebsite: z.string(),
  position: z.string(),
  jobDescription: z.string(),
  status: z.enum(applicationStatuses),
  appliedOn: z.string(),
});
export type JobPostingDraft = z.infer<typeof jobPostingDraftSchema>;

export const socialsSchema = z.object({
  linkedin: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  youtube: z.string().optional(),
  github: z.string().optional(),
});

export const enrichedCompanySchema = z.object({
  name: z.string().min(1),
  summary: z.string(),
  industry: z.string(),
  hqLocation: z.string(),
  size: z.string(),
  logo: z.string(),
  banner: z.string(),
  brandColor: z.string(),
  website: z.string(),
  socials: socialsSchema,
});
export type EnrichedCompany = z.infer<typeof enrichedCompanySchema>;

export function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function buildGmailQuery(from: number, to: number): string {
  const format = (value: number) => {
    const date = new Date(value);
    return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  };
  const dayAfterTo = new Date(to);
  dayAfterTo.setUTCDate(dayAfterTo.getUTCDate() + 1);
  return `after:${format(from)} before:${format(dayAfterTo.getTime())}`;
}

export function mergeApplications(applications: ExtractedApplication[]): ExtractedApplication[] {
  const merged = new Map<string, ExtractedApplication>();
  for (const application of applications) {
    const key = `${normalize(application.company)}::${normalize(application.position)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, application);
      continue;
    }
    const eventKeys = new Set(
      existing.events.map(
        (event) => `${event.sourceEmailId}|${event.type}|${event.date}|${event.note}`,
      ),
    );
    for (const event of application.events) {
      const eventKey = `${event.sourceEmailId}|${event.type}|${event.date}|${event.note}`;
      if (!eventKeys.has(eventKey)) {
        existing.events.push(event);
        eventKeys.add(eventKey);
      }
    }
  }
  return [...merged.values()];
}

type GmailHeader = { name?: string | null; value?: string | null };
type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
};
export type GmailMessage = {
  id?: string | null;
  threadId?: string | null;
  internalDate?: string | null;
  snippet?: string | null;
  payload?: (GmailPart & { headers?: GmailHeader[] | null }) | null;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    Array.from(
      atob(normalized),
      (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    ).join(""),
  );
}

function findBody(part: GmailPart, mimeType: "text/plain" | "text/html"): string {
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const body = findBody(child, mimeType);
    if (body) return body;
  }
  return "";
}

export function parseGmailMessage(message: GmailMessage): ParsedEmail {
  const headers = new Map(
    (message.payload?.headers ?? []).flatMap((header) =>
      header.name ? [[header.name.toLocaleLowerCase(), header.value ?? ""]] : [],
    ),
  );
  return parsedEmailSchema.parse({
    id: message.id,
    threadId: message.threadId ?? "",
    from: headers.get("from") ?? "",
    to: headers.get("to") ?? "",
    subject: headers.get("subject") ?? "",
    date: headers.get("date") ?? "",
    snippet: message.snippet ?? "",
    body: message.payload
      ? findBody(message.payload, "text/plain") || findBody(message.payload, "text/html")
      : "",
    internalDate: Number(message.internalDate ?? 0),
  });
}

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
