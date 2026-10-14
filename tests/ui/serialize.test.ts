import { describe, it, expect } from "vitest";
import { parse } from "@rocket.chat/message-parser";
import type { Root } from "@rocket.chat/message-parser";
import { emojiByShortcode } from "../../ui/composer/src/lib/emoji-map";
import { serialize } from "../../ui/composer/src/lib/serialize";

describe("serialize (AST → Rocket.Chat markup)", () => {
  it("serializes a paragraph containing an emoji to its shortcode", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          {
            type: "EMOJI" as const,
            value: { type: "PLAIN_TEXT" as const, value: "fire" },
            shortCode: "fire",
          },
        ],
      },
    ];
    expect(serialize(ast)).toBe(":fire:");
  });

  it("escapes the inline delimiters inside plain text", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          { type: "PLAIN_TEXT" as const, value: "a*b_c~d~e`f" },
        ],
      },
    ];
    expect(serialize(ast)).toBe("a\\*b\\_c\\~d\\~e\\`f");
  });

  it("serializes emphasis with canonical delimiters", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          {
            type: "BOLD" as const,
            value: [{ type: "PLAIN_TEXT" as const, value: "bold" }],
          },
          { type: "PLAIN_TEXT" as const, value: " " },
          {
            type: "ITALIC" as const,
            value: [{ type: "PLAIN_TEXT" as const, value: "italic" }],
          },
          { type: "PLAIN_TEXT" as const, value: " " },
          {
            type: "STRIKE" as const,
            value: [{ type: "PLAIN_TEXT" as const, value: "gone" }],
          },
        ],
      },
    ];
    expect(serialize(ast)).toBe("*bold* _italic_ ~~gone~~");
  });

  it("serializes italic nested inside bold", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          {
            type: "BOLD" as const,
            value: [
              {
                type: "ITALIC" as const,
                value: [{ type: "PLAIN_TEXT" as const, value: "bi" }],
              },
            ],
          },
        ],
      },
    ];
    expect(serialize(ast)).toBe("*_bi_*");
  });

  it("serializes a link as bare url when label equals url without spaces", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          {
            type: "LINK" as const,
            value: {
              src: { type: "PLAIN_TEXT" as const, value: "https://example.com" },
              label: [{ type: "PLAIN_TEXT" as const, value: "https://example.com" }],
            },
          },
        ],
      },
    ];
    expect(serialize(ast)).toBe("https://example.com");
  });

  it("serializes a labelled link as markdown, encoding spaces in the url", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          {
            type: "LINK" as const,
            value: {
              src: { type: "PLAIN_TEXT" as const, value: "https://example.com/a b" },
              label: [{ type: "PLAIN_TEXT" as const, value: "site" }],
            },
          },
        ],
      },
    ];
    // Raw spaces (and `\`-escaped ones) make the parser fall back to
    // plain text; percent-encoding round-trips to the same destination.
    expect(serialize(ast)).toBe("[site](https://example.com/a%20b)");
    const reparse = parse(serialize(ast));
    expect(reparse).toHaveLength(1);
    expect(reparse[0]).toMatchObject({ type: "PARAGRAPH" });
  });

  it("serializes inline code with backticks", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [{ type: "INLINE_CODE" as const, value: { type: "PLAIN_TEXT" as const, value: "npm install" } }],
      },
    ];
    expect(serialize(ast)).toBe("`npm install`");
  });

  it("serializes a LINE_BREAK between paragraphs as a blank line", () => {
    // Verified: `a\nb` parses to two PARAGRAPHs, `a\n\nb` inserts LINE_BREAK.
    const ast = [
      { type: "PARAGRAPH" as const, value: [{ type: "PLAIN_TEXT" as const, value: "a" }] },
      { type: "LINE_BREAK" as const, value: undefined },
      { type: "PARAGRAPH" as const, value: [{ type: "PLAIN_TEXT" as const, value: "b" }] },
    ];
    expect(serialize(ast)).toBe("a\n\nb");
  });

  it("serializes headings with their level", () => {
    const ast = [
      { type: "HEADING" as const, level: 1, value: [{ type: "PLAIN_TEXT" as const, value: "Title" }] },
      { type: "HEADING" as const, level: 4, value: [{ type: "PLAIN_TEXT" as const, value: "Deep" }] },
    ];
    expect(serialize(ast)).toBe("# Title\n#### Deep");
  });

  it("serializes a fenced code block with a language", () => {
    const ast = [
      {
        type: "CODE" as const,
        language: "js",
        value: [{ type: "CODE_LINE" as const, value: { type: "PLAIN_TEXT" as const, value: "const x = 1;" } }],
      },
    ];
    expect(serialize(ast)).toBe("```js\nconst x = 1;\n```");
  });

  it("uses a normal fence; an inner fence line degrades the same way RC parses it", () => {
    // Ratified correction: wider fences break RC's parser, and RC's own parser
    // cannot represent ``` inside a code block. The serializer emits a normal
    // fence; any inner ``` degrades on re-parse exactly as it would if the
    // user had typed it — loss is intrinsic to Rocket.Chat, not ours.
    const ast = [
      {
        type: "CODE" as const,
        language: undefined,
        value: [
          { type: "CODE_LINE" as const, value: { type: "PLAIN_TEXT" as const, value: "```" } },
          { type: "CODE_LINE" as const, value: { type: "PLAIN_TEXT" as const, value: "still code" } },
        ],
      },
    ];
    expect(serialize(ast)).toBe("```\n```\nstill code\n```");
    // And the emitted text parses to the documented degraded shape (verified
    // against the parser — pinning it so no future change alters the
    // user-visible behaviour of such a message).
    const ours = parse(serialize(ast), { emoticons: true, colors: true });
    expect(ours).toEqual([
      { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "```" }] },
      {
        type: "CODE",
        language: "none",
        value: [
          { type: "CODE_LINE", value: { type: "PLAIN_TEXT", value: "still code" } },
        ],
      },
    ]);
  });

  it("serializes a quote by prefixing each contained paragraph", () => {
    const ast = [
      {
        type: "QUOTE" as const,
        value: [
          { type: "PARAGRAPH" as const, value: [{ type: "PLAIN_TEXT" as const, value: "one" }] },
          { type: "PARAGRAPH" as const, value: [{ type: "PLAIN_TEXT" as const, value: "two" }] },
        ],
      },
    ];
    expect(serialize(ast)).toBe("> one\n> two");
  });

  it("serializes flat unordered and ordered lists", () => {
    const ast = [
      {
        type: "UNORDERED_LIST" as const,
        value: [
          { type: "LIST_ITEM" as const, value: [{ type: "PLAIN_TEXT" as const, value: "one" }] },
          { type: "LIST_ITEM" as const, value: [{ type: "PLAIN_TEXT" as const, value: "two" }] },
        ],
      },
      {
        type: "ORDERED_LIST" as const,
        value: [
          { type: "LIST_ITEM" as const, number: 1, value: [{ type: "PLAIN_TEXT" as const, value: "a" }] },
          { type: "LIST_ITEM" as const, number: 2, value: [{ type: "PLAIN_TEXT" as const, value: "b" }] },
        ],
      },
    ];
    expect(serialize(ast)).toBe("- one\n- two\n1. a\n2. b");
  });

  it("serializes task lists with checkbox state", () => {
    const ast = [
      {
        type: "TASKS" as const,
        value: [
          { type: "TASK" as const, status: true, value: [{ type: "PLAIN_TEXT" as const, value: "done" }] },
          { type: "TASK" as const, status: false, value: [{ type: "PLAIN_TEXT" as const, value: "todo" }] },
        ],
      },
    ];
    expect(serialize(ast)).toBe("- [x] done\n- [ ] todo");
  });

  it("degrades lossy inline nodes to their text (Q10)", () => {
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          { type: "COLOR" as const, value: { r: 255, g: 0, b: 0, a: 255 } },
          { type: "PLAIN_TEXT" as const, value: "colored" },
          { type: "INLINE_KATEX" as const, value: "x^2" },
          {
            type: "SPOILER" as const,
            value: [{ type: "PLAIN_TEXT" as const, value: "secret" }],
          },
          {
            type: "IMAGE" as const,
            value: {
              src: { type: "PLAIN_TEXT" as const, value: "https://img.example/a.png" },
              label: { type: "PLAIN_TEXT" as const, value: "pic" },
            },
          },
        ],
      },
    ];
    // Nothing is deleted; styling that the editor cannot represent is dropped.
    expect(serialize(ast)).toBe("coloredx^2secret pic");
  });

  it("serializes mentions as bare @user / #channel", () => {
    // Ratified v1 scope: mentions are plain text, not chips.
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [
          { type: "MENTION_USER" as const, value: { type: "PLAIN_TEXT" as const, value: "alice" } },
          { type: "PLAIN_TEXT" as const, value: " and " },
          { type: "MENTION_CHANNEL" as const, value: { type: "PLAIN_TEXT" as const, value: "support" } },
          { type: "PLAIN_TEXT" as const, value: " hello" },
        ],
      },
    ];
    expect(serialize(ast)).toBe("@alice and #support hello");
  });

  it("maps a unicode-only inline emoji to its canonical shortcode", () => {
    // Typing/pasting raw unicode produces EMOJI nodes without a shortCode;
    // saving must yield the canonical shortcode (seam 3).
    const ast = [
      {
        type: "PARAGRAPH" as const,
        value: [{ type: "EMOJI" as const, unicode: "🔥" }],
      },
    ];
    expect(serialize(ast)).toBe(":fire:");
  });

  it("keeps unknown glyphs as literal unicode, inline and big", () => {
    // Glyphs the bundled map does not know must never be invented as
    // shortcodes (which Rocket.Chat would render as literal text).
    const unknown = "\uD83D\uDCFF\uFE0F";
    const big: Root = [
      { type: "BIG_EMOJI" as const, value: [{ type: "EMOJI" as const, unicode: unknown }] },
    ];
    expect(serialize(big)).toBe(unknown);
    const inline: Root = [
      { type: "PARAGRAPH" as const, value: [{ type: "EMOJI" as const, unicode: unknown }] },
    ];
    expect(serialize(inline)).toBe(unknown);
  });

  it("degrades a spoiler block to its paragraphs", () => {
    const ast = [
      {
        type: "SPOILER_BLOCK" as const,
        value: [
          { type: "PARAGRAPH" as const, value: [{ type: "PLAIN_TEXT" as const, value: "hidden" }] },
        ],
      },
    ];
    expect(serialize(ast)).toBe("hidden");
  });
});

