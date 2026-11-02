import { bindings, defineConfig } from "cf/config"

export default defineConfig({
  worker: {
    name: "dfe",
    entrypoint: "@tanstack/react-start/server-entry",
    compatibilityDate: "2026-11-02",
    compatibilityFlags: ["nodejs_compat"],
    env: {
      WORKOS_CLIENT_ID: bindings.secret(),
      WORKOS_API_KEY: bindings.secret(),
      WORKOS_REDIRECT_URI: bindings.secret(),
      WORKOS_COOKIE_PASSWORD: bindings.secret(),
    },
  },
})
