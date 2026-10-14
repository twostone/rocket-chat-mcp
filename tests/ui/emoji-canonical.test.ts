import { describe, it, expect } from "vitest";
import { glyphToShortcode } from "../../ui/composer/src/lib/emoji-canonical";
import { emojiByShortcode } from "../../ui/composer/src/lib/emoji-map";

describe("glyphToShortcode (canonical alias lookup)", () => {
  it("prefers the shorter alias over a longer one", () => {
    // Both map to the same glyph; "unamused" (8 chars) beats "unamused_face".
    const glyph = emojiByShortcode.unamused;
    expect(glyph).toBe(emojiByShortcode.unamused_face);
    expect(glyphToShortcode(glyph)).toBe("unamused");
  });

  it("picks the shorter alias when several shortcodes share a glyph", () => {
    // Verified against the bundled map: 🔥 is owned by both "fire" and "flame".
    const glyph = emojiByShortcode.fire;
    expect(emojiByShortcode.flame).toBe(glyph);
    expect(glyphToShortcode(glyph)).toBe("fire");
  });

  it("covers every distinct glyph in the map", () => {
    const glyphs = new Set(Object.values(emojiByShortcode));
    expect(glyphs.size).toBeGreaterThan(2000);
    for (const glyph of glyphs) {
      expect(
        glyphToShortcode(glyph),
        `missing canonical for ${JSON.stringify(glyph)}`
      ).toBeTruthy();
    }
  });

  it("breaks length ties deterministically among same-length aliases", () => {
    // Collect one colliding group whose aliases all share a length, then any
    // two of them form a length tie the resolver must break deterministically
    // by preferring the lexicographically smaller code.
    const byGlyph = new Map<string, string[]>();
    for (const [code, glyph] of Object.entries(emojiByShortcode)) {
      const list = byGlyph.get(glyph) ?? [];
      list.push(code);
      byGlyph.set(glyph, list);
    }
    let tieGroup: string[] | undefined;
    for (const codes of byGlyph.values()) {
      if (codes.length > 2 && codes.every((c) => c.length === codes[0].length)) {
        tieGroup = codes;
        break;
      }
    }
    if (!tieGroup) {
      throw new Error("test precondition: no same-length alias group found");
    }
    const codes = [...tieGroup].sort();
    const glyph = emojiByShortcode[codes[0]];
    // Deterministic: repeated calls agree.
    const winner = glyphToShortcode(glyph);
    expect(winner).toBeDefined();
    expect(glyphToShortcode(glyph)).toBe(winner);
    // Winner must be one of the actual aliases, not an invented code.
    expect(codes).toContain(winner);
    // Lexicographic tie-break: the winner is the smallest-length code, and
    // among same-length ones the lexicographically smallest.
    const sortedByLenThenLex = [...tieGroup].sort((a, b) =>
      a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
    );
    expect(winner).toBe(sortedByLenThenLex[0]);
  });

  it("returns undefined for unmapped glyphs", () => {
    expect(glyphToShortcode("\uD83D\uDCFF\uFE0F")).toBeUndefined();
  });
});
