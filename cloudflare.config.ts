import { bindings, defineConfig } from "cf/config"

export default defineConfig({
  worker: {
    name: "dfe",
    entrypoint: "@tanstack/react-start/server-entry",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["dfe.makarima.dev"],
    env: {
      WORKOS_CLIENT_ID: bindings.secret(),
      WORKOS_API_KEY: bindings.secret(),
      WORKOS_REDIRECT_URI: bindings.secret(),
      WORKOS_COOKIE_PASSWORD: bindings.secret(),
    },
  },
})
