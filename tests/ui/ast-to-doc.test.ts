import { describe, it, expect } from "vitest";
import { parse } from "@rocket.chat/message-parser";
import type { Root } from "@rocket.chat/message-parser";
import { astToDoc } from "../../ui/composer/src/lib/ast-to-doc";
import { pmToAst } from "../../ui/composer/src/lib/pm-to-ast";
import { serialize } from "../../ui/composer/src/lib/serialize";
import { emojiByShortcode } from "../../ui/composer/src/lib/emoji-map";

/**
 * Inverse of pmToAst: turns a parsed Rocket.Chat AST (or any serializer
 * output) into a TipTap doc. The governing invariant (mirroring the
 * serializer's): for every message S,
 *   pmToAst(astToDoc(parse(S))) ≅ parse(S)   (modulo emoji form)
 * and consequently the editor content of a draft round-trips to the exact
 * markup that will be sent.
 */
describe("astToDoc (Rocket.Chat AST → TipTap doc)", () => {
  const corpus = [
    "plain text",
    "*bold* and _ital_ and ~~gone~~",
    "`code` here",
    "# H1\n## H2\n### H3\n#### H4",
    "- a\n- b",
    "1. a\n2. b",
    "2. restart numbering",
    "- [x] done\n- [ ] todo",
    "> quoted\n> more",
    "```\ncode line\nsecond\n```",
    "```js\nconst x = 1;\n```",
    "[site](https://example.com)",
    "https://example.com/x",
    "emoji :fire: :wink: here",
    ":fire: :tada:",
    "one\n\ntwo",
    "one\n\ntwo\n\nthree",
    "a\nb\nc",
    "@alice and #support hello",
    "🔥 and 👋",
  ];

  function norm(node: unknown): unknown {
    if (Array.isArray(node)) {
      // Coalesce adjacent plain-text siblings: the parser splits text at
      // mention/emoji boundaries, the mapper merges what it emits — same
      // text, different granularity.
      const mapped = node.map(norm);
      return mapped.reduce<Array<Record<string, unknown>>>(
        (acc, n) => {
          const last = acc[acc.length - 1];
          const cur = n as Record<string, unknown>;
          if (
            last &&
            last.type === "PLAIN_TEXT" &&
            cur.type === "PLAIN_TEXT"
          ) {
            last.value = (last.value as string) + (cur.value as string);
          } else {
            acc.push({ ...cur });
          }
          return acc;
        },
        []
      );
    }
    const n = node as { type: string; value?: unknown; unicode?: string; shortCode?: string; language?: unknown };
    if (n.type === "EMOJI") {
      const glyph =
        n.unicode ?? (n.shortCode ? emojiByShortcode[n.shortCode] : undefined);
      // A shortcode the bundled map does not know stays literal text
      // (ratified degradation — never invent a glyph).
      if (glyph === undefined) {
        return { type: "PLAIN_TEXT", value: n.shortCode };
      }
      return { type: "EMOJI", glyph };
    }
    // v1 ratified mentions as plain text, not chips: the editor stores the
    // bare `@name` / `#channel` spelling, which the parser would call a
    // mention node. They are observationally equivalent — compare on the
    // spelled form.
    if (n.type === "MENTION_USER" || n.type === "MENTION_CHANNEL") {
      const prefix = n.type === "MENTION_USER" ? "@" : "#";
      return {
        type: "PLAIN_TEXT",
        value: prefix + (n.value as { value: string }).value,
      };
    }
    if (n.type === "CODE") {
      (n as Record<string, unknown>).language =
        (n as Record<string, unknown>).language === "none"
          ? undefined
          : (n as Record<string, unknown>).language;
    }
    const out: Record<string, unknown> = { type: n.type };
    for (const [key, val] of Object.entries(n as Record<string, unknown>)) {
      if (val === undefined || key === "type") continue;
      out[key] =
        val === null || typeof val !== "object" ? val : norm(val);
    }
    return out;
  }

  it.each(corpus)("%s → doc → AST matches the parsed AST", (source) => {
    const ast: Root = parse(source, { emoticons: true, colors: true });
    const doc = astToDoc(ast);
    const back: Root = pmToAst(doc);
    expect(norm(back)).toEqual(norm(ast));
  });

  it("produces editable text content for a paragraph", () => {
    const ast: Root = parse("hello *world*", {
      emoticons: true,
      colors: true,
    });
    const doc = astToDoc(ast);
    expect(doc.type).toBe("doc");
    const para = doc.content?.[0];
    expect(para?.type).toBe("paragraph");
    // The bold word carries the bold mark; plain text has none.
    const texts = (para?.content ?? []).filter((c) => c.type === "text");
    expect(texts.map((t) => t.text)).toEqual(["hello ", "world"]);
    expect(texts[1]?.marks?.map((m) => m.type)).toContain("bold");
  });

  it("renders a blank line as an empty paragraph between paragraphs", () => {
    const ast: Root = parse("one\n\ntwo", { emoticons: true, colors: true });
    const doc = astToDoc(ast);
    const types = (doc.content ?? []).map((b) => b.type);
    // The middle block is a paragraph node carrying a hardBreak tail OR an
    // empty paragraph — either encodes the blank line for pmToAst; we accept
    // what the implementation chose, but forbid losing the gap:
    expect(types.length).toBeGreaterThanOrEqual(3);
    // And the composed invariant must hold (already covered, but spell out
    // the gap is preserved:
    const back = pmToAst(doc);
    expect(back.map((b) => b.type)).toEqual([
      "PARAGRAPH",
      "LINE_BREAK",
      "PARAGRAPH",
    ]);
  });

  it("idempotent through serialize(parse(S)) markup (editor → send)", () => {
    for (const source of corpus) {
      const ast: Root = parse(source, { emoticons: true, colors: true });
      const markup = serialize(pmToAst(astToDoc(ast)));
      // The markup the editor would send is a fixed point.
      expect(serialize(parse(markup, { emoticons: true, colors: true }))).toBe(
        markup
      );
    }
  });
});
