import { useMemo } from "react";
import type { ReactNode } from "react";
import { parse } from "@rocket.chat/message-parser";
import type { Root } from "@rocket.chat/message-parser";
import type {
  BigEmoji,
  Blocks,
  Bold,
  ChannelMention,
  Color,
  Code,
  CodeLine,
  Emoji,
  Heading,
  InlineCode,
  InlineKaTeX,
  Inlines,
  Italic,
  KaTeX,
  LineBreak,
  Link,
  ListItem,
  OrderedList,
  Paragraph,
  Plain,
  Quote,
  Spoiler,
  SpoilerBlock,
  Strike,
  Task,
  Tasks,
  UnorderedList,
  UserMention,
} from "@rocket.chat/message-parser";
import type { DraftPayload } from "../types";
import { emojiByShortcode } from "../lib/emoji-map";

type AnyNode =
  | Paragraph
  | BigEmoji
  | Bold
  | Italic
  | Strike
  | Plain
  | ChannelMention
  | Inlines
  | Blocks
  | Quote
  | Spoiler
  | SpoilerBlock
  | Code
  | CodeLine
  | InlineCode
  | Heading
  | KaTeX
  | InlineKaTeX
  | LineBreak
  | Link
  | UserMention
  | Color
  | Tasks
  | Task
  | OrderedList
  | UnorderedList
  | ListItem;

function plainText(node: Plain): string {
  return node.value;
}

function emojiChar(node: Emoji): string | null {
  if ("unicode" in node && node.value === undefined) return node.unicode;
  const shortCode = "shortCode" in node ? node.shortCode : "";
  return emojiByShortcode[shortCode] ?? null;
}

