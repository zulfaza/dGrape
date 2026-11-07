import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "#/lib/utils.ts"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => {
    const list = listRef.current
    if (list === null) throw new Error("Tabs list is not mounted")
    return list
  }, [])

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    let readyFrame = 0
    const measure = () => {
      const active = list.querySelector<HTMLElement>(
        '[data-slot="tabs-trigger"][data-state="active"]'
      )
      if (!active) {
        delete list.dataset.indicatorReady
        return
      }
      list.style.setProperty("--tabs-indicator-left", `${active.offsetLeft}px`)
      list.style.setProperty("--tabs-indicator-top", `${active.offsetTop}px`)
      list.style.setProperty(
        "--tabs-indicator-width",
        `${active.offsetWidth}px`
      )
      list.style.setProperty(
        "--tabs-indicator-height",
        `${active.offsetHeight}px`
      )
      cancelAnimationFrame(readyFrame)
      readyFrame = requestAnimationFrame(() => {
        list.dataset.indicatorReady = "true"
      })
    }
    const resize = new ResizeObserver(measure)
    const observeSizes = () => {
      resize.disconnect()
      resize.observe(list)
      list
        .querySelectorAll('[data-slot="tabs-trigger"]')
        .forEach((trigger) => resize.observe(trigger))
      measure()
    }
    const changes = new MutationObserver(observeSizes)
    changes.observe(list, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state"],
    })
    observeSizes()
    return () => {
      cancelAnimationFrame(readyFrame)
      changes.disconnect()
      resize.disconnect()
    }
  }, [])

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex w-fit max-w-full items-center gap-1 bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      <span data-slot="tabs-indicator" aria-hidden="true" />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-9 flex-1 items-center justify-center gap-2 px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
