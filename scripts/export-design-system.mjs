import { readFile, readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
const assets = path.join(root, "dist/design-system/assets")
const files = await readdir(assets)
const entry = files.find((name) => /^index-.*\.js$/.test(name))
if (!entry) throw new Error("Build the design system before exporting it.")

let bundle = await readFile(path.join(assets, entry), "utf8")
// Keep the export compact; the full build retains all supported font subsets.
bundle = bundle.replace(/@font-face\{[^}]+\}/g, (rule) =>
  rule.includes("-latin-wght-") ? rule : ""
)
for (const name of files.filter((name) => name.endsWith(".woff2"))) {
  if (!bundle.includes(name)) continue
  const bytes = await readFile(path.join(assets, name))
  bundle = bundle.replaceAll(
    `./assets/${name}`,
    `data:font/woff2;base64,${bytes.toString("base64")}`
  )
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  bundle = bundle.replace(
    new RegExp("new URL\\(`" + escaped + "`,[\\s\\S]*?\\)\\.href", "g"),
    JSON.stringify(`data:font/woff2;base64,${bytes.toString("base64")}`)
  )
}
// Inline frames must let their content set the height.
bundle = bundle.replaceAll("100vh", "0px")
const compressed = gzipSync(bundle).toString("base64")
const favicon = `data:image/svg+xml;base64,${(await readFile(path.join(root, "public/favicon.svg"))).toString("base64")}`
const variantSources = await Promise.all(
  ["badge", "mono", "outline"].map(async (variant) => {
    const bytes = await readFile(
      path.join(root, `public/brand/sloth-${variant}.svg`)
    )
    return `<img id="${variant}-source" hidden src="data:image/svg+xml;base64,${bytes.toString("base64")}" alt="">`
  })
)
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DFE — Dashboard for Everything</title><link rel="icon" href="${favicon}" type="image/svg+xml">
<style>html,body,#root{margin:0;min-height:0!important;background:transparent!important}.design-system{min-height:0!important;background:transparent!important}.ds-main{background:var(--background)}.ds-sidebar{border-radius:var(--radius) 0 0 var(--radius)}</style>
</head><body>${variantSources.join("")}<img id="brand-source" hidden src="${favicon}" alt=""><img id="sloth-source" hidden src="../../public/brand/sloth-concept.png" alt=""><img id="mascot-reference-source" hidden src="../../public/brand/mascot-reference.png" alt=""><img id="mascot-poses-source" hidden src="../../public/brand/mascot-poses.png" alt=""><div id="root"><p>Loading the design system…</p></div>
<script type="module">
try {
  const bytes = Uint8Array.from(atob("${compressed}"), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const script = document.createElement("script");
  script.textContent = await new Response(stream).text();
  document.body.append(script);
  requestAnimationFrame(() => requestAnimationFrame(() => document.dispatchEvent(new Event("dg-design-ready"))));
} catch(error) {
  document.getElementById("root").textContent = "This preview needs a modern browser with gzip stream support. Use pnpm design-system:dev for the full sample.";
  console.error(error);
}
</script></body></html>`
if (Buffer.byteLength(html) > 512 * 1024) {
  throw new Error(
    "The inline design-system export exceeded its 512 KiB budget."
  )
}
const destination = path.join(root, "architecture/design/showcase.html")
await writeFile(destination, html)
console.log(
  `Exported ${path.relative(root, destination)} (${Buffer.byteLength(html)} bytes).`
)
