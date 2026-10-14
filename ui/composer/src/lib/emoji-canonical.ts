import { emojiByShortcode } from "./emoji-map";

/**
 * Canonical shortcode for a unicode emoji glyph.
 *
 * `emojiByShortcode` is not injective (many shortcodes share one glyph), so
 * back-converting a glyph to markup requires choosing one alias. The canonical
 * pick is the SHORTEST alias, tie-broken lexicographically — deterministic,
 * and it favors the short everyday names (`fire` over `fire_ember`-style
 * variants, `unamused` over `unamused_face`).
 *
 * Returns `undefined` for glyphs the bundled map does not know; callers must
 * keep those as literal `:shortcode:` text or plain text — never invent codes.
 */
let byGlyph: Map<string, string> | undefined;

export function glyphToShortcode(glyph: string): string | undefined {
  byGlyph ??= buildReverseLookup();
  return byGlyph.get(glyph);
}

function buildReverseLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [code, glyph] of Object.entries(emojiByShortcode)) {
    const current = lookup.get(glyph);
    if (
      current === undefined ||
      code.length < current.length ||
      (code.length === current.length && code < current)
    ) {
      lookup.set(glyph, code);
    }
  }
  return lookup;
}
