import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useMutation, useQuery } from "convex/react"
import { Ellipsis, FileUp, Loader2, Plus, Trash2, X } from "lucide-react"

import { api } from "../../convex/_generated/api"
import { CvImportDialog, useCvImport } from "#/components/cv-import.tsx"
import { MonthPickerField } from "#/components/month-picker-field.tsx"
import { ProjectSortableList } from "#/components/project-sortable-list.tsx"
import { Button, buttonVariants } from "#/components/ui/button.tsx"
import { MultiCombobox } from "#/components/ui/combobox.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { useSidebar } from "#/components/ui/sidebar.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { ExperienceSortableList } from "#/components/experience-sortable-list.tsx"
import {
  normalizeProfileLinkLabel,
  PROFILE_LINK_TYPES,
  ProfileLinkOptionLabel,
} from "#/lib/profile-links.tsx"
import {
  createEducationEntry,
  createLinkEntry,
  emptyProfile,
  type EducationEntry,
  type ProfileLinkEntry,
  type ProfileLinkType,
  type UserProfile,
} from "#/lib/profile.ts"
import { parseMonthValue } from "#/lib/month.ts"
import { cn } from "#/lib/utils.ts"

const inputClassName = "bg-background"

const SKILL_SUGGESTIONS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Java",
  "Go",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "GraphQL",
  "REST APIs",
  "AWS",
  "Docker",
  "Kubernetes",
  "CI/CD",
  "Git",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Testing",
  "Agile",
  "Product Management",
  "Design Systems",
  "Figma",
  "Leadership",
  "Communication",
]

