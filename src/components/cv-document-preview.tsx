import { useLayoutEffect, useRef, useState } from "react"

type Profile = {
  name: string
  summary: string
  contacts: {
    email: string
    phone: string
  }
  links: Array<{
    label: string
    url: string
  }>
  skills?: string[]
  skillGroups?: Array<{
    label: string
    skills: string[]
  }>
  experience: Array<{
    id: string
    company: string
    companyDescription?: string
    location: string
    role: string
    position: string
    start: string
    end: string
    tasks: Array<{
      id: string
      text: string
    }>
  }>
  projects?: Array<{
    id: string
    title: string
    description: string
    link: string
  }>
  educations: Array<{
    id: string
    institution: string
    degree: string
    start: string
    end: string
    notes: string
  }>
}

const PAGE_GAP_PX = 16
const PAGE_WIDTH_MM = 210

export type CvTemplateId = "classic" | "compact"

type ContactLink = {
  label: string
  url: string
}

type ContactDetails = {
  classicParts: string[]
  compactParts: string[]
  links: ContactLink[]
}

export function CvDocumentPreview({
  profile,
  templateId,
}: {
  profile: Profile
  templateId: CvTemplateId
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const contactDetails = contactDetailsFromProfile(profile)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const updatePageCount = () => {
      const pageWidth = content.getBoundingClientRect().width
      if (pageWidth === 0) return

      const measuredPageCount = Math.max(
        1,
        Math.round(
          (content.scrollWidth + PAGE_GAP_PX) / (pageWidth + PAGE_GAP_PX)
        )
      )
      setPageCount(measuredPageCount)
    }

    updatePageCount()
    const observer = new ResizeObserver(updatePageCount)
    observer.observe(content)
    void document.fonts.ready.then(updatePageCount)

    return () => observer.disconnect()
  }, [profile, templateId])

  return (
    <div className="relative flex w-[210mm] flex-col gap-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-[297mm] w-[210mm] overflow-hidden opacity-0"
      >
        <CvContent
          contactDetails={contactDetails}
          profile={profile}
          ref={contentRef}
          templateId={templateId}
        />
      </div>
      {Array.from({ length: pageCount }, (_, pageIndex) => (
        <div
          aria-hidden={pageIndex > 0}
          className="h-[297mm] w-[210mm] overflow-hidden bg-white shadow-lg"
          data-cv-page=""
          key={pageIndex}
        >
          <div
            style={{
              transform: `translateX(calc(-${pageIndex * PAGE_WIDTH_MM}mm - ${
                pageIndex * PAGE_GAP_PX
              }px))`,
            }}
          >
            <CvContent
              contactDetails={contactDetails}
              profile={profile}
              templateId={templateId}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function CvContent({
  contactDetails,
  profile,
  ref,
  templateId,
}: {
  contactDetails: ContactDetails
  profile: Profile
  ref?: React.Ref<HTMLDivElement>
  templateId: CvTemplateId
}) {
  const projects = profile.projects ?? []

  if (templateId === "compact") {
    return (
      <CompactCvContent
        contactDetails={contactDetails}
        profile={profile}
        ref={ref}
      />
    )
  }

  return (
    <div
      className="h-[297mm] w-[210mm] p-[0.6in] text-black [column-fill:auto] [column-gap:calc(1.2in+16px)] [column-width:calc(210mm-1.2in)] [font-family:'Times_New_Roman',Times,serif]"
      ref={ref}
    >
      <header className="break-inside-avoid text-center">
        <h1 className="text-[22pt] font-normal normal-case tracking-normal">
          {profile.name}
        </h1>
        {contactDetails.classicParts.length > 0 ? (
          <p className="mt-1 text-[10pt] leading-relaxed">
            {contactDetails.classicParts.join(" | ")}
          </p>
        ) : null}
      </header>

      {profile.summary ? (
        <Section title="Summary">
          <p className="text-[10pt] leading-snug">
            <HighlightedText text={profile.summary} />
          </p>
        </Section>
      ) : null}

      {(profile.skillGroups && profile.skillGroups.length > 0) ||
      (profile.skills && profile.skills.length > 0) ? (
        <Section title="Skills">
          {profile.skillGroups && profile.skillGroups.length > 0 ? (
            <ul className="space-y-0.5">
              {profile.skillGroups.map((group) => (
                <li
                  className="flex break-inside-avoid gap-2 text-[10pt] leading-snug"
                  key={group.label}
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-black" />
                  <span>
                    <strong>{group.label}:</strong> {group.skills.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10pt] leading-snug">
              {profile.skills?.join(" • ")}
            </p>
          )}
        </Section>
      ) : null}

      {profile.experience.length > 0 ? (
        <Section title="Experience">
          <div className="space-y-3">
            {profile.experience.map((entry) => (
              <div
                className="break-inside-avoid"
                key={entry.id ?? entry.company}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10pt] font-bold">
                      {entry.company}
                    </span>
                    {entry.companyDescription ? (
                      <span className="text-[10pt]">
                        {" "}
                        / {entry.companyDescription}
                      </span>
                    ) : null}
                    {entry.role ? (
                      <p className="mt-0.5 text-[10pt]">{entry.role}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-[10pt]">
                    <p>{formatDateRange(entry.start, entry.end)}</p>
                    {entry.location || entry.position ? (
                      <p className="mt-0.5">
                        {entry.location}
                        {entry.location && entry.position ? ", " : ""}
                        {entry.position ? (
                          <span className="italic">
                            {formatPosition(entry.position)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {entry.tasks.map((task) => (
                    <li
                      className="flex break-inside-avoid gap-2 text-[10pt] leading-snug"
                      key={task.id ?? task.text}
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-black" />
                      <span>
                        <HighlightedText text={task.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {projects.length > 0 ? (
        <Section title="Projects">
          <div className="space-y-2">
            {projects.map((entry) => (
              <div className="break-inside-avoid" key={entry.id ?? entry.title}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10pt] font-bold">{entry.title}</span>
                  {entry.link ? (
                    <a
                      className="shrink-0 text-[10pt] text-blue-700 underline"
                      href={entry.link}
                    >
                      {entry.link}
                    </a>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10pt] leading-snug">
                  <HighlightedText text={entry.description} />
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {profile.educations.length > 0 ? (
        <Section title="Education">
          <div className="space-y-2">
            {profile.educations.map((entry) => (
              <div
                className="break-inside-avoid"
                key={entry.id ?? entry.institution}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[10pt] font-bold">
                    {entry.institution}
                  </span>
                  <span className="shrink-0 pl-4 text-[10pt]">
                    {formatDateRange(entry.start, entry.end)}
                  </span>
                </div>
                <p className="text-[10pt] italic">{entry.degree}</p>
                {entry.notes ? (
                  <p className="mt-0.5 text-[10pt] leading-snug">
                    {entry.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function CompactCvContent({
  contactDetails,
  profile,
  ref,
}: {
  contactDetails: ContactDetails
  profile: Profile
  ref?: React.Ref<HTMLDivElement>
}) {
  const projects = profile.projects ?? []

  return (
    <div
      className="h-[297mm] w-[210mm] p-[0.42in] text-black [column-fill:auto] [column-gap:calc(0.84in+16px)] [column-width:calc(210mm-0.84in)] [font-family:Arial,Helvetica,sans-serif]"
      ref={ref}
    >
      <header className="break-inside-avoid">
        <h1 className="text-[21pt] font-bold leading-none">{profile.name}</h1>
        {contactDetails.compactParts.length > 0 ? (
          <p className="mt-1 text-[10pt] leading-tight">
            {renderCompactContacts(contactDetails)}
          </p>
        ) : null}
      </header>

      {profile.summary ? (
        <CompactSection title="Summary">
          <p className="text-[10pt] leading-tight">
            <HighlightedText text={profile.summary} />
          </p>
        </CompactSection>
      ) : null}

      {profile.experience.length > 0 ? (
        <CompactSection title="Professional Experience">
          <div className="space-y-1">
            {profile.experience.map((entry) => (
              <div
                className="break-inside-avoid"
                key={entry.id ?? entry.company}
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0 flex-1 text-[10.5pt] leading-tight">
                    <span className="font-bold">{entry.company}</span>
                    {entry.companyDescription ? (
                      <span> / {entry.companyDescription}</span>
                    ) : null}
                  </div>
                  {entry.location || entry.position ? (
                    <p className="shrink-0 text-right text-[10pt] leading-tight">
                      {entry.location}
                      {entry.location && entry.position ? ", " : ""}
                      {entry.position ? formatPosition(entry.position) : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-baseline justify-between gap-5">
                  {entry.role ? (
                    <p className="text-[10pt] font-bold leading-tight">
                      {entry.role}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="shrink-0 text-right text-[10pt] leading-tight">
                    {formatDateRange(entry.start, entry.end)}
                  </p>
                </div>
                <ul className="mt-0.5">
                  {entry.tasks.map((task) => (
                    <li
                      className="flex break-inside-avoid gap-1.5 text-[9.7pt] leading-tight"
                      key={task.id ?? task.text}
                    >
                      <span className="leading-tight">•</span>
                      <span>
                        <HighlightedText text={task.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CompactSection>
      ) : null}

      {profile.educations.length > 0 ? (
        <CompactSection title="Education">
          <div className="space-y-0.5">
            {profile.educations.map((entry) => (
              <div
                className="break-inside-avoid"
                key={entry.id ?? entry.institution}
              >
                <div className="flex items-baseline justify-between gap-5">
                  <p className="text-[10.5pt] font-bold leading-tight">
                    {entry.institution}
                  </p>
                  <p className="shrink-0 text-right text-[10pt] leading-tight">
                    {formatDateRange(entry.start, entry.end)}
                  </p>
                </div>
                <p className="text-[10pt] leading-tight">{entry.degree}</p>
                {entry.notes ? (
                  <p className="text-[9.7pt] leading-tight">{entry.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </CompactSection>
      ) : null}

      {projects.length > 0 ? (
        <CompactSection title="Projects">
          <div className="space-y-0.5">
            {projects.map((entry) => (
              <div className="break-inside-avoid" key={entry.id ?? entry.title}>
                <div className="flex items-baseline justify-between gap-5">
                  <p className="text-[10.5pt] font-bold leading-tight">
                    {entry.title}
                  </p>
                  {entry.link ? (
                    <a
                      className="shrink-0 text-right text-[9.7pt] leading-tight text-blue-700 underline"
                      href={entry.link}
                    >
                      {entry.link}
                    </a>
                  ) : null}
                </div>
                <p className="text-[9.7pt] leading-tight">
                  <HighlightedText text={entry.description} />
                </p>
              </div>
            ))}
          </div>
        </CompactSection>
      ) : null}

      {(profile.skillGroups && profile.skillGroups.length > 0) ||
      (profile.skills && profile.skills.length > 0) ? (
        <CompactSection title="Skills">
          {profile.skillGroups && profile.skillGroups.length > 0 ? (
            <div className="space-y-0.5 text-[9.8pt] leading-tight">
              {profile.skillGroups.map((group) => (
                <p key={group.label}>
                  <strong>{group.label}:</strong> {group.skills.join(", ")}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[9.8pt] leading-tight">
              <strong>Skills:</strong> {profile.skills?.join(", ")}
            </p>
          )}
        </CompactSection>
      ) : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-3">
      <h2 className="break-after-avoid border-b border-black pb-0.5 text-[11pt] font-bold uppercase tracking-wide">
        {title}
      </h2>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

function CompactSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-3">
      <h2 className="break-after-avoid border-b border-black pb-0.5 text-[12pt] font-bold leading-tight">
        {title}
      </h2>
      <div className="mt-1">{children}</div>
    </section>
  )
}

function renderCompactContacts(contactDetails: ContactDetails) {
  const nodes: React.ReactNode[] = []
  for (const part of contactDetails.compactParts) {
    if (nodes.length > 0)
      nodes.push(<span key={`sep-${nodes.length}`}> | </span>)
    const link = contactDetails.links.find(
      (candidate) => candidate.label === part
    )
    nodes.push(
      link ? (
        <a className="text-blue-700 underline" href={link.url} key={part}>
          {part}
        </a>
      ) : (
        <span key={part}>{part}</span>
      )
    )
  }
  return nodes
}

function contactDetailsFromProfile(profile: Profile): ContactDetails {
  const classicParts: string[] = []
  const compactParts: string[] = []
  const links: ContactLink[] = []

  if (profile.contacts.email) {
    classicParts.push(profile.contacts.email)
    compactParts.push(profile.contacts.email)
  }
  if (profile.contacts.phone) {
    classicParts.push(profile.contacts.phone)
    compactParts.push(profile.contacts.phone)
  }
  for (const link of profile.links) {
    if (!link.url) continue
    const label = link.label || link.url
    classicParts.push(link.url)
    compactParts.push(label)
    links.push({ label, url: link.url })
  }

  return { classicParts, compactParts, links }
}

function formatPosition(value: string): string {
  if (!value) return ""
  return value.replace(/_/g, "-").replace(/\b\w/g, (c) => c.toUpperCase())
}

function HighlightedText({ text }: { text: string }) {
  return parseHighlightedText(text).map((segment) =>
    segment.highlighted ? (
      <strong key={segment.start}>{segment.text}</strong>
    ) : (
      <span key={segment.start}>{segment.text}</span>
    )
  )
}

function parseHighlightedText(text: string) {
  const segments: Array<{ highlighted: boolean; start: number; text: string }> =
    []
  let cursor = 0

  while (cursor < text.length) {
    const opening = text.indexOf("**", cursor)
    if (opening === -1) {
      segments.push({
        highlighted: false,
        start: cursor,
        text: text.slice(cursor),
      })
      break
    }
    if (opening > cursor) {
      segments.push({
        highlighted: false,
        start: cursor,
        text: text.slice(cursor, opening),
      })
    }

    const closing = text.indexOf("**", opening + 2)
    if (closing === -1) {
      segments.push({
        highlighted: false,
        start: opening,
        text: text.slice(opening),
      })
      break
    }

    segments.push({
      highlighted: true,
      start: opening,
      text: text.slice(opening + 2, closing),
    })
    cursor = closing + 2
  }

  return segments
}

function formatDateRange(start: string, end: string): string {
  const s = formatMonth(start)
  const e = end ? formatMonth(end) : "Present"
  if (!s && !e) return ""
  if (!s) return e
  if (!e) return s
  return `${s} - ${e}`
}

function formatMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  if (!match) return value

  const month = Number(match[2])
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  return `${monthNames[month - 1]} ${match[1]}`
}
