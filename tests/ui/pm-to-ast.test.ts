import { describe, it, expect } from "vitest";
import { parse } from "@rocket.chat/message-parser";
import type { Root } from "@rocket.chat/message-parser";
import { emojiByShortcode } from "../../ui/composer/src/lib/emoji-map";
import { pmToAst } from "../../ui/composer/src/lib/pm-to-ast";
import type { PMDoc } from "../../ui/composer/src/lib/pm-to-ast";
import { serialize } from "../../ui/composer/src/lib/serialize";

type PMMark = { type: string; attrs?: Record<string, unknown> };
type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: PMNode[] | null;
  marks?: PMMark[];
};

const doc = (...content: PMNode[]): PMNode => ({
  type: "doc",
  content,
});
const p = (...inlines: PMNode[]): PMNode => ({ type: "paragraph", content: inlines });
const t = (text: string, ...marks: PMMark[]): PMNode => ({
  type: "text",
  text,
  marks: marks.length ? marks : undefined,
});
const m = (type: string, attrs?: Record<string, unknown>): PMMark => ({ type, attrs });

describe("pmToAst (TipTap JSON → Rocket.Chat AST)", () => {
  it("maps a plain paragraph", () => {
    const ast: Root = pmToAst(doc(p(t("hello world"))));
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [{ type: "PLAIN_TEXT", value: "hello world" }],
      },
    ]);
  });

  it("maps emphasis marks to BOLD / ITALIC / STRIKE", () => {
    const ast: Root = pmToAst(
      doc(p(t("b", m("bold")), t(" "), t("i", m("italic")), t(" "), t("s", m("strike"))))
    );
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [
          { type: "BOLD", value: [{ type: "PLAIN_TEXT", value: "b" }] },
          { type: "PLAIN_TEXT", value: " " },
          { type: "ITALIC", value: [{ type: "PLAIN_TEXT", value: "i" }] },
          { type: "PLAIN_TEXT", value: " " },
          { type: "STRIKE", value: [{ type: "PLAIN_TEXT", value: "s" }] },
        ],
      },
    ]);
  });

  it("nests stacked marks: bold then italic produces BOLD(ITALIC(text))", () => {
    const ast: Root = pmToAst(
      doc(p(t("bi", m("bold"), m("italic"))))
    );
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [
          {
            type: "BOLD",
            value: [
              {
                type: "ITALIC",
                value: [{ type: "PLAIN_TEXT", value: "bi" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("ignores underline (deferred to v2) but keeps the text", () => {
    const ast: Root = pmToAst(doc(p(t("u", m("underline")))));
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [{ type: "PLAIN_TEXT", value: "u" }],
      },
    ]);
  });

  it("maps inline code to INLINE_CODE", () => {
    const ast: Root = pmToAst(doc(p(t("ls -la", m("code")))));
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [
          { type: "INLINE_CODE", value: { type: "PLAIN_TEXT", value: "ls -la" } },
        ],
      },
    ]);
  });

  it("splits text into EMOJI nodes for known glyphs and keeps text between", () => {
    // 🔥 is in the bundled map; a 🫱 (unknown here) stays literal text.
    const ast: Root = pmToAst(doc(p(t("go 🔥 and 🫱 stop"))));
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [
          { type: "PLAIN_TEXT", value: "go " },
          { type: "EMOJI", value: undefined, unicode: "🔥" },
          { type: "PLAIN_TEXT", value: " and 🫱 stop" },
        ],
      },
    ]);
  });

  it("splits a paragraph at hardBreaks into blocks with LINE_BREAKs", () => {
    // Shift+Enter semantics (Q8): a\nb → P,P; a\n\nb → P,LB,P (a blank
    // segment is one break).
    const a1: Root = pmToAst(
      doc(p(t("a"), { type: "hardBreak" }, t("b")))
    );
    expect(a1).toEqual([
      { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "a" }] },
      { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "b" }] },
    ]);
    const a2: Root = pmToAst(
      doc(p(t("a"), { type: "hardBreak" }, { type: "hardBreak" }, t("b")))
    );
    expect(a2).toEqual([
      { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "a" }] },
      { type: "LINE_BREAK", value: undefined },
      { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "b" }] },
    ]);
  });

  it("maps an empty paragraph (initial doc) to no blocks", () => {
    expect(pmToAst(doc(p()))).toEqual([]);
    expect(pmToAst({ type: "doc", content: [] })).toEqual([]);
  });

  it("maps a heading with its level", () => {
    const ast: Root = pmToAst(
      doc({ type: "heading", attrs: { level: 3 }, content: [t("Section")] })
    );
    expect(ast).toEqual([
      {
        type: "HEADING",
        level: 3,
        value: [{ type: "PLAIN_TEXT", value: "Section" }],
      },
    ]);
  });

  it("maps a bullet list (flat) and an ordered list honoring start", () => {
    const ul: Root = pmToAst(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(t("one"))] },
          { type: "listItem", content: [p(t("two"))] },
        ],
      })
    );
    expect(ul).toEqual([
      {
        type: "UNORDERED_LIST",
        value: [
          { type: "LIST_ITEM", value: [{ type: "PLAIN_TEXT", value: "one" }] },
          { type: "LIST_ITEM", value: [{ type: "PLAIN_TEXT", value: "two" }] },
        ],
      },
    ]);

    const ol: Root = pmToAst(
      doc({
        type: "orderedList",
        attrs: { start: 2, type: null },
        content: [
          { type: "listItem", content: [p(t("a"))] },
          { type: "listItem", content: [p(t("b"))] },
        ],
      })
    );
    expect(ol).toEqual([
      {
        type: "ORDERED_LIST",
        value: [
          { type: "LIST_ITEM", number: 2, value: [{ type: "PLAIN_TEXT", value: "a" }] },
          { type: "LIST_ITEM", number: 3, value: [{ type: "PLAIN_TEXT", value: "b" }] },
        ],
      },
    ]);
  });

  it("maps a task list with checkbox state", () => {
    const ast: Root = pmToAst(
      doc({
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [p(t("done"))] },
          { type: "taskItem", attrs: { checked: false }, content: [p(t("todo"))] },
        ],
      })
    );
    expect(ast).toEqual([
      {
        type: "TASKS",
        value: [
          { type: "TASK", status: true, value: [{ type: "PLAIN_TEXT", value: "done" }] },
          { type: "TASK", status: false, value: [{ type: "PLAIN_TEXT", value: "todo" }] },
        ],
      },
    ]);
  });

  it("maps a code block (multiline, language, and language-less)", () => {
    const ast: Root = pmToAst(
      doc({
        type: "codeBlock",
        attrs: { language: "js" },
        content: [
          { type: "text", text: "const x = 1;" },
          { type: "hardBreak" },
          { type: "text", text: "console.log(x);" },
        ],
      })
    );
    expect(ast).toEqual([
      {
        type: "CODE",
        language: "js",
        value: [
          { type: "CODE_LINE", value: { type: "PLAIN_TEXT", value: "const x = 1;" } },
          { type: "CODE_LINE", value: { type: "PLAIN_TEXT", value: "console.log(x);" } },
        ],
      },
    ]);

    const none: Root = pmToAst(
      doc({ type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "x" }] })
    );
    expect(none[0]).toMatchObject({ type: "CODE", language: undefined });
  });

  it("maps a blockquote to a QUOTE of paragraphs", () => {
    const ast: Root = pmToAst(
      doc({
        type: "blockquote",
        content: [p(t("one")), p(t("two"))],
      })
    );
    expect(ast).toEqual([
      {
        type: "QUOTE",
        value: [
          { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "one" }] },
          { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: "two" }] },
        ],
      },
    ]);
  });

  it("maps a link mark to LINK with label and src", () => {
    const ast: Root = pmToAst(
      doc(p(t("site", { type: "link", attrs: { href: "https://e.com/x" } })))
    );
    expect(ast).toEqual([
      {
        type: "PARAGRAPH",
        value: [
          {
            type: "LINK",
            value: {
              src: { type: "PLAIN_TEXT", value: "https://e.com/x" },
              label: [{ type: "PLAIN_TEXT", value: "site" }],
            },
          },
        ],
      },
    ]);
  });

  it("maps a lone all-emoji paragraph to the BIG_EMOJI root shape", () => {
    const ast: Root = pmToAst(doc(p(t("🔥😀"))));
    expect(ast).toEqual([
      {
        type: "BIG_EMOJI",
        value: [
          { type: "EMOJI", value: undefined, unicode: "🔥" },
          { type: "EMOJI", value: undefined, unicode: "😀" },
        ],
      },
    ]);
  });
});

