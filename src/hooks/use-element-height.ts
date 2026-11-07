import { useEffect, useState } from "react"

/**
 * The content height of an element, in CSS pixels, kept current with a
 * ResizeObserver. Pass `ref` as the element's ref. The height is 0 until
 * the element mounts and is measured.
 */
export function useElementHeight<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(Math.floor(entry.contentRect.height))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return { ref, height }
}
