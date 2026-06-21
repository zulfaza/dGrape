import { AtSign, GitFork, Globe, Network, type LucideIcon } from "lucide-react";

export type ProfileLinkType = "website" | "github" | "linkedin" | "twitter";

export const PROFILE_LINK_TYPES: ProfileLinkType[] = ["website", "github", "linkedin", "twitter"];

export const PROFILE_LINK_OPTIONS: Record<ProfileLinkType, { name: string; Icon: LucideIcon }> = {
  website: { name: "Website", Icon: Globe },
  github: { name: "GitHub", Icon: GitFork },
  linkedin: { name: "LinkedIn", Icon: Network },
  twitter: { name: "Twitter", Icon: AtSign },
};

export function normalizeProfileLinkLabel(label: string): ProfileLinkType {
  const normalized = label.trim().toLowerCase();
  const linkType = PROFILE_LINK_TYPES.find((type) => type === normalized);
  if (linkType) return linkType;
  if (normalized.includes("github")) return "github";
  if (normalized.includes("linkedin")) return "linkedin";
  if (normalized.includes("twitter") || normalized === "x") return "twitter";
  return "website";
}

export function ProfileLinkOptionLabel({ type }: { type: ProfileLinkType }) {
  const { name, Icon } = PROFILE_LINK_OPTIONS[type];
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 shrink-0" />
      <span>{name}</span>
    </span>
  );
}
