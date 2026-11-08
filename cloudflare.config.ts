import { bindings, defineConfig, exports, triggers } from "cf/config"

export default defineConfig({
  worker: {
    name: "dfe",
    entrypoint: "./src/worker.ts",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["dfe.makarima.dev"],
    exports: {
      RecipeWorkflow: exports.workflow({
        name: "dfe-recipes",
        concurrency: { limit: 4 },
      }),
    },
    triggers: [triggers.scheduled({ schedule: "* * * * *" })],
    env: {
      RECIPE_CONVEX_SITE_URL: bindings.secret(),
      RECIPE_DISPATCH_TOKEN: bindings.secret(),
      RECIPE_WORKFLOW: bindings.workflow({
        name: "dfe-recipes",
        worker: "dfe",
        exportName: "RecipeWorkflow",
      }),
      WORKOS_CLIENT_ID: bindings.secret(),
      WORKOS_API_KEY: bindings.secret(),
      WORKOS_REDIRECT_URI: bindings.secret(),
      WORKOS_COOKIE_PASSWORD: bindings.secret(),
      // Convex sends it to read secretRef values. The values are the
      // undeclared SECRET_REF_* Worker secrets; see docs/deployment.md.
      SECRET_BINDING_TOKEN: bindings.secret(),
    },
  },
})
