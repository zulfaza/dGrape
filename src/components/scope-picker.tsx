import {
  OFFERED_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_PRESETS,
  type AgentScope,
} from "../../convex/lib/agentScope"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

type Preset = keyof typeof SCOPE_PRESETS

const PRESETS: ReadonlyArray<Preset> = ["readonly", "readwrite"]

const PRESET_LABELS: Record<Preset, string> = {
  readonly: "Read only",
  readwrite: "Read and write",
}

function sameScopes(
  a: ReadonlyArray<AgentScope>,
  b: ReadonlyArray<AgentScope>
) {
  return a.length === b.length && a.every((scope) => b.includes(scope))
}

/** A short label for a scope set: a preset name, or the scope names. */
export function scopeSummary(scopes: ReadonlyArray<AgentScope>) {
  if (sameScopes(scopes, SCOPE_PRESETS.readonly)) return PRESET_LABELS.readonly
  if (sameScopes(scopes, SCOPE_PRESETS.readwrite))
    return PRESET_LABELS.readwrite
  return scopes.join(", ")
}

/**
 * Lets the user choose the scopes of an agent credential. The server checks
 * the chosen set again (`parseRequestedScopes`).
 */
export function ScopePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: ReadonlyArray<AgentScope>
  onChange: (scopes: Array<AgentScope>) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Access</legend>
      <div className="flex gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={
              sameScopes(value, SCOPE_PRESETS[preset]) ? "default" : "outline"
            }
            aria-pressed={sameScopes(value, SCOPE_PRESETS[preset])}
            onClick={() => onChange([...SCOPE_PRESETS[preset]])}
          >
            {PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>
      <details
        className="group"
        open={
          !PRESETS.some((preset) => sameScopes(value, SCOPE_PRESETS[preset]))
        }
      >
        <summary className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight
            aria-hidden
            className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          Choose permissions
        </summary>
        <div className="mt-3 grid gap-2">
          {OFFERED_SCOPES.map((scope) => (
            <div key={scope} className="flex items-start gap-2">
              <Checkbox
                id={`${id}-${scope}`}
                aria-describedby={`${id}-${scope}-help`}
                checked={value.includes(scope)}
                onCheckedChange={(checked) =>
                  onChange(
                    OFFERED_SCOPES.filter((s) =>
                      s === scope ? checked === true : value.includes(s)
                    )
                  )
                }
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`${id}-${scope}`}>
                  {SCOPE_DESCRIPTIONS[scope]}
                </Label>
                <code
                  id={`${id}-${scope}-help`}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {scope}
                </code>
              </div>
            </div>
          ))}
        </div>
      </details>
      {value.length === 0 && (
        <p role="alert" className="text-sm text-destructive">
          Choose at least one scope.
        </p>
      )}
    </fieldset>
  )
}
