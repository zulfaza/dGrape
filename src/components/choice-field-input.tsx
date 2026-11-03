import type { ReactNode } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Select value for "no option" in an optional select field. */
const NO_OPTION = "__none"

/** One choice of a select input: the stored value and the text people see. */
export type SelectItemOption = {
  readonly value: string
  readonly label: string
}

/**
 * The record form input of a select field or a reference field: a list with
 * one choice. An optional field also offers "No value", which `onChange`
 * reports as "".
 */
export function SelectFieldInput({
  id,
  options,
  optional,
  value,
  disabled,
  onChange,
}: {
  id: string
  options: ReadonlyArray<SelectItemOption>
  optional: boolean
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={value === "" && optional ? NO_OPTION : value}
      disabled={disabled}
      required={!optional}
      onValueChange={(next) => onChange(next === NO_OPTION ? "" : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose an option" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {optional && <SelectItem value={NO_OPTION}>No value</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * The record form input of a multi-select field: a group with one checkbox
 * for each option. `onChange` reports the chosen options in option order.
 */
export function MultiSelectFieldInput({
  id,
  legend,
  options,
  value,
  disabled,
  onChange,
}: {
  id: string
  legend: ReactNode
  options: ReadonlyArray<string>
  value: ReadonlyArray<string>
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const chosen = new Set(value)
  return (
    <fieldset id={id} className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((option, index) => (
        <div key={option} className="flex items-center gap-2">
          <Checkbox
            id={`${id}-${index}`}
            disabled={disabled}
            checked={chosen.has(option)}
            onCheckedChange={(checked) =>
              onChange(
                options.filter((candidate) =>
                  candidate === option
                    ? checked === true
                    : chosen.has(candidate)
                )
              )
            }
          />
          <Label htmlFor={`${id}-${index}`}>{option}</Label>
        </div>
      ))}
    </fieldset>
  )
}
