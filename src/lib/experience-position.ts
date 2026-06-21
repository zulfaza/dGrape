export type ExperiencePositionType =
  | "full_time"
  | "contract"
  | "freelance"
  | "part_time"
  | "internship";

export const EXPERIENCE_POSITION_TYPES: ExperiencePositionType[] = [
  "full_time",
  "contract",
  "freelance",
  "part_time",
  "internship",
];

export const EXPERIENCE_POSITION_OPTIONS: Record<ExperiencePositionType, string> = {
  full_time: "Full time",
  contract: "Contract",
  freelance: "Freelance",
  part_time: "Part time",
  internship: "Internship",
};

export function normalizeExperiencePosition(value: string): ExperiencePositionType | "" {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "fulltime" || normalized === "full_time") return "full_time";
  if (normalized === "parttime" || normalized === "part_time") return "part_time";
  const position = EXPERIENCE_POSITION_TYPES.find((type) => type === normalized);
  if (position) return position;
  return "";
}