function formatTime(ts?: string): string {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NodeView({
  node,
  onOpenLink,
}: {
  node: AnyNode;
  onOpenLink: (url: string) => void;
}) {
  switch (node.type) {
    case "PARAGRAPH":
      return <p className="md">{renderChildren(node.value, onOpenLink)}</p>;
    case "PLAIN_TEXT":
      return <>{plainText(node)}</>;
    case "BOLD":
      return <strong>{renderChildren(node.value, onOpenLink)}</strong>;
    case "ITALIC":
      return <em>{renderChildren(node.value, onOpenLink)}</em>;
    case "STRIKE":
      return <s>{renderChildren(node.value, onOpenLink)}</s>;
    case "INLINE_CODE":
      return <code className="inline-code">{node.value.value}</code>;
    case "CODE": {
      const lines = node.value.map((line: CodeLine) => line.value.value);
      return (
        <pre className="code-block">
          <code data-language={node.language ?? undefined}>
            {lines.join("\n")}
          </code>
        </pre>
      );
    }
    case "HEADING": {
      const Tag = (`h${Math.min(node.level, 4)}`) as "h1";
      return (
        <Tag className="heading">
          {renderChildren(node.value as unknown as AnyNode[], onOpenLink)}
        </Tag>
      );
    }
    case "LINK": {
      const src = plainText(node.value.src);
      const labelNodes = Array.isArray(node.value.label)
        ? (node.value.label as Inlines[])
        : [node.value.label as Inlines];
      return (
        <a
          className="md-link"
          href={src}
          rel="noreferrer noopener"
          onClick={(event) => {
            event.preventDefault();
            onOpenLink(src);
          }}
        >
          {renderChildren(labelNodes, onOpenLink)}
        </a>
      );
    }
    case "MENTION_USER":
      return (
        <span className="mention">@{plainText(node.value)}</span>
      );
    case "MENTION_CHANNEL":
      return (
        <span className="mention">#{plainText(node.value)}</span>
      );
    case "EMOJI": {
      const char = emojiChar(node);
      const code = "shortCode" in node ? node.shortCode : "?";
      return char ? (
        <span role="img" aria-label={char}>
          {char}
        </span>
      ) : (
        <span className="unknown-emoji">:{code}:</span>
      );
    }
    case "BIG_EMOJI": {
      const chars = (node.value as Array<Emoji>).map((emoji) => {
        const char = emojiChar(emoji);
        const code = "shortCode" in emoji ? emoji.shortCode : "?";
        return char ?? `:${code}:`;
      });
      return (
        <span className="big-emoji" role="img">
          {chars.join("")}
        </span>
      );
    }
    case "QUOTE":
    case "SPOILER_BLOCK":
      return (
        <div
          className={node.type === "QUOTE" ? "quote" : "spoiler-block"}
        >
          {renderChildren(node.value, onOpenLink)}
        </div>
      );
    case "SPOILER":
      return (
        <span className="spoiler">
          {renderChildren(node.value, onOpenLink)}
        </span>
      );
    case "UNORDERED_LIST":
      return (
        <ul className="md-list">
          {node.value.map((item, index) => (
            <li key={index}>{renderChildren(item.value, onOpenLink)}</li>
          ))}
        </ul>
      );
    case "ORDERED_LIST":
      return (
        <ol className="md-list">
          {node.value.map((item, index) => (
            <li key={index}>{renderChildren(item.value, onOpenLink)}</li>
          ))}
        </ol>
      );
    case "TASKS":
      return (
        <ul className="md-list tasks">
          {node.value.map((task, index) => (
            <TaskItem key={index} task={task} onOpenLink={onOpenLink} />
          ))}
        </ul>
      );
    case "IMAGE":
      return (
        <span className="image-stub">
          🖼 {node.value.label.type === "PLAIN_TEXT" ? node.value.label.value : "image"}
        </span>
      );
    case "LINE_BREAK":
      return <br />;
    case "TIMESTAMP": {
      // 0.32: the fallback may be a Plain node or a SourceRange tuple
      // (an array — use it as the discriminator, tuples have no `type`).
      const fb = node.fallback;
      return (
        <span className="timestamp">
          {!Array.isArray(fb) && fb ? plainText(fb) : node.value.timestamp}
        </span>
      );
    }
    case "KATEX":
    case "INLINE_KATEX":
      return <code className="math">{node.value}</code>;
    case "COLOR":
      return <span />;
    default:
      // Unknown node types degrade to nothing rather than crashing the
      // preview (future-proofing against parser version drift).
      return null;
  }
}

function TaskItem({
  task,
  onOpenLink,
}: {
  task: Task;
  onOpenLink: (url: string) => void;
}) {
  return (
    <li className="task">
      <input type="checkbox" disabled checked={task.status} readOnly />
      <span className={`task-label${task.status ? " done" : ""}`}>
        {renderChildren(task.value, onOpenLink)}
      </span>
    </li>
  );
}

function renderChildren(
  nodes: AnyNode[],
  onOpenLink: (url: string) => void
): ReactNode {
  return nodes.map((child, index) => (
    <NodeView key={index} node={child} onOpenLink={onOpenLink} />
  ));
}

export function Avatar({
  username,
  avatarUrl,
  size = 40,
}: {
  username: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const initial = (username[0] ?? "?").toUpperCase();
  if (avatarUrl) {
    return (
      <img
        className="avatar"
        style={{ width: size, height: size }}
        src={avatarUrl}
        alt={username}
        referrerPolicy="no-referrer"
        onError={(event) => {
          const el = event.currentTarget;
          const replacement = document.createElement("span");
          replacement.className = "avatar fallback";
          replacement.style.width = `${size}px`;
          replacement.style.height = `${size}px`;
          replacement.textContent = initial;
          el.replaceWith(replacement);
        }}
      />
    );
  }
  return (
    <span
      className="avatar fallback"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

/**
 * Renders the draft message the way Rocket.Chat will display it, plus the
 * thread parent (when replying) as greyed context above.
 */
export function Preview({
  payload,
  text,
  onOpenLink,
}: {
  payload: DraftPayload;
  text: string;
  onOpenLink: (url: string) => void;
}) {
  const ast = useMemo<Root>(() => {
    try {
      return parse(text, { emoticons: true, colors: true });
    } catch {
      return [
        { type: "PARAGRAPH", value: [{ type: "PLAIN_TEXT", value: text }] },
      ] as unknown as Root;
    }
  }, [text]);

  const children = ast as AnyNode[];
  const isBigEmojiOnly =
    children.length === 1 && (children[0] as { type?: string }).type ===
    "BIG_EMOJI";

  return (
    <div className="message" data-testid="preview">
      {payload.parent && (
        <div className="message parent-context">
          <div className="parent-row">
            <Avatar
              username={payload.parent.username}
              avatarUrl={payload.parent.avatarUrl}
              size={28}
            />
            <div className="parent-meta">
              <span className="parent-name">
                {payload.parent.name ?? payload.parent.username}{" "}
                <span className="at">@{payload.parent.username}</span>
              </span>
            </div>
          </div>
          <p className="parent-text">{payload.parent.message}</p>
        </div>
      )}

      <div className="message-row">
        <Avatar
          username={payload.sender.username}
          avatarUrl={payload.sender.avatarUrl}
        />
        <div className="message-main">
          <div className="message-head">
            <span className="display-name">
              {payload.sender.name ?? payload.sender.username}
            </span>
            <span className="at">@{payload.sender.username}</span>
            <span className="msg-ts">{formatTime()}</span>
          </div>
          <div className="message-body">
            {isBigEmojiOnly ? (
              <NodeView node={children[0]} onOpenLink={onOpenLink} />
            ) : (
              renderChildren(children, onOpenLink)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
