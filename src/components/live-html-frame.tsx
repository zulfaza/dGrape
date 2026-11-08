import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  bridgeNonce,
  liveReportDocument,
  startBridgeSession,
  type BridgeRead,
} from "@/lib/html-bridge"
import { Button } from "./ui/button"

/**
 * A live HTML report: authored scripts run in a frame with only the
 * `allow-scripts` sandbox token (an opaque origin) and read data only
 * through the bridge in src/lib/html-bridge.ts. Never add `allow-same-origin`
 * or other sandbox tokens here: with them, the report could reach the app
 * origin and its credentials.
 *
 * `read` runs the server-authorized read of one binding name. When the frame
 * loads a second document (it navigated), the bridge stops until Reload.
 */
export function LiveHtmlFrame({
  html,
  title,
  bindings,
  read,
  className,
}: {
  html: string
  title: string
  bindings: readonly string[]
  read: (name: string) => Promise<BridgeRead>
  className: string
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [run, setRun] = useState(0)
  const [stopped, setStopped] = useState(false)
  const readRef = useRef(read)
  useLayoutEffect(() => {
    readRef.current = read
  }, [read])
  const names = bindings.join("\n")
  // A new document, binding set or run gets a new session nonce.
  const key = JSON.stringify([html, names, run])
  const [session, setSession] = useState(() => ({ key, nonce: bridgeNonce() }))
  if (session.key !== key) setSession({ key, nonce: bridgeNonce() })
  const { nonce } = session
  const srcDoc = useMemo(() => liveReportDocument(html, nonce), [html, nonce])

  // Before the frame parses its document, so the first hello is not missed.
  useLayoutEffect(() => {
    const element = ref.current
    const frame = element?.contentWindow
    if (!element || !frame) return
    setStopped(false)
    const bridge = startBridgeSession({
      frame,
      nonce,
      bindings: names.split("\n"),
      read: (name) => readRef.current(name),
    })
    let loads = 0
    const onLoad = () => {
      loads += 1
      if (loads > 1) {
        bridge.stop()
        setStopped(true)
      }
    }
    element.addEventListener("load", onLoad)
    return () => {
      element.removeEventListener("load", onLoad)
      bridge.stop()
    }
  }, [nonce, names])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <iframe
        key={nonce}
        ref={ref}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className={className}
      />
      {stopped && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-card/95 p-3 text-center text-sm text-muted-foreground"
        >
          <p>The report opened another page, so live data stopped.</p>
          <Button size="sm" variant="outline" onClick={() => setRun(run + 1)}>
            Reload report
          </Button>
        </div>
      )}
    </div>
  )
}
