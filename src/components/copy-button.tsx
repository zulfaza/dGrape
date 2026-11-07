import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/components/ui/toast"

/** An icon button that copies `value`; `label` names it, as "reference ID". */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            } catch {
              toast.error(`Could not copy the ${label}`)
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  )
}
