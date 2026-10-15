import type { Inlines, Root } from "@rocket.chat/message-parser";
import { emojiByShortcode } from "./emoji-map";

/**
 * Converts a TipTap (ProseMirror) document — as JSON, DOM-free — into a
 * Rocket.Chat message AST for the serializer.
 *
 * Structural mapping (ratified v1 scope):
 * - paragraph            → PARAGRAPH; a hardBreak node (shift+enter) or an
 *                           empty paragraph splits it, each blank line
 *                           becoming a block-level LINE_BREAK (Q8: shift+enter
 *                           IS a blank line in Rocket.Chat terms)
 * - heading (1–4)        → HEADING
 * - bulletList / listItem   → UNORDERED_LIST (flat — Q9)
 * - orderedList / listItem  → ORDERED_LIST (honors `start`)
 * - taskList / taskItem     → TASKS (honors `checked`)
 * - codeBlock            → CODE (honors `language`; null → none)
 * - blockquote           → QUOTE
 * - text marks           → BOLD / ITALIC / STRIKE / INLINE_CODE / LINK;
 *                           marks stack into nested emphasis in document
 *                           order (no self-nesting — the parser forbids it)
 * - a glyph in text      → EMOJI (unicode form; the serializer then picks
 *                           the canonical shortcode)
 *
 * Defensive degradations: underline is dropped (v2), inline code wins over
 * other marks (the parser's code node carries plain text only), unknown
 * nodes are skipped.
 */

/* TipTap's JSON shape (the subset we rely on). */
export type PMMark = { type: string; attrs?: Record<string, unknown> | null };
export type PMNode = {
  type: string;
  attrs?: Record<string, unknown> | null;
  text?: string;
  content?: PMNode[] | null;
  marks?: PMMark[];
};
export type PMDoc = { type: "doc"; content?: PMNode[] | null };

export function pmToAst(doc: PMDoc): Root {
  const mapped = mapBlocks(doc.content ?? []);

  // Parser-shape normalization: the Rocket.Chat parser ALWAYS emits a
  // LINE_BREAK between a heading or a code block and the next content block
  // (verified: `# H1\na` → [H, LB, P]; "```\nx\n```\na" → [C, LB, P]),
  // whereas paragraphs/lists/quotes absorb the line ending. Insert the same
  // breaks so the AST matches what the parser would produce.
  const normalized: Root[number][] = [];
  mapped.forEach((block, i) => {
    normalized.push(block);
    if (
      i < mapped.length - 1 &&
      mapped[i + 1].type !== "LINE_BREAK" &&
      (block.type === "HEADING" || block.type === "CODE")
    ) {
      normalized.push({ type: "LINE_BREAK", value: undefined });
    }
  });
  // A lone LINE_BREAK (the initial-document state) is no message at all.
  if (
    mapped.length === 1 &&
    mapped[0].type === "LINE_BREAK"
  ) {
    return [];
  }
  // A lone paragraph made only of emoji is the root BIG_EMOJI shape.
  if (mapped.length === 1 && mapped[0].type === "PARAGRAPH") {
    const inlines = mapped[0].value;
    if (
      inlines.length > 0 &&
      inlines.length <= 3 &&
      inlines.every((n) => n.type === "EMOJI")
    ) {
      // The parser only emits this root for 1–3 emoji on a line.
      const value = (inlines as Array<{ type: "EMOJI"; value: unknown; unicode?: string }>).slice(
        0,
        3
      );
      return [{ type: "BIG_EMOJI", value: value as never }];
    }
  }
  // The invariant above guarantees the array is either all content blocks or
  // a lone big-emoji root — one of the two `Root` shapes exactly.
  return normalized as Root;
}

/* ---------- blocks ---------- */

function mapBlocks(nodes: PMNode[]): Root[number][] {
  const out: Root[number][] = [];
  for (const node of nodes) {
    out.push(...mapBlock(node));
  }
  return out;
}

