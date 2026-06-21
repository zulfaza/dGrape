export type ApplicationStatus = "Saved" | "Applied" | "Test" | "Interview" | "Offer" | "Rejected";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Saved",
  "Applied",
  "Test",
  "Interview",
  "Offer",
  "Rejected",
];

export const DEFAULT_STATUS_FILTER: ApplicationStatus[] = ["Saved", "Applied", "Interview"];

export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  Saved: "border-sky-700/80 bg-sky-950/60 text-sky-200",
  Applied: "border-zinc-600 bg-zinc-800 text-zinc-200",
  Test: "border-violet-700/80 bg-violet-950/60 text-violet-200",
  Interview: "border-amber-700/80 bg-amber-950/60 text-amber-200",
  Offer: "border-emerald-700/80 bg-emerald-950/60 text-emerald-200",
  Rejected: "border-red-800/80 bg-red-950/60 text-red-200",
};

export function toApplicationStatus(value: string): ApplicationStatus {
  return APPLICATION_STATUSES.find((status) => status === value) ?? "Applied";
}
