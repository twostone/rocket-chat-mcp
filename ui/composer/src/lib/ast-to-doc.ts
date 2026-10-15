import type { Inlines, Root } from "@rocket.chat/message-parser";
import type { PMDoc, PMNode } from "./pm-to-ast";
import { emojiByShortcode } from "./emoji-map";

/**
 * Inverse of `pmToAst`: turns a Rocket.Chat message AST (typically the result
 * of `parse` of a received draft) into a TipTap/ProseMirror doc for the
 * editor.
 *
 * The composed invariant: `pmToAst(astToDoc(S-ast))` is structurally equal
 * to `S-ast` (modulo emoji shortcode/unicode form), so the markup the
 * editor sends is exactly what the serializer produces for the draft —
 * "what you see is what you send".
 *
 * Encoding choices (mirroring pmToAst's expectations):
 * - one empty paragraph per LINE_BREAK (pmToAst: empty paragraph ⇔ break)
 * - code block lines are separated by hardBreak nodes
 * - emoji are the UNICODE GLYPH in the text (pmToAst re-detects the glyph)
 * - lossy inlines degrade to their text, same as the serializer
 */

interface Piece {
  text: string;
  marks: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export function astToDoc(root: Root): PMDoc {
  // A big-emoji-only message is one paragraph of the glyph string.
  if (root.length === 1 && root[0].type === "BIG_EMOJI") {
    const pieces = root[0].value
      .map(emojiToPiece)
      .filter((p) => p.text.length > 0);
    const content: PMNode[] = pieces.map((p) => ({
      type: "text",
      text: p.text,
      marks: p.marks.length ? p.marks : undefined,
    }));
    return { type: "doc", content: [{ type: "paragraph", content }] };
  }

  const content: PMNode[] = [];
  for (const block of root) {
    if (block.type === "LINE_BREAK") {
      // A blank line in Rocket.Chat terms is an empty paragraph here (the
      // inverse of pmToAst, which maps an empty paragraph to a LINE_BREAK).
      content.push({ type: "paragraph" });
      continue;
    }
    content.push(...mapBlock(block));
  }
  return { type: "doc", content };
}

type Block = Exclude<Root[number], { type: "LINE_BREAK" }>;

function mapBlock(block: Block): PMNode[] {
  switch (block.type) {
    case "PARAGRAPH":
      return [paragraphFromInlines(inlinesToPieces(block.value).map(pieceNode))];
    case "HEADING":
      return [
        {
          type: "heading",
          attrs: { level: block.level },
          content: inlinesToPieces(block.value).map(pieceNode),
        },
      ];
    case "CODE": {
      const lines: PMNode[] = [];
      block.value.forEach((line, i) => {
        if (i > 0) {
          lines.push({ type: "hardBreak" });
        }
        lines.push({ type: "text", text: line.value.value });
      });
      return [
        {
          type: "codeBlock",
          attrs: { language: block.language ?? null },
          content: lines,
        },
      ];
    }
    case "QUOTE":
      return [
        {
          type: "blockquote",
          content: block.value.map((p) =>
            paragraphFromInlines(inlinesToPieces(p.value).map(pieceNode))
          ),
        },
      ];
    case "UNORDERED_LIST":
      return [
        {
          type: "bulletList",
          content: block.value.map(listItemFromInlines),
        },
      ];
    case "ORDERED_LIST": {
      const numbers = block.value
        .map((item) => item.number)
        .filter((n): n is number => typeof n === "number");
      const start = numbers.length > 0 ? Math.min(...numbers) : 1;
      return [
        {
          type: "orderedList",
          attrs: { start },
          content: block.value.map(listItemFromInlines),
        },
      ];
    }
    case "TASKS":
      return [
        {
          type: "taskList",
          content: block.value.map((task) => ({
            type: "taskItem",
            attrs: { checked: task.status },
            content: [paragraphFromInlines(inlinesToPieces(task.value).map(pieceNode))],
          })),
        },
      ];
    case "SPOILER_BLOCK":
      // Degraded (ratified Q10): the concealed paragraphs become plain
      // paragraphs, preserving their text and relative order.
      return block.value.map((p) =>
        paragraphFromInlines(inlinesToPieces(p.value).map(pieceNode))
      );
    default:
      return [{ type: "paragraph" }];
  }
}

function listItemFromInlines(item: { value: Inlines[] }): PMNode {
  return {
    type: "listItem",
    content: [paragraphFromInlines(inlinesToPieces(item.value).map(pieceNode))],
  };
}

function paragraphFromInlines(content: PMNode[]): PMNode {
  return { type: "paragraph", content };
}

function pieceNode(piece: Piece): PMNode {
  return {
    type: "text",
    text: piece.text,
    marks: piece.marks.length ? piece.marks : undefined,
  };
}

/** Flattens inline nodes into text pieces carrying their mark stack. */
function inlinesToPieces(inlines: Inlines[]): Piece[] {
  const out: Piece[] = [];
  for (const inline of inlines) {
    flattenInline(inline, [], out);
  }
  return mergePieces(out);
}

// Inlines plus the block-level KaTeX node, which the flattener must also
// degrade (defensive: declared unions exclude it, parsed trees carry it).
type FlatInline = Inlines | { type: "KATEX"; value: string };

function flattenInline(
  node: FlatInline,
  marks: Piece["marks"],
  out: Piece[]
): void {
  switch (node.type) {
    case "PLAIN_TEXT":
      out.push({ text: node.value, marks });
      break;
    case "EMOJI":
      out.push({ text: emojiToPiece(node).text, marks });
      break;
    case "BOLD":
      for (const child of node.value) {
        flattenInline(child, [...marks, { type: "bold" }], out);
      }
      break;
    case "ITALIC":
      for (const child of node.value) {
        flattenInline(child, [...marks, { type: "italic" }], out);
      }
      break;
    case "STRIKE":
      for (const child of node.value) {
        flattenInline(child, [...marks, { type: "strike" }], out);
      }
      break;
    case "INLINE_CODE":
      out.push({ text: node.value.value, marks: [...marks, { type: "code" }] });
      break;
    case "LINK": {
      const href = node.value.src.value;
      // The declared label type excludes emoji, but a parsed label can carry
      // one — render whatever text we can, degrade the rest (ratified Q10).
      const labelItems = (
        Array.isArray(node.value.label)
          ? node.value.label
          : [node.value.label]
      ) as unknown as Inlines[];
      const labelText = labelItems
        .map((l) => {
          switch (l.type) {
            case "PLAIN_TEXT":
              return l.value;
            case "EMOJI":
              return emojiToPiece(l).text;
            default:
              return "";
          }
        })
        .join("");
      out.push({
        text: labelText,
        marks: [...marks, { type: "link", attrs: { href } }],
      });
      break;
    }
    case "MENTION_USER":
      out.push({ text: `@${node.value.value}`, marks });
      break;
    case "MENTION_CHANNEL":
      out.push({ text: `#${node.value.value}`, marks });
      break;
    // Lossy degradations (ratified Q10) — text kept, styling dropped.
    case "COLOR":
      out.push({ text: "", marks });
      break;
    case "INLINE_KATEX":
    case "KATEX":
      out.push({ text: node.value, marks });
      break;
    case "SPOILER":
      for (const child of node.value) {
        flattenInline(child, marks, out);
      }
      break;
    case "IMAGE":
      out.push({
        text:
          (Array.isArray(node.value.label)
            ? node.value.label
            : [node.value.label])
              .map((l) =>
                l.type === "PLAIN_TEXT" ? l.value : emojiToPiece(l).text
              )
              .join(""),
        marks,
      });
      break;
    case "TIMESTAMP":
      // 0.32: the fallback may be a Plain node or a SourceRange tuple
      // (an array — use it as the discriminator; tuples have no `type`).
      if (!Array.isArray(node.fallback) && node.fallback) {
        out.push({
          text: node.fallback.type === "PLAIN_TEXT" ? node.fallback.value : "",
          marks,
        });
      }
      break;
    default:
      break;
  }
}

function emojiToPiece(node: {
  type: "EMOJI";
  value: unknown;
  shortCode?: string;
  unicode?: string;
}): Piece {
  const glyph =
    typeof node.value === "undefined" && "unicode" in node
      ? node.unicode
      : node.shortCode
        ? emojiByShortcode[node.shortCode]
        : undefined;
  // A glyph the bundled map cannot render as text stays as the (possibly
  // empty) shortcode text — the editor must never fabricate characters.
  return { text: (glyph ?? node.shortCode ?? "") as string, marks: [] };
}

/** Coalesces adjacent pieces with identical mark stacks. */
function mergePieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    if (!piece.text) {
      continue;
    }
    const prev = out[out.length - 1];
    if (
      prev &&
      sameMarks(prev.marks, piece.marks) &&
      sameLinkAttrs(prev.marks, piece.marks)
    ) {
      prev.text += piece.text;
      continue;
    }
    out.push({ ...piece, marks: [...piece.marks] });
  }
  return out;
}

function sameMarks(
  a: Piece["marks"],
  b: Piece["marks"]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((m, i) => m.type === b[i].type);
}

function sameLinkAttrs(
  a: Piece["marks"],
  b: Piece["marks"]
): boolean {
  const la = a.find((m) => m.type === "link");
  const lb = b.find((m) => m.type === "link");
  if ((la === undefined) !== (lb === undefined)) {
    return false;
  }
  if (la && lb) {
    return la.attrs?.href === lb.attrs?.href;
  }
  return true;
}