function mapBlock(node: PMNode): Root[number][] {
  switch (node.type) {
    case "paragraph":
      return mapParagraph(node);
    case "heading": {
      const level = clampHeadingLevel(node.attrs?.level);
      // The parser admits only plain text in a heading, so emphatic inlines
      // degrade to their text (documented lossiness).
      const value: Array<{ type: "PLAIN_TEXT"; value: string }> = (
        node.content ?? []
      ).flatMap((child) =>
        child.type === "text"
          ? [{ type: "PLAIN_TEXT", value: child.text ?? "" } satisfies {
              type: "PLAIN_TEXT";
              value: string;
            }]
          : []
      );
      return [{ type: "HEADING", level, value }];
    }
    case "codeBlock": {
      const language = node.attrs?.language;
      const lines = textOf(node).split("\n");
      return [
        {
          type: "CODE",
          language:
            typeof language === "string" && language.length > 0
              ? language
              : undefined,
          value: lines.map((line) => ({
            type: "CODE_LINE",
            value: { type: "PLAIN_TEXT", value: line },
          })),
        },
      ];
    }
    case "blockquote":
      return [
        {
          type: "QUOTE",
          value: mapBlocks(node.content ?? []).filter(
            (b): b is Extract<Root[number], { type: "PARAGRAPH" }> =>
              b.type === "PARAGRAPH"
          ),
        },
      ];
    case "bulletList":
      return [{ type: "UNORDERED_LIST", value: listItems(node) }];
    case "orderedList": {
      const start = numberOr(node.attrs?.start, 1);
      return [
        {
          type: "ORDERED_LIST",
          value: listItems(node).map((item, index) => ({
            ...item,
            number: item.number ?? start + index,
          })),
        },
      ];
    }
    case "taskList":
      return [{ type: "TASKS", value: taskItems(node) }];
    default:
      // horizontalRule, unsupported nodes: no faithful v1 representation,
      // and none of these can arise from the composer's toolbar. Skip.
      return [];
  }
}

/**
 * A paragraph whose inlines contain hardBreak nodes splits into several
 * blocks: each break becomes a block-level LINE_BREAK, each segment a
 * PARAGRAPH, and empty segments contribute nothing beyond the break that
 * bounds them. This reproduces the parser's shapes exactly (verified:
 * `a\nb` → P,P; `a\n\nb` → P,LINE_BREAK,P; `a\n\n\nb` → P,LB,LB,P).
 * An entirely empty paragraph is therefore one LINE_BREAK — which is also
 * how the composer models a deliberately blank line.
 */
function mapParagraph(node: PMNode): Root[number][] {
  const segments: Inlines[][] = [[]];
  for (const child of node.content ?? []) {
    if (child.type === "hardBreak") {
      segments.push([]);
      continue;
    }
    segments[segments.length - 1].push(...mapInline(child));
  }

  const emptyIndex = segments.map((s, i) => (s.length > 0 ? i : -1)).filter((i) => i >= 0);
  const out: Root[number][] = [];
  const real = emptyIndex.length > 0 ? emptyIndex : null;

  if (real === null) {
    // Nothing but blank lines: every segment is one LINE_BREAK.
    for (let i = 0; i < segments.length; i++) {
      out.push({ type: "LINE_BREAK", value: undefined });
    }
    return out;
  }

  // Leading blank segments (visible blank lines before the first text).
  for (let i = 0; i < real[0]; i++) {
    out.push({ type: "LINE_BREAK", value: undefined });
  }
  // Real segments, with one LINE_BREAK per intervening blank segment.
  real.forEach((idx, position) => {
    if (position > 0) {
      const prevIdx = real[position - 1];
      for (let i = prevIdx + 1; i < idx; i++) {
        out.push({ type: "LINE_BREAK", value: undefined });
      }
    }
    out.push({ type: "PARAGRAPH", value: segments[idx] });
  });
  // Trailing blank segments.
  for (let i = real[real.length - 1] + 1; i < segments.length; i++) {
    out.push({ type: "LINE_BREAK", value: undefined });
  }
  return out;
}

