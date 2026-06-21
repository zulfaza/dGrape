import { describe, expect, it } from "vitest";

import { profileFromImported, type ImportedProfile } from "./profile";

describe("profileFromImported", () => {
  it("normalizes imported CV links and experience positions", () => {
    const imported: ImportedProfile = {
      name: "Alex",
      summary: "Engineer",
      contacts: { email: "alex@example.com", phone: "" },
      links: [
        { label: "LinkedIn profile", url: "https://linkedin.com/in/alex" },
        { label: "linkedin", url: "https://duplicate.example.com" },
        { label: "GitHub", url: "https://github.com/alex" },
      ],
      skills: ["TypeScript"],
      experience: [
        {
          company: "Acme",
          location: "Remote",
          role: "Engineer",
          position: "Full Time",
          start: "2024-01",
          end: "",
          tasks: [{ text: "Built product features." }],
        },
      ],
      educations: [],
    };

    const profile = profileFromImported(imported);

    expect(profile.links.map((link) => link.label)).toEqual(["linkedin", "github"]);
    expect(profile.experience[0]?.position).toBe("full_time");
    expect(profile.experience[0]?.tasks[0]?.text).toBe("Built product features.");
  });
});
