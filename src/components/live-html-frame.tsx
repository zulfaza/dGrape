import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  bridgeNonce,
  liveReportDocument,
  startBridgeSession,
  type BridgeRead,
} from "@/lib/html-bridge"

/**
 * A live HTML report: authored scripts run in an inner frame with only the
 * `allow-scripts` sandbox token (an opaque origin) and read data only
 * through the bridge in src/lib/html-bridge.ts. Never add `allow-same-origin`
 * or other sandbox tokens here: with them, the report could reach the app
 * origin and its credentials. The outer frame has the same sandbox, so the
 * inner frame cannot get more than it.
 *
 * `read` runs the server-authorized read of one binding name.
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
  const readRef = useRef(read)
  useLayoutEffect(() => {
    readRef.current = read
  }, [read])
  const names = bindings.join("\n")
  // A new document or binding set gets a new session nonce.
  const key = JSON.stringify([html, names])
  const [session, setSession] = useState(() => ({ key, nonce: bridgeNonce() }))
  if (session.key !== key) setSession({ key, nonce: bridgeNonce() })
  const { nonce } = session
  const srcDoc = useMemo(() => liveReportDocument(html, nonce), [html, nonce])

  // Before the report parses its document, so the first hello is not missed.
  useLayoutEffect(() => {
    const frame = ref.current?.contentWindow
    if (!frame) return
    const bridge = startBridgeSession({
      frame,
      nonce,
      bindings: names.split("\n"),
      read: (name) => readRef.current(name),
    })
    return () => bridge.stop()
  }, [nonce, names])

  return (
    <iframe
      key={nonce}
      ref={ref}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={className}
    />
  )
}
