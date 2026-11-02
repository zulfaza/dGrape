import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  root: fileURLToPath(new URL("./design-system", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [tailwindcss(), react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/design-system", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      output: { format: "iife" },
      onwarn(warning, warn) {
        // This upstream icon package annotates array literals as pure calls.
        if (
          warning.code === "INVALID_ANNOTATION" &&
          warning.id?.includes("@hugeicons/core-free-icons")
        )
          return
        warn(warning)
      },
    },
  },
})