export function ProfileForm() {
  const { isMobile, state: sidebarState } = useSidebar()
  const savedProfile = useQuery(api.profile.get)
  const saveProfile = useMutation(api.profile.save)
  const initializedRef = useRef(false)
  const [profile, setProfile] = useState<UserProfile>(emptyProfile)
  const [baselineProfile, setBaselineProfile] =
    useState<UserProfile>(emptyProfile)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [cvImportOpen, setCvImportOpen] = useState(false)
  const {
    clearMessages: clearCvImportMessages,
    error: cvImportError,
    importFile: importCvFile,
    importing: cvImporting,
    status: cvImportStatus,
  } = useCvImport(setProfile)

  useEffect(() => {
    if (savedProfile === undefined || initializedRef.current) return
    initializedRef.current = true
    const initial = savedProfile ?? emptyProfile()
    setProfile(initial)
    setBaselineProfile(structuredClone(initial))
    setLoaded(true)
  }, [savedProfile])

  const isDirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(baselineProfile),
    [profile, baselineProfile]
  )

  const handleSave = useCallback(async () => {
    const incompleteProject = profile.projects.some((entry) => {
      const hasTitle = entry.title.trim() !== ""
      const hasDescription = entry.description.trim() !== ""
      return hasTitle !== hasDescription
    })
    if (incompleteProject) {
      setSaveError("Each project needs both a title and a description.")
      return
    }
    setSaving(true)
    setSaveError(undefined)
    try {
      await saveProfile({ profile })
      setBaselineProfile(structuredClone(profile))
      clearCvImportMessages()
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Failed to save profile"
      )
    } finally {
      setSaving(false)
    }
  }, [clearCvImportMessages, profile, saveProfile])

  const handleDiscard = useCallback(() => {
    setProfile(structuredClone(baselineProfile))
    setSaveError(undefined)
    clearCvImportMessages()
  }, [baselineProfile, clearCvImportMessages])

  if (!loaded) {
    return <ProfileFormSkeleton />
  }

  return (
    <div className={cn("flex flex-col gap-8", isDirty && "pb-20")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your resume details for applications and cover letters.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More actions"
                size="icon"
                type="button"
                variant="outline"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "w-full cursor-default justify-start px-2 font-normal"
                )}
                disabled={cvImporting}
                onClick={() => setCvImportOpen(true)}
              >
                {cvImporting ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <FileUp aria-hidden />
                )}
                Import from CV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {cvImportError && !cvImportOpen ? (
            <p className="text-sm text-red-300">{cvImportError}</p>
          ) : null}
          {cvImportStatus && !isDirty && !cvImportOpen ? (
            <p className="text-sm text-muted-foreground">{cvImportStatus}</p>
          ) : null}
          <CvImportDialog
            error={cvImportError}
            importing={cvImporting}
            onImport={importCvFile}
            onOpenChange={(open) => {
              setCvImportOpen(open)
              if (!open) clearCvImportMessages()
            }}
            open={cvImportOpen}
            status={cvImportStatus}
          />
        </div>
      </div>

      <form
        className="flex flex-col gap-8"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          void handleSave()
        }}
      >
        <ProfileSection
          title="Basics"
          description="How you introduce yourself."
        >
          <div className="grid gap-4">
            <Field label="Name" htmlFor="profile-name">
              <Input
                className={inputClassName}
                id="profile-name"
                onChange={updateProfileField(setProfile, "name")}
                placeholder="e.g. Alex Rivera"
                value={profile.name}
              />
            </Field>
            <Field label="Summary" htmlFor="profile-summary">
              <Textarea
                className={inputClassName}
                id="profile-summary"
                onChange={updateProfileField(setProfile, "summary")}
                placeholder="Briefly describe your experience, strengths, and target roles"
                rows={4}
                value={profile.summary}
              />
            </Field>
          </div>
        </ProfileSection>

        <ProfileSection
          title="Contacts"
          description="How recruiters can reach you."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="profile-email">
              <Input
                autoComplete="email"
                className={inputClassName}
                id="profile-email"
                onChange={updateContactsField(setProfile, "email")}
                placeholder="alex@example.com"
                type="email"
                value={profile.contacts.email}
              />
            </Field>
            <Field label="Phone" htmlFor="profile-phone">
              <Input
                autoComplete="tel"
                className={inputClassName}
                id="profile-phone"
                onChange={updateContactsField(setProfile, "phone")}
                placeholder="+1 (415) 555-0142"
                type="tel"
                value={profile.contacts.phone}
              />
            </Field>
          </div>
        </ProfileSection>

        <ProfileSection title="Links" description="Your online presence.">
          <div className="flex flex-col gap-3">
            {profile.links.map((entry, index) => (
              <LinkRow
                entry={entry}
                index={index}
                key={entry.id}
                onChange={setProfile}
                onRemove={() => removeLink(setProfile, entry.id)}
                usedLabels={profile.links
                  .filter((link) => link.id !== entry.id)
                  .map((link) => link.label)}
              />
            ))}
            <Button
              className="w-full"
              disabled={profile.links.length >= PROFILE_LINK_TYPES.length}
              onClick={() => addLink(setProfile)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              Add link
            </Button>
          </div>
        </ProfileSection>

        <ProfileSection
          title="Skills"
          description="Add skills to maximize ATS keyword matches. Type to add your own."
        >
          <MultiCombobox
            onChange={(skills) =>
              setProfile((current) => ({ ...current, skills }))
            }
            options={SKILL_SUGGESTIONS}
            placeholder="Add skills…"
            value={profile.skills ?? []}
          />
        </ProfileSection>

        <ProfileSection
          title="Experience"
          description="Drag roles to reorder. Add dates and highlights for each position."
        >
          <ExperienceSortableList
            experience={profile.experience}
            setProfile={setProfile}
          />
        </ProfileSection>

        <ProfileSection
          title="Projects"
          description="Drag projects to reorder. Add selected work for CV tailoring."
        >
          <ProjectSortableList
            projects={profile.projects}
            setProfile={setProfile}
          />
        </ProfileSection>

        <ProfileSection title="Education" description="Degrees and programs.">
          <div className="flex flex-col gap-4">
            {profile.educations.map((entry, index) => (
              <EducationCard
                entry={entry}
                index={index}
                key={entry.id}
                onChange={setProfile}
                onRemove={() => removeEducation(setProfile, entry.id)}
              />
            ))}
            <Button
              className="w-fit"
              onClick={() => addEducation(setProfile)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              Add education
            </Button>
          </div>
        </ProfileSection>
      </form>

      {isDirty ? (
        <div
          className={cn(
            "fixed right-0 bottom-10 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 shadow-sm",
            isMobile || sidebarState === "collapsed"
              ? "left-0"
              : "left-(--sidebar-width)"
          )}
        >
          {cvImportStatus ? (
            <p className="text-sm text-muted-foreground">{cvImportStatus}</p>
          ) : null}
          {saveError ? (
            <p className="text-sm text-red-300">{saveError}</p>
          ) : null}
          <Button
            disabled={saving}
            onClick={handleDiscard}
            type="button"
            variant="outline"
          >
            Discard changes
          </Button>
          <Button
            disabled={saving}
            onClick={() => void handleSave()}
            type="button"
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save profile
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ProfileFormSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="size-9" />
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton className="h-48 w-full rounded-lg" key={index} />
      ))}
    </div>
  )
}

function ProfileSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-4 md:px-6">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="px-4 py-4 md:px-6">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function LinkRow({
  entry,
  index,
  onChange,
  onRemove,
  usedLabels,
}: {
  entry: ProfileLinkEntry
  index: number
  onChange: React.Dispatch<React.SetStateAction<UserProfile>>
  onRemove: () => void
  usedLabels: ProfileLinkType[]
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        onValueChange={(value) =>
          updateLink(
            onChange,
            entry.id,
            "label",
            normalizeProfileLinkLabel(value)
          )
        }
        value={entry.label}
      >
        <SelectTrigger
          aria-label={`Link ${index + 1} type`}
          className={`${inputClassName} w-40 shrink-0`}
          size="default"
        >
          <SelectValue>
            <ProfileLinkOptionLabel type={entry.label} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PROFILE_LINK_TYPES.map((type) => (
            <SelectItem
              disabled={usedLabels.includes(type)}
              key={type}
              value={type}
            >
              <ProfileLinkOptionLabel type={type} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={`Link ${index + 1} URL`}
        autoComplete="url"
        className={`${inputClassName} min-w-0 flex-1`}
        onChange={(event) =>
          updateLink(onChange, entry.id, "url", event.target.value)
        }
        placeholder="https://"
        type="url"
        value={entry.url}
      />
      <Button
        aria-label={`Remove link ${index + 1}`}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X className="text-muted-foreground" />
      </Button>
    </div>
  )
}

function EducationCard({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: EducationEntry
  index: number
  onChange: React.Dispatch<React.SetStateAction<UserProfile>>
  onRemove: () => void
}) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Education {index + 1}
        </p>
        <Button
          aria-label={`Remove education ${index + 1}`}
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="grid gap-4">
        <Field
          label="Institution"
          htmlFor={`education-institution-${entry.id}`}
        >
          <Input
            className={inputClassName}
            id={`education-institution-${entry.id}`}
            onChange={(event) =>
              updateEducation(
                onChange,
                entry.id,
                "institution",
                event.target.value
              )
            }
            placeholder="e.g. University of Indonesia"
            value={entry.institution}
          />
        </Field>
        <Field label="Degree" htmlFor={`education-degree-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`education-degree-${entry.id}`}
            onChange={(event) =>
              updateEducation(onChange, entry.id, "degree", event.target.value)
            }
            placeholder="e.g. Bachelor of Computer Science"
            value={entry.degree}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start" htmlFor={`education-start-${entry.id}`}>
            <MonthPickerField
              className={inputClassName}
              id={`education-start-${entry.id}`}
              maxDate={parseMonthValue(entry.end)}
              onChange={(value) =>
                updateEducation(onChange, entry.id, "start", value)
              }
              value={entry.start}
            />
          </Field>
          <Field label="End" htmlFor={`education-end-${entry.id}`}>
            <MonthPickerField
              className={inputClassName}
              clearable
              id={`education-end-${entry.id}`}
              minDate={parseMonthValue(entry.start)}
              onChange={(value) =>
                updateEducation(onChange, entry.id, "end", value)
              }
              placeholder="Leave empty if ongoing"
              value={entry.end}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor={`education-notes-${entry.id}`}>
          <Textarea
            className={inputClassName}
            id={`education-notes-${entry.id}`}
            onChange={(event) =>
              updateEducation(onChange, entry.id, "notes", event.target.value)
            }
            placeholder="Honors, relevant coursework, capstone projects…"
            rows={3}
            value={entry.notes}
          />
        </Field>
      </div>
    </article>
  )
}

function updateProfileField(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  field: "name" | "summary"
) {
  return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfile((current) => ({ ...current, [field]: event.target.value }))
  }
}

function updateContactsField(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  field: "email" | "phone"
) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    setProfile((current) => ({
      ...current,
      contacts: { ...current.contacts, [field]: event.target.value },
    }))
  }
}

function updateLink(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  field: keyof Omit<ProfileLinkEntry, "id">,
  value: string
) {
  setProfile((current) => ({
    ...current,
    links: current.links.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry
    ),
  }))
}

function addLink(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
) {
  setProfile((current) => ({
    ...current,
    links: [
      ...current.links,
      createLinkEntry(current.links.map((link) => link.label)),
    ],
  }))
}

function removeLink(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string
) {
  setProfile((current) => ({
    ...current,
    links: current.links.filter((entry) => entry.id !== id),
  }))
}

function updateEducation(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  field: keyof Omit<EducationEntry, "id">,
  value: string
) {
  setProfile((current) => ({
    ...current,
    educations: current.educations.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry
    ),
  }))
}

function addEducation(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
) {
  setProfile((current) => ({
    ...current,
    educations: [...current.educations, createEducationEntry()],
  }))
}

function removeEducation(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string
) {
  setProfile((current) => ({
    ...current,
    educations: current.educations.filter((entry) => entry.id !== id),
  }))
}
