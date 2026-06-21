import * as React from "react"
import { BoldPlugin, ItalicPlugin } from "@platejs/basic-nodes/react"
import type { RenderLeafProps, TElement, TText, Value } from "platejs"
import { ElementApi, TextApi } from "platejs"
import { Plate, PlateContent, usePlateEditor } from "platejs/react"
import { Bold, Italic } from "lucide-react"

import { parseInlineMarkdown } from "#/lib/inline-markdown.ts"
import { cn } from "#/lib/utils.ts"
import { Button } from "./button.tsx"

type RichTextLeaf = TText & {
  bold?: true
  italic?: true
}

type RichTextParagraph = TElement & {
  children: RichTextLeaf[]
  type: "p"
}

type RichTextValue = RichTextParagraph[]

const richTextPlugins = [BoldPlugin, ItalicPlugin]

function Textarea({
  className,
  defaultValue,
  disabled,
  id,
  onChange,
  placeholder,
  readOnly,
  required,
  rows,
  value,
  containerClassName,
  ...props
}: React.ComponentProps<"textarea"> & {
  containerClassName?: React.ComponentProps<"div">["className"]
}) {
  const generatedId = React.useId()
  const editorId = id ?? generatedId
  const textValue = toTextareaString(value ?? defaultValue)
  const hiddenTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const lastMarkdownRef = React.useRef(textValue)
  const [toolbarOpen, setToolbarOpen] = React.useState(false)
  const editor = usePlateEditor({
    plugins: richTextPlugins,
    value: markdownToPlateValue(textValue),
  })

  React.useEffect(() => {
    if (textValue === lastMarkdownRef.current) return
    lastMarkdownRef.current = textValue
    editor.tf.setValue(markdownToPlateValue(textValue))
  }, [editor, textValue])

  const emitChange = React.useCallback((nextValue: string) => {
    if (nextValue === lastMarkdownRef.current) return
    lastMarkdownRef.current = nextValue

    const textarea = hiddenTextareaRef.current
    if (!textarea) return

    // Use the native value setter so React's controlled-input value tracker
    // registers the change; assigning `textarea.value` directly would update
    // the tracker and make the dispatched event look like a no-op to React.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set
    nativeSetter?.call(textarea, nextValue)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }, [])

  const updateToolbar = React.useCallback(() => {
    const selection = window.getSelection()
    setToolbarOpen(Boolean(selection && selection.toString().trim()))
  }, [])

  return (
    <div className={cn("relative", containerClassName)}>
      <textarea
        {...props}
        aria-hidden="true"
        className="sr-only"
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        readOnly={readOnly}
        ref={hiddenTextareaRef}
        required={required}
        tabIndex={-1}
        value={value}
      />
      <Plate
        editor={editor}
        onValueChange={({ value }) => emitChange(plateValueToMarkdown(value))}
        readOnly={disabled || readOnly}
        renderLeaf={RichTextLeaf}
      >
        <div
          className={cn(
            "relative flex min-h-24 w-full rounded-md border border-input bg-transparent text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 md:text-sm dark:bg-input/30",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
            className
          )}
          aria-invalid={props["aria-invalid"]}
          data-disabled={disabled ? "" : undefined}
          data-slot="textarea"
          onBlur={() => setToolbarOpen(false)}
          onKeyUp={updateToolbar}
          onMouseUp={updateToolbar}
        >
          <FloatingMarkToolbar editor={editor} open={toolbarOpen} />
          <PlateContent
            aria-invalid={props["aria-invalid"]}
            aria-required={required}
            className="w-full resize-y overflow-auto px-3 leading-6 outline-none [min-height:inherit] empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
            data-placeholder={placeholder}
            id={editorId}
            placeholder={placeholder}
            readOnly={disabled || readOnly}
            rows={rows}
          />
        </div>
      </Plate>
    </div>
  )
}

function FloatingMarkToolbar({
  editor,
  open,
}: {
  editor: NonNullable<ReturnType<typeof usePlateEditor>>
  open: boolean
}) {
  if (!open) return null

  return (
    <div className="absolute top-0 left-1/2 z-20 flex -translate-x-1/2 -translate-y-full gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
      <Button
        aria-label="Bold"
        onMouseDown={(event) => {
          event.preventDefault()
          editor.tf.toggleMark("bold")
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Bold className="size-4" />
      </Button>
      <Button
        aria-label="Italic"
        onMouseDown={(event) => {
          event.preventDefault()
          editor.tf.toggleMark("italic")
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Italic className="size-4" />
      </Button>
    </div>
  )
}

function RichTextLeaf({ attributes, children, leaf }: RenderLeafProps) {
  let content: React.ReactNode = children
  if (hasMark(leaf, "bold")) content = <strong>{content}</strong>
  if (hasMark(leaf, "italic")) content = <em>{content}</em>

  return <span {...attributes}>{content}</span>
}

function markdownToPlateValue(markdown: string): RichTextValue {
  const lines = markdown.split("\n")
  const paragraphs = lines.map((line): RichTextParagraph => {
    const parsed = parseInlineMarkdown(line)
    const children =
      parsed.length === 0
        ? [{ text: "" }]
        : parsed.map((segment): RichTextLeaf => {
            return {
              ...(segment.bold ? { bold: true } : {}),
              ...(segment.italic ? { italic: true } : {}),
              text: segment.text,
            }
          })

    return { children, type: "p" }
  })

  return paragraphs.length > 0
    ? paragraphs
    : [{ children: [{ text: "" }], type: "p" }]
}

function plateValueToMarkdown(value: Value): string {
  return value.map((node) => nodeToMarkdown(node)).join("\n")
}

function nodeToMarkdown(node: TElement | TText): string {
  if (TextApi.isText(node)) {
    return markedTextToMarkdown(node)
  }

  if (ElementApi.isElement(node)) {
    return node.children.map((child) => nodeToMarkdown(child)).join("")
  }

  return ""
}

function markedTextToMarkdown(node: TText): string {
  if (hasMark(node, "bold") && hasMark(node, "italic"))
    return `***${node.text}***`
  if (hasMark(node, "bold")) return `**${node.text}**`
  if (hasMark(node, "italic")) return `*${node.text}*`
  return node.text
}

function hasMark(node: TText, mark: "bold" | "italic") {
  return node[mark] === true
}

function toTextareaString(value: React.ComponentProps<"textarea">["value"]) {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return value.toString()
  return value.join("\n")
}

export { Textarea }
