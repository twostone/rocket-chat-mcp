import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = fileURLToPath(new URL(".", import.meta.url));

// The composer ships as a single self-contained HTML file so it can be
// served as one UI resource (ui://rocket-chat/composer.html) without any
// auxiliary assets. CSS, JS and the emoji data are all inlined. Output goes
// to build/ui/ (next to the tsc output) in both dev and Docker builds.
export default defineConfig({
  root: here,
  plugins: [
    react(),
    viteSingleFile(),
    {
      // Vite keeps the input file name (index.html) for the emitted HTML;
      // the loader expects build/ui/composer.html, so rename it here.
      name: "rename-composer-output",
      closeBundle: async () => {
        const outDir = fileURLToPath(
          new URL("../../build/ui", import.meta.url)
        );
        await fs.rename(
          `${outDir}/index.html`,
          `${outDir}/composer.html`
        );
      },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL("../../build/ui", import.meta.url)),
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: "index.html",
      output: { inlineDynamicImports: true },
    },
  },
});
