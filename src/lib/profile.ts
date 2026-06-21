import {
  normalizeExperiencePosition,
  type ExperiencePositionType,
} from "#/lib/experience-position.ts";
import {
  normalizeProfileLinkLabel,
  PROFILE_LINK_TYPES,
  type ProfileLinkType,
} from "#/lib/profile-links.tsx";

export type { ExperiencePositionType };

export type ExperienceTask = {
  id: string;
  text: string;
};

export type ExperienceEntry = {
  id: string;
  company: string;
  companyDescription: string;
  location: string;
  role: string;
  position: ExperiencePositionType | "";
  start: string;
  end: string;
  tasks: ExperienceTask[];
};

export type EducationEntry = {
  id: string;
  institution: string;
  degree: string;
  start: string;
  end: string;
  notes: string;
};

export type ProjectEntry = {
  id: string;
  title: string;
  description: string;
  link: string;
};

export type { ProfileLinkType };
export { PROFILE_LINK_TYPES };

export type ProfileLinkEntry = {
  id: string;
  label: ProfileLinkType;
  url: string;
};

export type UserProfile = {
  name: string;
  summary: string;
  contacts: {
    email: string;
    phone: string;
  };
  links: ProfileLinkEntry[];
  skills: string[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  educations: EducationEntry[];
};

export type ImportedProfile = {
  name: string;
  summary: string;
  contacts: {
    email: string;
    phone: string;
  };
  links: Array<{
    label: string;
    url: string;
  }>;
  skills: string[];
  experience: Array<{
    company: string;
    companyDescription?: string;
    location: string;
    role: string;
    position: string;
    start: string;
    end: string;
    tasks: Array<{ text: string }>;
  }>;
  projects?: Array<{
    title: string;
    description: string;
    link?: string;
  }>;
  educations: Array<{
    institution: string;
    degree: string;
    start: string;
    end: string;
    notes: string;
  }>;
};

export function profileFromImported(imported: ImportedProfile): UserProfile {
  return {
    name: imported.name,
    summary: imported.summary,
    contacts: imported.contacts,
    links: linksFromImported(imported.links),
    skills: imported.skills ?? [],
    experience: imported.experience.map((entry) => ({
      id: crypto.randomUUID(),
      company: entry.company,
      companyDescription: entry.companyDescription ?? "",
      location: entry.location,
      role: entry.role,
      position: normalizeExperiencePosition(entry.position),
      start: entry.start,
      end: entry.end,
      tasks: entry.tasks.map((task) => ({
        id: crypto.randomUUID(),
        text: task.text,
      })),
    })),
    projects: (imported.projects ?? []).map((entry) => ({
      id: crypto.randomUUID(),
      title: entry.title,
      description: entry.description,
      link: entry.link ?? "",
    })),
    educations: imported.educations.map((entry) => ({
      id: crypto.randomUUID(),
      institution: entry.institution,
      degree: entry.degree,
      start: entry.start,
      end: entry.end,
      notes: entry.notes,
    })),
  };
}

export function emptyProfile(): UserProfile {
  return {
    name: "",
    summary: "",
    contacts: {
      email: "",
      phone: "",
    },
    links: [],
    skills: [],
    experience: [],
    projects: [],
    educations: [],
  };
}

export const DUMMY_PROFILE: UserProfile = {
  name: "Alex Rivera",
  summary:
    "Product-minded engineer with 6+ years building web applications. Focused on clear UX, reliable delivery, and cross-functional collaboration.",
  contacts: {
    email: "alex.rivera@example.com",
    phone: "+1 (415) 555-0142",
  },
  links: [
    {
      id: "link-website",
      label: "website",
      url: "https://alexrivera.dev",
    },
    {
      id: "link-github",
      label: "github",
      url: "https://github.com/alexrivera",
    },
    {
      id: "link-linkedin",
      label: "linkedin",
      url: "https://linkedin.com/in/alexrivera",
    },
    {
      id: "link-twitter",
      label: "twitter",
      url: "https://twitter.com/alexrivera",
    },
  ],
  skills: [
    "TypeScript",
    "React",
    "Node.js",
    "GraphQL",
    "PostgreSQL",
    "Design Systems",
    "Product Strategy",
  ],
  experience: [
    {
      id: "exp-linear",
      company: "Linear",
      companyDescription: "Issue tracking and project management tool for software teams.",
      location: "San Francisco, CA",
      role: "Senior Product Engineer",
      position: "full_time",
      start: "2022-03",
      end: "",
      tasks: [
        {
          id: "exp-linear-task-1",
          text: "Led redesign of onboarding flows, improving activation by 18%.",
        },
        {
          id: "exp-linear-task-2",
          text: "Built design-system primitives used across three product surfaces.",
        },
        {
          id: "exp-linear-task-3",
          text: "Partnered with PM and design on quarterly roadmap planning.",
        },
      ],
    },
    {
      id: "exp-stripe",
      company: "Stripe",
      companyDescription: "Payments infrastructure for the internet.",
      location: "San Francisco, CA",
      role: "Frontend Engineer",
      position: "full_time",
      start: "2019-06",
      end: "2022-02",
      tasks: [
        {
          id: "exp-stripe-task-1",
          text: "Shipped dashboard features for merchant risk review tooling.",
        },
        {
          id: "exp-stripe-task-2",
          text: "Improved table performance for large datasets with virtualized rows.",
        },
      ],
    },
  ],
  projects: [
    {
      id: "project-portfolio",
      title: "Portfolio automation",
      description:
        "Built a content pipeline that turns case-study notes into polished portfolio pages.",
      link: "https://alexrivera.dev/projects/portfolio-automation",
    },
  ],
  educations: [
    {
      id: "edu-berkeley",
      institution: "UC Berkeley",
      degree: "B.S. Computer Science",
      start: "2015-08",
      end: "2019-05",
      notes: "Dean's List. Relevant coursework: algorithms, distributed systems, HCI.",
    },
    {
      id: "edu-bootcamp",
      institution: "Design Forward Bootcamp",
      degree: "Certificate, Product Design",
      start: "2020-01",
      end: "2020-04",
      notes: "Capstone project: redesigned a mobile checkout flow for a fintech startup.",
    },
  ],
};

export function createExperienceEntry(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    companyDescription: "",
    location: "",
    role: "",
    position: "",
    start: "",
    end: "",
    tasks: [{ id: crypto.randomUUID(), text: "" }],
  };
}

function linksFromImported(links: ImportedProfile["links"]): ProfileLinkEntry[] {
  const seen = new Set<ProfileLinkType>();
  const entries: ProfileLinkEntry[] = [];

  for (const link of links) {
    const label = normalizeProfileLinkLabel(link.label);
    if (seen.has(label)) continue;
    seen.add(label);
    entries.push({
      id: crypto.randomUUID(),
      label,
      url: link.url,
    });
  }

  return entries;
}

export function createLinkEntry(usedLabels: ProfileLinkType[] = []): ProfileLinkEntry {
  const label = PROFILE_LINK_TYPES.find((type) => !usedLabels.includes(type)) ?? "website";
  return {
    id: crypto.randomUUID(),
    label,
    url: "",
  };
}

export function createProjectEntry(): ProjectEntry {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    link: "",
  };
}

export function createEducationEntry(): EducationEntry {
  return {
    id: crypto.randomUUID(),
    institution: "",
    degree: "",
    start: "",
    end: "",
    notes: "",
  };
}
