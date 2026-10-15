import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const COMPOSER_BUNDLE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../build/ui/composer.html"
);

// Ratified bundle budget for the single-file composer (raw, pre-gzip):
// a hard failure cap and a softer warning line. The baseline before the
// WYSIWYG editor landed was ~852 KB; the editor (TipTap/ProseMirror) pushes
// it toward the warning line, which the guard reports deliberately.
const BUDGET_WARN_BYTES = 1_200_000; // 1.2 MB
const BUDGET_HARD_BYTES = 1_500_000; // 1.5 MB

/**
 * Enforces the composer bundle size guard on every run of the main suite
 * (pure file inspection — no live Rocket.Chat needed). Skips only when the
 * bundle has not been built yet (same policy as the integration suite).
 */
describe.skipIf(!existsSync(COMPOSER_BUNDLE))(
  "composer bundle size budget",
  () => {
    it("keeps the single-file bundle under the hard 1.5 MB cap", () => {
      const bytes = statSync(COMPOSER_BUNDLE).size;
      if (bytes > BUDGET_WARN_BYTES) {
        console.warn(
          `[budget] composer.html is ${(bytes / 1024).toFixed(0)} KiB — above ` +
            `the ${BUDGET_WARN_BYTES / 1000} KB warning line; the hard cap is ` +
            `${BUDGET_HARD_BYTES / 1000} KB`
        );
      }
      expect(bytes).toBeLessThanOrEqual(BUDGET_HARD_BYTES);
    });
  }
);