function listItems(
  list: PMNode
): Array<{ type: "LIST_ITEM"; value: Inlines[]; number?: number }> {
  return (list.content ?? [])
    .filter((item) => item.type === "listItem")
    .map((item) => ({
      type: "LIST_ITEM" as const,
      value: flattenItemInlines(item),
    }));
}

function taskItems(list: PMNode): Array<{ type: "TASK"; status: boolean; value: Inlines[] }> {
  return (list.content ?? [])
    .filter((item) => item.type === "taskItem")
    .map((item) => ({
      type: "TASK" as const,
      status: item.attrs?.checked === true,
      value: flattenItemInlines(item),
    }));
}

/** A list item wraps its real content in a (single) paragraph. */
function flattenItemInlines(item: PMNode): Inlines[] {
  const inlines: Inlines[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      inlines.push(...mapInlines(child.content ?? []));
    }
  }
  return inlines;
}

/* ---------- inlines ---------- */

function mapInlines(nodes: PMNode[]): Inlines[] {
  const out: Inlines[] = [];
  for (const node of nodes) {
    out.push(...mapInline(node));
  }
  return mergeAdjacent(out);
}

function mapInline(node: PMNode): Inlines[] {
  if (node.type !== "text") {
    return [];
  }
  const marks = node.marks ?? [];
  const markTypes = marks.map((m) => m.type);
  const linkAttrs = marks.find((m) => m.type === "link")?.attrs;

  const out: Inlines[] = [];
  for (const [piece, isEmoji] of splitGlyphs(node.text ?? "")) {
    if (markTypes.includes("code")) {
      // Inline code wins: the parser's code node carries plain text only.
      out.push({ type: "INLINE_CODE", value: { type: "PLAIN_TEXT", value: piece } });
      continue;
    }
    const leaf = emojiLeaf(piece, isEmoji);
    const emphases = markTypes.filter(
      (t) => t === "bold" || t === "italic" || t === "strike"
    );
    if (markTypes.includes("link")) {
      out.push(linkLeaf(piece, isEmoji, linkAttrs));
      continue;
    }
    out.push(nest(emphases, leaf));
  }
  return out;
}

// Leaves that `nest` can emit from PM marks: plain text, emoji, or link
// (there is no PM mark that yields a spoiler).
type NestableLeaf = Extract<
  Inlines,
  { type: "PLAIN_TEXT" } | { type: "EMOJI" } | { type: "LINK" }
>;

function nest(markStack: string[], leaf: NestableLeaf): Inlines {
  // TipTap orders marks outermost-first. Mark overlap is legal in the doc
  // (bold+strike, strike-in-strike); the parser's type definitions forbid
  // some overlaps, so the assembled tree is relaxed at the return.
  let node: Inlines = leaf;
  for (const mark of [...markStack].reverse()) {
    if (mark === "bold") {
      node = { type: "BOLD", value: [node] } as unknown as Inlines;
    } else if (mark === "italic") {
      node = { type: "ITALIC", value: [node] } as unknown as Inlines;
    } else if (mark === "strike") {
      node = { type: "STRIKE", value: [node] } as unknown as Inlines;
    }
  }
  return node;
}

function emojiLeaf(piece: string, isEmoji: boolean): NestableLeaf {
  if (isEmoji) {
    return { type: "EMOJI", value: undefined, unicode: piece } as NestableLeaf;
  }
  return { type: "PLAIN_TEXT", value: piece } as NestableLeaf;
}

function linkLeaf(
  piece: string,
  isEmoji: boolean,
  attrs: Record<string, unknown> | null | undefined
): NestableLeaf {
  const label = emojiLeaf(piece, isEmoji);
  return {
    type: "LINK",
    value: {
      src: {
        type: "PLAIN_TEXT",
        value: typeof attrs?.href === "string" ? attrs.href : "",
      },
      label: [label],
    },
  } as NestableLeaf;
}

