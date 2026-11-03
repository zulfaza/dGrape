import { appendFileSync } from "node:fs"

const required = [
  "CONVEX_DEPLOYMENT_NAME",
  "CONVEX_DEPLOY_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "WORKOS_REDIRECT_URI",
  "GITHUB_ENV",
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing deployment setting: ${name}`)
}
const deployment = process.env.CONVEX_DEPLOYMENT_NAME
if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment)) {
  throw new Error("Invalid production deployment name")
}
if (!process.env.CONVEX_DEPLOY_KEY.startsWith(`prod:${deployment}|`)) {
  throw new Error("Deploy key must target the selected production deployment")
}
if (process.env.WORKOS_REDIRECT_URI !== "https://dfe.makarima.dev/callback") {
  throw new Error("WorkOS redirect must match the production callback")
}
console.log(`target: prod (${deployment}); Worker: dfe`)
appendFileSync(
  process.env.GITHUB_ENV,
  `VITE_CONVEX_URL=https://${deployment}.convex.cloud\nVITE_CONVEX_SITE_URL=https://${deployment}.convex.site\n`
)
