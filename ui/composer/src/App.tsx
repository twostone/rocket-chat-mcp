import { useEffect, useRef, useState } from "react";
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { DraftPayload } from "./types";
import { Preview } from "./components/Preview";

const APP_INFO = { name: "Rocket.Chat Composer", version: "1.0.0" };

/**
 * Derives the composer payload from either the tool's structured result
 * (rich: room/sender/parent resolved server-side) or the raw tool-input
 * arguments (thin: roomName/message only). Returns null when the shape is
 * unrecognised.
 */
export function extractDraft(candidate: unknown): DraftPayload | null {
  const maybeResult = candidate as
    | { structuredContent?: unknown }
    | null
    | undefined;
  const record = (
    maybeResult && "structuredContent" in maybeResult
      ? maybeResult.structuredContent
      : candidate
  ) as Record<string, unknown> | null | undefined;

  if (
    !record ||
    typeof record.roomName !== "string" ||
    typeof record.message !== "string"
  ) {
    return null;
  }

  const draft: DraftPayload = {
    roomName: record.roomName,
    room: { displayName: record.roomName, kind: "channel" },
    sender: { username: "you", name: null, avatarUrl: null },
    message: record.message,
  };

  const room = record.room as
    | { displayName?: unknown; kind?: unknown }
    | undefined;
  if (room && typeof room.displayName === "string" && room.displayName) {
    draft.room = {
      displayName: room.displayName,
      kind: room.kind === "group" ? "group" : room.kind === "dm" ? "dm" : "channel",
    };
  }

  const sender = record.sender as
    | { username?: unknown; name?: unknown; avatarUrl?: unknown }
    | undefined;
  if (sender && typeof sender.username === "string") {
    draft.sender = {
      username: sender.username,
      name: typeof sender.name === "string" ? sender.name : null,
      avatarUrl:
        typeof sender.avatarUrl === "string" ? sender.avatarUrl : null,
    };
  }

  const parent = record.parent as
    | {
        username?: unknown;
        name?: unknown;
        avatarUrl?: unknown;
        message?: unknown;
      }
    | undefined;
  if (parent && typeof parent.username === "string") {
    draft.parent = {
      username: parent.username,
      name: typeof parent.name === "string" ? parent.name : null,
      avatarUrl:
        typeof parent.avatarUrl === "string" ? parent.avatarUrl : null,
      message: typeof parent.message === "string" ? parent.message : "",
    };
  }

  if (typeof record.tmid === "string") {
    draft.tmid = record.tmid;
  }

  return draft;
}

/** Picks the first readable content block from a tool result. */
function firstText(result: CallToolResult): string {
  for (const block of result.content) {
    if (block.type === "text" && block.text.trim().length > 0) {
      return block.text;
    }
  }
  return "The request failed.";
}

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

export function App() {
  const appRef = useRef<NonNullable<ReturnType<typeof useApp>["app"]>>(null);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const { app, isConnected, error } = useApp({
    appInfo: APP_INFO,
    capabilities: {},
    autoResize: true,
    onAppCreated: (created) => {
      appRef.current = created;
      created.ontoolinput = (input) => {
        const extracted = extractDraft(input.arguments);
        if (extracted) applyDraft(extracted);
      };
      created.ontoolresult = (result) => {
        const extracted = extractDraft(result);
        if (extracted) applyDraft(extracted);
      };
      created.onhostcontextchanged = (ctx) => applyHostContext(ctx);
      created.onerror = (err) => {
        // Surface transport/host errors; the view still renders from state.
        console.error("[composer] app error", err);
      };
    },
  });

  const applyDraft = (next: DraftPayload) => {
    setDraft(next);
    setText(next.message);
    setStatus(null);
  };

  // Apply theme/fonts from the initial host context once connected.
  useEffect(() => {
    const initial = app?.getHostContext();
    if (initial) {
      applyHostContext(initial);
    }
  }, [app]);

  if (error) {
    return (
      <div className="composer-error">
        Composer could not connect to the host: {error.message}
      </div>
    );
  }

  if (!isConnected) {
    return <div className="composer-loading">Connecting…</div>;
  }

  if (!draft) {
    return <div className="composer-loading">Preparing draft…</div>;
  }

  const canSend = text.trim().length > 0 && !busy;

  const handleSend = async () => {
    if (!canSend) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await app
        ?.callServerTool({
          name: "send-message",
          arguments: {
            roomName: draft.roomName,
            message: text,
            ...(draft.tmid ? { tmid: draft.tmid } : {}),
          },
        });
      if (result?.isError) {
        setStatus({ kind: "error", text: firstText(result) });
      } else {
        setStatus({
          kind: "ok",
          text: `Message sent to ${draft.room.displayName}.`,
        });
        await app
          ?.updateModelContext({
            content: [
              {
                type: "text",
                text: `Draft sent to ${draft.room.displayName}: ${text}`,
              },
            ],
          })
          .catch(() => {});
      }
    } catch (err) {
      setStatus({ kind: "error", text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await app
        ?.updateModelContext({
          content: [
            {
              type: "text",
              text: "Draft discarded — the message was not sent.",
            },
          ],
        })
        .catch(() => {});
      setStatus({ kind: "ok", text: "Draft discarded." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      <div className="composer-preview">
        <Preview
          payload={draft}
          text={text}
          onOpenLink={(url) => void appRef.current?.openLink({ url })}
        />
      </div>

      <div className="composer-editor">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck
          aria-label="Message text"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
      </div>

      {status && (
        <div
          className={`composer-status ${status.kind === "ok" ? "ok" : "error"}`}
          role="status"
        >
          {status.text}
        </div>
      )}

      <div className="composer-footer">
        <span className="room-chip">
          {draft.room.kind === "dm"
            ? "@"
            : draft.room.kind === "group"
              ? "+"
              : "#"}
          {draft.roomName}
          {draft.tmid ? (
            <span className="thread-badge">reply in thread</span>
          ) : null}
        </span>
        <div className="footer-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => void handleDiscard()}
            disabled={busy}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleSend()}
            disabled={!canSend}
          >
            {busy ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
