import { MAX_OPTIONS } from "../../convex/lib/collectionDomain"
import { Label } from "@/components/ui/label"

/**
 * The options of a select or multi-select field, one on each line. The
 * parent keeps the text and parses it with `parseOptionLines` on submit.
 */
export function FieldOptionsInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Options</Label>
      <textarea
        id={id}
        className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
        rows={4}
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">
        Write one option on each line, at most {MAX_OPTIONS} options.
      </p>
    </div>
  )
}
