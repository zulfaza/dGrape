import { useMemo } from "react"
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import {
  createProjectEntry,
  type ProjectEntry,
  type UserProfile,
} from "#/lib/profile.ts"

const inputClassName = "bg-background"

function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

type ProjectSortableListProps = {
  projects: ProjectEntry[]
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
}

export function ProjectSortableList({
  projects,
  setProfile,
}: ProjectSortableListProps) {
  const projectIds = useMemo(
    () => projects.map((entry) => entry.id),
    [projects]
  )
  const sensors = useSortableSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setProfile((current) => {
      const oldIndex = current.projects.findIndex(
        (entry) => entry.id === active.id
      )
      const newIndex = current.projects.findIndex(
        (entry) => entry.id === over.id
      )
      if (oldIndex === -1 || newIndex === -1) return current

      return {
        ...current,
        projects: arrayMove(current.projects, oldIndex, newIndex),
      }
    })
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={projectIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4">
          {projects.map((entry, index) => (
            <SortableProjectCard
              entry={entry}
              index={index}
              key={entry.id}
              setProfile={setProfile}
            />
          ))}
        </div>
      </SortableContext>
      <Button
        className="mt-4 w-fit"
        onClick={() => addProject(setProfile)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        Add project
      </Button>
    </DndContext>
  )
}

function SortableProjectCard({
  entry,
  index,
  setProfile,
}: {
  entry: ProjectEntry
  index: number
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      className={isDragging ? "relative z-10 opacity-80" : undefined}
      ref={setNodeRef}
      style={style}
    >
      <ProjectCard
        dragHandleLabel={`Reorder project ${index + 1}`}
        dragHandleProps={{ ...attributes, ...listeners }}
        entry={entry}
        index={index}
        onRemove={() => removeProject(setProfile, entry.id)}
        setProfile={setProfile}
      />
    </div>
  )
}

function ProjectCard({
  entry,
  index,
  setProfile,
  onRemove,
  dragHandleProps,
  dragHandleLabel,
}: {
  entry: ProjectEntry
  index: number
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
  onRemove: () => void
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>
  dragHandleLabel: string
}) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            {...dragHandleProps}
            aria-label={dragHandleLabel}
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <GripVertical />
          </Button>
          <p className="text-sm font-medium text-foreground">
            Project {index + 1}
          </p>
        </div>
        <Button
          aria-label={`Remove project ${index + 1}`}
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="grid gap-4">
        <Field label="Title" htmlFor={`project-title-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`project-title-${entry.id}`}
            onChange={(event) =>
              updateProject(setProfile, entry.id, "title", event.target.value)
            }
            placeholder="e.g. Portfolio automation"
            required
            value={entry.title}
          />
        </Field>
        <Field label="Description" htmlFor={`project-description-${entry.id}`}>
          <Textarea
            className={inputClassName}
            id={`project-description-${entry.id}`}
            onChange={(event) =>
              updateProject(
                setProfile,
                entry.id,
                "description",
                event.target.value
              )
            }
            placeholder="What you built, why it mattered, and the outcome"
            required
            rows={3}
            value={entry.description}
          />
        </Field>
        <Field label="Link" htmlFor={`project-link-${entry.id}`}>
          <Input
            autoComplete="url"
            className={inputClassName}
            id={`project-link-${entry.id}`}
            onChange={(event) =>
              updateProject(setProfile, entry.id, "link", event.target.value)
            }
            placeholder="https://"
            type="url"
            value={entry.link}
          />
        </Field>
      </div>
    </article>
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

function updateProject(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  field: keyof Omit<ProjectEntry, "id">,
  value: string
) {
  setProfile((current) => ({
    ...current,
    projects: current.projects.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry
    ),
  }))
}

function addProject(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>
) {
  setProfile((current) => ({
    ...current,
    projects: [...current.projects, createProjectEntry()],
  }))
}

function removeProject(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string
) {
  setProfile((current) => ({
    ...current,
    projects: current.projects.filter((entry) => entry.id !== id),
  }))
}
