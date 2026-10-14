import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // The composer UI (ui/**) uses JSX; the automatic runtime matches the
    // React 19 setup used by the Vite build.
    jsx: "automatic",
  },
  test: {
    exclude: ["node_modules/**", "tests/integration/**"],
  },
});