describe("composed invariant: parse(serialize(pmToAst(D))) ≅ pmToAst(D)", () => {
  // Compare by observable shape: emoji nodes compare on glyph (unicode-only
  // vs shortcode forms of the same emoji are equivalent — the serializer
  // normalizes toward the shortcode).
  function norm(node: unknown): unknown {
    const n = node as { type: string; value?: unknown; unicode?: string; shortCode?: string };
    if (n.type === "EMOJI") {
      const glyph =
        n.unicode ?? (n.shortCode ? emojiByShortcode[n.shortCode] : undefined);
      return { type: "EMOJI", glyph };
    }
    if (n.type === "CODE" && n.language === "none") {
      // The parser labels a language-less fence "none"; the mapper leaves
      // language unset — same block. Drop it so the shapes compare equal.
      (n as unknown as Record<string, unknown>).language = undefined;
    }
    const out: Record<string, unknown> = { type: n.type };
    for (const [key, val] of Object.entries(n as Record<string, unknown>)) {
      if (val === undefined || key === "type") continue;
      out[key] =
        val === null || typeof val !== "object"
          ? val
          : Array.isArray(val)
            ? val.map(norm)
            : norm(val);
    }
    return out;
  }

  it("a plain doc", () => {
    check(doc(p(t("hello world"))));
  });
  it("emphasis soup", () => {
    check(
      doc(
        p(
          t("a"),
          t("bold", m("bold")),
          t(" "),
          t("italic", m("italic")),
          t(" "),
          t("struck", m("strike")),
          t(" code", m("code"))
        )
      )
    );
  });
  it("nested bold+italic", () => {
    check(doc(p(t("plain"), t("bi", m("bold"), m("italic")), t(" tail"))));
  });
  it("headings 1..4", () => {
    check(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [t("H1")] },
        { type: "heading", attrs: { level: 4 }, content: [t("H4")] }
      )
    );
  });
  it("lists: bullet, ordered (start 2), tasks", () => {
    check(
      doc(
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [p(t("a"))] },
            { type: "listItem", content: [p(t("b"))] },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 2 },
          content: [
            { type: "listItem", content: [p(t("x"))] },
            { type: "listItem", content: [p(t("y"))] },
          ],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p(t("done"))] },
            { type: "taskItem", attrs: { checked: false }, content: [p(t("todo"))] },
          ],
        }
      )
    );
  });
  it("code block with language + lines", () => {
    check(
      doc({
        type: "codeBlock",
        attrs: { language: "js" },
        content: [
          { type: "text", text: "const x = 1;" },
          { type: "hardBreak" },
          { type: "text", text: "console.log(x);" },
        ],
      })
    );
  });
  it("blockquote", () => {
    check(doc({ type: "blockquote", content: [p(t("quoted text"))] }));
  });
  it("links", () => {
    check(
      doc(
        p(
          t("see "),
          {
            type: "text",
            text: "the site",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
          t(" ok")
        )
      )
    );
  });
  it("emojis mixed with text", () => {
    check(doc(p(t("hot 🔥 and happy 😀 end"))));
  });
  it("single emoji line → big emoji", () => {
    check(doc(p(t("🔥😀🙃"))));
  });
  it("hardBreak = blank line semantics", () => {
    check(doc(p(t("one"), { type: "hardBreak" }, t("two"))));
    check(doc(p(t("one"), { type: "hardBreak" }, { type: "hardBreak" }, t("two"))));
    check(
      doc(
        p(t("a")),
        p(t("b")),
        p(t("c"))
      )
    );
  });
  it("whole kitchen sink", () => {
    check(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [t("Title")] },
        p(t("Intro 🔥 with "), t("bold", m("bold")), t(" and "), t("code", m("code"))),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [p(t("item one"))] }],
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "fn main() {}" }],
        },
        p(t("tail"))
      )
    );
  });

  function check(d: PMDoc) {
    const ast = pmToAst(d);
    const markup = serialize(ast);
    const reparsed = parse(markup, { emoticons: true, colors: true });
    expect(norm(reparsed)).toEqual(norm(ast));
    // Idempotent: the markup is a fixed point.
    expect(serialize(parse(markup, { emoticons: true, colors: true }))).toBe(markup);
  }
});
