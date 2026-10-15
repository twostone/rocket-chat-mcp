import type {
  Inlines,
  Root,
} from "@rocket.chat/message-parser";
import { glyphToShortcode } from "./emoji-canonical";

/**
 * Serializes a Rocket.Chat message AST back into Rocket.Chat markup.
 *
 * The parser (`@rocket.chat/message-parser`) is parse-only, so this module owns
 * the inverse mapping. The governing contract: for every message S,
 * `parse(S)` and `parse(serialize(parse(S)))` are structurally identical, and
 * `serialize` is idempotent on its own output.
 */
export function serialize(root: Root): string {
  if (root.length === 0) {
    return "";
  }
  // A lone big-emoji line is the only root shape that is not a block list.
  if (root.length === 1 && root[0].type === "BIG_EMOJI") {
    return root[0].value
      .map((emoji) => {
        if (typeof emoji.value === "undefined" && "unicode" in emoji) {
          const code = glyphToShortcode(emoji.unicode);
          return code === undefined ? emoji.unicode : `:${code}:`;
        }
        return `:${emoji.shortCode}:`;
      })
      .join(" ");
  }
  if (root.every((block) => block.type === "LINE_BREAK")) {
    return "\n".repeat(root.length);
  }

  // Walk the AST, collecting real blocks and counting the LINE_BREAK runs
  // that precede each one (leading, between, trailing).
  const real: Exclude<Root[number], { type: "LINE_BREAK" }>[] = [];
  const lbsBefore: number[] = [];
  let pending = 0;
  for (const block of root) {
    if (block.type === "LINE_BREAK") {
      pending++;
      continue;
    }
    lbsBefore.push(pending);
    real.push(block);
    pending = 0;
  }
  const trailingLbs = pending;

  let out = "";
  real.forEach((block, i) => {
    if (i > 0) {
      out += "\n".repeat(separatorLength(real[i - 1], lbsBefore[i]));
    } else {
      // Leading blank lines (no preceding block to absorb them): one newline
      // per LINE_BREAK, verified — `"\na"` parses to [LINE_BREAK, PARAGRAPH].
      out += "\n".repeat(lbsBefore[0]);
    }
    out += serializeBlock(block);
  });
  if (trailingLbs > 0) {
    // Mirrors the separator rule: only a code fence's own line ending
    // contributes its break for free, every other block absorbs it.
    const nl = trailingLbs + (isHard(real[real.length - 1]) ? 0 : 1);
    out += "\n".repeat(nl);
  }
  return out;
}

/**
 * Number of newlines required between a block and the following content so
 * the parser reproduces exactly `lbs` LINE_BREAK nodes between them.
 * Verified against parser 0.32: a single line ending after a paragraph, list,
 * (task) list, quote, heading, table or horizontal rule is ABSORBED, so those
 * blocks need `lbs + 1` newlines. Only a code fence is exceptional — its
 * closing line always yields one LINE_BREAK — so it needs exactly `lbs`
 * (the `Math.max` guards synthetic ASTs where a code block is followed by
 * zero recorded breaks).
 */
function separatorLength(previous: Root[number], lbs: number): number {
  const nl = isHard(previous) ? lbs : lbs + 1;
  return Math.max(1, nl);
}

/**
 * All blocks except code fences absorb the single line ending after them
 * (the parser emits no LINE_BREAK for it) — verified against `parse` for the
 * block-type pairs in 0.32 (headings stopped emitting one after bare newlines).
 */
function isHard(block: Root[number]): boolean {
  return block.type === "CODE";
}

function serializeBlock(block: Root[number]): string {
  switch (block.type) {
    case "PARAGRAPH":
      return serializeInlines(block.value as Inlines[]);
    case "HEADING": {
      const hashes = "#".repeat(Math.min(block.level, 4));
      return `${hashes} ${serializeInlines(block.value as Inlines[])}`;
    }
    case "LINE_BREAK":
      // A block separator already contributes one newline; the break itself
      // needs a second one, hence an empty block between two separators.
      return "";
    case "CODE": {
      const language =
        block.language && block.language !== "none" ? block.language : "";
      const body = block.value
        .map((line) => line.value.value)
        .join("\n");
      // A normal ``` fence only: a wider fence does not round-trip (verified —
      // RC's parser cannot represent a fence line inside a code block, and
      // ```` terminates the block early). Inner fences degrade on re-parse,
      // exactly as they would for hand-typed text.
      return "```" + language + "\n" + body + "\n```";
    }
    case "QUOTE": {
      const lines: string[] = [];
      for (const child of block.value) {
        if (child.type === "PARAGRAPH") {
          lines.push("> " + serializeInlines(child.value as Inlines[]));
        } else {
          for (const line of serializeBlock(child).split("\n")) {
            lines.push(line.length > 0 ? `> ${line}` : ">");
          }
        }
      }
      return lines.join("\n");
    }
    case "UNORDERED_LIST":
    case "ORDERED_LIST": {
      return block.value
        .map((item, index) => {
          const body = serializeInlines(item.value as Inlines[]);
          if (block.type === "ORDERED_LIST") {
            const number = item.number ?? index + 1;
            return `${number}. ${body}`;
          }
          return `- ${body}`;
        })
        .join("\n");
    }
    case "TASKS":
      return block.value
        .map((task) => `- [${task.status ? "x" : " "}] ${serializeInlines(task.value as Inlines[])}`)
        .join("\n");
    case "SPOILER_BLOCK":
      // Degraded to plain paragraphs (Q10); paragraphs join with blank lines.
      return block.value.map((p) => serializeInlines(p.value as Inlines[])).join("\n\n");
    default:
      notImplemented(block.type);
  }
}