/* Split text into [piece, isEmoji] runs: each grapheme the bundled emoji
   map knows becomes a discrete EMOJI node, everything else stays text.
   ZWJ / modifier sequences are not in the map, so they remain literal
   text — never guessed. */
function splitGlyphs(text: string): Array<[string, boolean]> {
  if (!text) {
    return [];
  }
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter("en", {
      granularity: "grapheme",
    }).segment(text);
    const out: Array<[string, boolean]> = [];
    let buf = "";
    const flushText = () => {
      if (buf) {
        out.push([buf, false]);
        buf = "";
      }
    };
    for (const seg of segments) {
      if (glyphSet().has(seg.segment)) {
        flushText();
        out.push([seg.segment, true]);
      } else {
        buf += seg.segment;
      }
    }
    flushText();
    return out;
  }
  // Fallback (no Intl.Segmenter): code-point scan; an astral code point is
  // itself a single character, so this is correct for BMP and emoji.
  const out: Array<[string, boolean]> = [];
  let buf = "";
  for (const cp of Array.from(text)) {
    if (glyphSet().has(cp)) {
      if (buf) {
        out.push([buf, false]);
        buf = "";
      }
      out.push([cp, true]);
    } else {
      buf += cp;
    }
  }
  if (buf) {
    out.push([buf, false]);
  }
  return out;
}

let glyphCache: Set<string> | null = null;
function glyphSet(): Set<string> {
  if (!glyphCache) {
    glyphCache = new Set(Object.values(emojiByShortcode));
  }
  return glyphCache;
}

/* Merge adjacent inlines that the parser would re-join anyway, so the
   serializer emits one delimited span instead of touching delimiters back
   to back (e.g. `*a**b*`): plain texts concat, single-leaf emphasis of the
   same kind concats its leaf, links with the same target merge their
   labels. */
function mergeAdjacent(inlines: Inlines[]): Inlines[] {
  const out: Inlines[] = [];
  for (const node of inlines) {
    const prev = out[out.length - 1];
    if (prev === undefined) {
      out.push(node);
      continue;
    }
    if (
      prev.type === "PLAIN_TEXT" &&
      node.type === "PLAIN_TEXT"
    ) {
      prev.value += node.value;
      continue;
    }
    if (
      (prev.type === "BOLD" || prev.type === "ITALIC" || prev.type === "STRIKE") &&
      prev.type === node.type &&
      prev.value.length === 1 &&
      prev.value[0].type === "PLAIN_TEXT" &&
      node.value.length === 1 &&
      node.value[0].type === "PLAIN_TEXT"
    ) {
      prev.value = [
        { type: "PLAIN_TEXT", value: prev.value[0].value + node.value[0].value },
      ];
      continue;
    }
    if (
      prev.type === "LINK" &&
      node.type === "LINK" &&
      prev.value.src.value === node.value.src.value
    ) {
      prev.value.label = [
        ...(Array.isArray(prev.value.label) ? prev.value.label : [prev.value.label]),
        ...(Array.isArray(node.value.label) ? node.value.label : [node.value.label]),
      ];
      continue;
    }
    out.push(node);
  }
  return out;
}

/* ---------- helpers ---------- */

function clampHeadingLevel(level: unknown): 1 | 2 | 3 | 4 {
  const n = numberOr(level, 1);
  return Math.min(4, Math.max(1, n)) as 1 | 2 | 3 | 4;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textOf(node: PMNode): string {
  const parts: string[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "text") {
      parts.push(child.text ?? "");
    } else if (child.type === "hardBreak") {
      // A hardBreak inside a code block is a plain newline in the text.
      parts.push("\n");
    }
  }
  return parts.join("");
}