describe("serialize: big emoji root", () => {
  it("serializes a big emoji line as space-separated shortcodes", () => {
    const ast = [
      {
        type: "BIG_EMOJI" as const,
        value: [
          { type: "EMOJI" as const, value: { type: "PLAIN_TEXT" as const, value: "fire" }, shortCode: "fire" },
          { type: "EMOJI" as const, value: { type: "PLAIN_TEXT" as const, value: "tada" }, shortCode: "tada" },
        ],
      },
    ];
    expect(serialize(ast)).toBe(":fire: :tada:");
  });
});

describe("round-trip invariant: parse(S) ≅ parse(serialize(parse(S)))", () => {
  const corpus = [
    "plain text",
    "*bold* and _ital_ and ~~gone~~",
    "`code` and $x$?",
    "# H1\n## H2\n### H3\n#### H4",
    "- a\n- b\n1. c\n2. d",
    "2. restart numbering",
    "- [x] done\n- [ ] todo",
    "> quoted\n> more",
    "```\ncode line\nsecond\n```",
    "```js\nconst x = 1;\n```",
    "[site](https://example.com)",
    "[label](https://example.com/path?q=1&r=2)",
    "https://example.com/x",
    "mix *bold* and text",
    "emoji :fire: :smile: here",
    ":fire: :tada:",
    "one\n\ntwo",
    "a*b c*d",
    "price$*bold*",
    "escaped \\*literal\\*",
    "underscore __double__ italics",
    "backtick `in` code",
    "tilde ~half~ strike",
    "@alice and #support hello",
    "🔥 and 👋",
    "🚀🚀",
    "🔥big:fire:inline",
  ];

  function normalize(node: unknown): unknown {
    const n = node as { type: string; value?: unknown; fallback?: unknown };
    if (n.type === "EMOJI") {
      // Compare emoji by their observable glyph: a unicode-only node (raw
      // input) and a shortcode node (`:fire:`) are equivalent when they show
      // the same character — the serializer always prefers the canonical
      // shortcode, so the forms legitimately differ.
      const unicode =
        typeof n.value === "undefined" && "unicode" in n
          ? (n as { unicode?: string }).unicode
          : undefined;
      const shortCode =
        typeof n.value !== "undefined"
          ? (n as { shortCode?: string }).shortCode
          : undefined;
      const glyph = unicode ?? (shortCode ? emojiByShortcode[shortCode] : undefined);
      return { type: n.type, glyph };
    }
    const out: Record<string, unknown> = { type: n.type };
    for (const [key, val] of Object.entries(n as Record<string, unknown>)) {
      if (val === undefined || key === "type") continue;
      if (val === null || typeof val !== "object") {
        out[key] = val;
      } else if (Array.isArray(val)) {
        out[key] = val.map(normalize);
      } else {
        out[key] = normalize(val);
      }
    }
    return out;
  }

  it.each(corpus)("%s", (source) => {
    const original = parse(source, { emoticons: true, colors: true });
    const roundTripped = parse(serialize(original), { emoticons: true, colors: true });
    expect(normalize(roundTripped)).toEqual(normalize(original));
  });

  it("is idempotent on its own output", () => {
    for (const source of corpus) {
      const once = serialize(parse(source, { emoticons: true, colors: true }));
      const twice = serialize(parse(once, { emoticons: true, colors: true }));
      expect(twice).toBe(once);
    }
  });
});