/**
 * Serializes a run of inline nodes. Emojis are handed the character that
 * follows them, because a shortcode glued to a word character (`:fire:b`)
 * fails to re-parse as an emoji at all (verified) — the glyph itself must be
 * used instead.
 */
function serializeInlines(nodes: Inlines[]): string {
  return nodes
    .map((node, index) => serializeInline(node, nodes[index + 1]))
    .join("");
}

function serializeInline(node: Inlines, next?: Inlines): string {
  switch (node.type) {
    case "PLAIN_TEXT":
      // Always-escape policy (ratified): a bare `*`, `_`, `~`, `` ` `` (or `\`)
      // in plain text could re-pair with a delimiter from a neighbouring node
      // and turn text into unintended markup, so it is always escaped.
      return node.value.replace(/[\\*_~`]/g, "\\$&");
    case "EMOJI": {
      if (typeof node.value !== "undefined" && "shortCode" in node) {
        return `:${node.shortCode}:`;
      }
      // Unicode-only emoji (typed or pasted raw): emit the canonical
      // shortcode — unless the following text begins with a word character,
      // which fuses with the trailing `:` and kills the parse (verified).
      // Unknown glyphs are kept as literal text — never invent shortcodes.
      const code = glyphToShortcode(node.unicode);
      if (code === undefined) {
        return node.unicode;
      }
      return isWordBoundarySafe(next) ? `:${code}:` : node.unicode;
    }
    case "MENTION_USER":
      // Ratified v1 scope: mentions are plain text, not chips.
      return `@${node.value.value}`;
    case "MENTION_CHANNEL":
      return `#${node.value.value}`;
    case "BOLD":
      return `*${serializeInlines(node.value)}*`;
    case "ITALIC":
      return `_${serializeInlines(node.value)}_`;
    case "STRIKE":
      return `~~${serializeInlines(node.value)}~~`;
    case "INLINE_CODE":
      return `\`${node.value.value}\``;
    case "LINK": {
      const src = node.value.src.value;
      const labelParts = Array.isArray(node.value.label)
        ? node.value.label
        : [node.value.label];
      const label = serializeInlines(labelParts);
      // A bare URL (no label, no whitespace) re-parses as an autolink whose
      // label equals the URL, so it is emitted without markdown decoration.
      if (label === src && !/\s/.test(src)) {
        return src;
      }
      return `[${label}](${encodeLinkTarget(src)})`;
    }
    // Lossy degradations (ratified Q10): the editor cannot represent these
    // faithfully and the AST carries no source offsets, so their text is
    // kept and their styling is dropped — nothing is deleted.
    case "COLOR":
      return "";
    case "INLINE_KATEX":
      return node.value;
    case "SPOILER":
      return serializeInlines(node.value);
    case "IMAGE":
      // Leading space mirrors how images sit in prose and keeps the label
      // from gluing onto the preceding word.
      return ` ${serializeInlines([node.value.label])}`;
    case "TIMESTAMP":
      // 0.32: the fallback may be a Plain node or a SourceRange tuple —
      // only the former carries text to emit (arrays discriminate the tuple).
      return !Array.isArray(node.fallback) && node.fallback
        ? serializeInline(node.fallback)
        : "";
    default:
      // The declared union is exhaustive for every producible AST; a block-
      // level node leaking in is a programmer error, so this is unreachable.
      notImplemented((node as { type: string }).type);
  }
}

// Spaces (and angle/paren delimiters) in a link target break Rocket.Chat's
// markdown re-parse, so they are percent-encoded. Labels may carry spaces
// freely — only the URL in parentheses needs the encoding.
function encodeLinkTarget(src: string): string {
  return src
    .replace(/%/g, "%25")
    .replace(/ /g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

// Rocket.Chat's parser fuses the trailing colon of a shortcode with a
// following word character (`:fire:b` is parsed as literal text), so a
// unicode-derived shortcode is only safe when the next inline begins with
// whitespace or a symbol. Verified against `parse`.
function isWordBoundarySafe(next: Inlines | undefined): boolean {
  if (next === undefined) {
    return true;
  }
  if (next.type === "PLAIN_TEXT") {
    return /^\s/.test(next.value);
  }
  // Every other node type (markup, links, code, other emoji, ...) either
  // emits a non-alphanumeric opener or cannot fuse.
  return true;
}

function notImplemented(kind: string): never {
  throw new Error(`serialize: ${kind} not implemented yet`);
}
