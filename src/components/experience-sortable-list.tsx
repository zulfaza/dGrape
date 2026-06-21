import { useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { MonthPickerField } from "#/components/month-picker-field.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  EXPERIENCE_POSITION_OPTIONS,
  EXPERIENCE_POSITION_TYPES,
  normalizeExperiencePosition,
} from "#/lib/experience-position.ts";
import { parseMonthValue } from "#/lib/month.ts";
import {
  createExperienceEntry,
  type ExperienceEntry,
  type ExperienceTask,
  type UserProfile,
} from "#/lib/profile.ts";

const inputClassName = "bg-background";

function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

type ExperienceSortableListProps = {
  experience: ExperienceEntry[];
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
};

export function ExperienceSortableList({ experience, setProfile }: ExperienceSortableListProps) {
  const experienceIds = useMemo(() => experience.map((entry) => entry.id), [experience]);
  const sensors = useSortableSensors();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setProfile((current) => {
      const oldIndex = current.experience.findIndex((entry) => entry.id === active.id);
      const newIndex = current.experience.findIndex((entry) => entry.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return current;
      }

      return {
        ...current,
        experience: arrayMove(current.experience, oldIndex, newIndex),
      };
    });
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext items={experienceIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {experience.map((entry, index) => (
            <SortableExperienceCard
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
        onClick={() => addExperience(setProfile)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        Add experience
      </Button>
    </DndContext>
  );
}

function SortableExperienceCard({
  entry,
  index,
  setProfile,
}: {
  entry: ExperienceEntry;
  index: number;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={isDragging ? "relative z-10 opacity-80" : undefined}
      ref={setNodeRef}
      style={style}
    >
      <ExperienceCard
        dragHandleLabel={`Reorder role ${index + 1}`}
        dragHandleProps={{ ...attributes, ...listeners }}
        entry={entry}
        index={index}
        onRemove={() => removeExperience(setProfile, entry.id)}
        setProfile={setProfile}
      />
    </div>
  );
}

function ExperienceCard({
  entry,
  index,
  setProfile,
  onRemove,
  dragHandleProps,
  dragHandleLabel,
}: {
  entry: ExperienceEntry;
  index: number;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onRemove: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
  dragHandleLabel: string;
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
          <p className="text-sm font-medium text-foreground">Role {index + 1}</p>
        </div>
        <Button
          aria-label={`Remove experience ${index + 1}`}
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="grid gap-4">
        <Field label="Company" htmlFor={`experience-company-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`experience-company-${entry.id}`}
            onChange={(event) =>
              updateExperience(setProfile, entry.id, "company", event.target.value)
            }
            value={entry.company}
          />
        </Field>
        <Field label="Company description" htmlFor={`experience-company-description-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`experience-company-description-${entry.id}`}
            onChange={(event) =>
              updateExperience(setProfile, entry.id, "companyDescription", event.target.value)
            }
            placeholder="e.g. SaaS platform for remote teams"
            value={entry.companyDescription}
          />
        </Field>
        <Field label="Position" htmlFor={`experience-role-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`experience-role-${entry.id}`}
            onChange={(event) => updateExperience(setProfile, entry.id, "role", event.target.value)}
            placeholder="e.g. Full Stack Engineer"
            value={entry.role}
          />
        </Field>
        <Field label="Job type" htmlFor={`experience-position-${entry.id}`}>
          <Select
            onValueChange={(value) =>
              updateExperience(setProfile, entry.id, "position", normalizeExperiencePosition(value))
            }
            value={entry.position || undefined}
          >
            <SelectTrigger
              aria-label={`Experience ${index + 1} job type`}
              className={`${inputClassName} w-full`}
              id={`experience-position-${entry.id}`}
            >
              <SelectValue placeholder="Select job type" />
            </SelectTrigger>
            <SelectContent>
              {EXPERIENCE_POSITION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {EXPERIENCE_POSITION_OPTIONS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Location" htmlFor={`experience-location-${entry.id}`}>
          <Input
            className={inputClassName}
            id={`experience-location-${entry.id}`}
            onChange={(event) =>
              updateExperience(setProfile, entry.id, "location", event.target.value)
            }
            placeholder="e.g. San Francisco, CA or Remote"
            value={entry.location}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start" htmlFor={`experience-start-${entry.id}`}>
            <MonthPickerField
              className={inputClassName}
              id={`experience-start-${entry.id}`}
              maxDate={parseMonthValue(entry.end)}
              onChange={(value) => updateExperience(setProfile, entry.id, "start", value)}
              value={entry.start}
            />
          </Field>
          <Field label="End" htmlFor={`experience-end-${entry.id}`}>
            <MonthPickerField
              className={inputClassName}
              clearable
              id={`experience-end-${entry.id}`}
              minDate={parseMonthValue(entry.start)}
              onChange={(value) => updateExperience(setProfile, entry.id, "end", value)}
              placeholder="Leave empty if current"
              value={entry.end}
            />
          </Field>
        </div>
        <TaskSortableList
          company={entry.company}
          experienceId={entry.id}
          setProfile={setProfile}
          tasks={entry.tasks}
        />
      </div>
    </article>
  );
}

function TaskSortableList({
  experienceId,
  company,
  tasks,
  setProfile,
}: {
  experienceId: string;
  company: string;
  tasks: ExperienceTask[];
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
}) {
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const sensors = useSortableSensors();
  const roleLabel = company || "role";

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setProfile((current) => ({
      ...current,
      experience: current.experience.map((entry) => {
        if (entry.id !== experienceId) {
          return entry;
        }

        const oldIndex = entry.tasks.findIndex((task) => task.id === active.id);
        const newIndex = entry.tasks.findIndex((task) => task.id === over.id);
        if (oldIndex === -1 || newIndex === -1) {
          return entry;
        }

        return { ...entry, tasks: arrayMove(entry.tasks, oldIndex, newIndex) };
      }),
    }));
  };

  return (
    <div className="grid gap-3">
      <div>
        <Label>Tasks</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add task as much as you want, it will be selected based on job description later in CV
          generation.
        </p>
      </div>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {tasks.map((task, taskIndex) => (
              <SortableTaskRow
                canRemove={tasks.length > 1}
                key={task.id}
                roleLabel={roleLabel}
                setProfile={setProfile}
                task={task}
                taskIndex={taskIndex}
                experienceId={experienceId}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Button
        className="w-fit"
        onClick={() => addExperienceTask(setProfile, experienceId)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        Add task
      </Button>
    </div>
  );
}

function SortableTaskRow({
  experienceId,
  task,
  taskIndex,
  roleLabel,
  canRemove,
  setProfile,
}: {
  experienceId: string;
  task: ExperienceTask;
  taskIndex: number;
  roleLabel: string;
  canRemove: boolean;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      className={isDragging ? "relative z-10 flex gap-2 opacity-80" : "flex gap-2"}
      ref={setNodeRef}
      style={style}
    >
      <Button
        {...attributes}
        {...listeners}
        aria-label={`Reorder task ${taskIndex + 1} for ${roleLabel}`}
        className="mt-0.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <GripVertical className="size-4" />
      </Button>
      <Input
        aria-label={`Task ${taskIndex + 1} for ${roleLabel}`}
        className={inputClassName}
        onChange={(event) =>
          updateExperienceTask(setProfile, experienceId, task.id, event.target.value)
        }
        placeholder="Describe a responsibility or achievement"
        value={task.text}
      />
      <Button
        aria-label={`Remove task ${taskIndex + 1}`}
        className="shrink-0"
        disabled={!canRemove}
        onClick={() => removeExperienceTask(setProfile, experienceId, task.id)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="text-muted-foreground" />
      </Button>
    </li>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function updateExperience(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  field: keyof Omit<ExperienceEntry, "id" | "tasks">,
  value: string,
) {
  setProfile((current) => ({
    ...current,
    experience: current.experience.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry,
    ),
  }));
}

function updateExperienceTask(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  taskId: string,
  value: string,
) {
  setProfile((current) => ({
    ...current,
    experience: current.experience.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }
      return {
        ...entry,
        tasks: entry.tasks.map((task) => (task.id === taskId ? { ...task, text: value } : task)),
      };
    }),
  }));
}

function addExperience(setProfile: React.Dispatch<React.SetStateAction<UserProfile>>) {
  setProfile((current) => ({
    ...current,
    experience: [...current.experience, createExperienceEntry()],
  }));
}

function removeExperience(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
) {
  setProfile((current) => ({
    ...current,
    experience: current.experience.filter((entry) => entry.id !== id),
  }));
}

function addExperienceTask(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
) {
  setProfile((current) => ({
    ...current,
    experience: current.experience.map((entry) =>
      entry.id === id
        ? { ...entry, tasks: [...entry.tasks, { id: crypto.randomUUID(), text: "" }] }
        : entry,
    ),
  }));
}

function removeExperienceTask(
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  id: string,
  taskId: string,
) {
  setProfile((current) => ({
    ...current,
    experience: current.experience.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }
      return { ...entry, tasks: entry.tasks.filter((task) => task.id !== taskId) };
    }),
  }));
}
