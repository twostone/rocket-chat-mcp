import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import {
  DraftMessageSchema,
  type DraftMessage,
  type RoomInfo,
} from "../types.js";

export const COMPOSER_RESOURCE_URI = "ui://rocket-chat/composer.html";

function roomKind(room: RoomInfo): "channel" | "group" | "dm" {
  if (room.t === "p") return "group";
  if (room.t === "d") return "dm";
  return "channel";
}

function roomDisplayName(room: RoomInfo): string {
  const kind = roomKind(room);
  if (kind === "dm") {
    return room.name ?? room.usernames?.[0] ?? room._id;
  }
  return room.name ?? room._id;
}

function avatarUrl(
  baseUrl: string,
  avatarEtags: Record<string, unknown> | undefined,
  username: string
): string | null {
  const etag = avatarEtags?.[username];
  if (etag === undefined) return null;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(username)}/${encodeURIComponent(String(etag))}/avatar`;
}

/**
 * Resolves everything the composer view needs: room, sender and (for
 * thread replies) the parent message. Read-only by nature — no mutation,
 * so it is safe for the model to call at any time.
 */
async function buildDraft(
  client: RocketChatClient,
  roomName: string,
  message: string,
  tmid?: string
): Promise<DraftMessage> {
  const baseUrl = client.config.url;
  const info = await client.getRoomInfo(roomName);
  const room = info.room;
  const me = await client.getMe();

  const parentMessage = tmid ? await client.getMessage(tmid) : undefined;

  const draft: DraftMessage = {
    roomName,
    room: { displayName: roomDisplayName(room), kind: roomKind(room) },
    sender: {
      username: me.username,
      name: me.name ?? null,
      avatarUrl: avatarUrl(baseUrl, me.avatarEtags, me.username),
    },
    message,
  };

  if (tmid && parentMessage) {
    draft.tmid = tmid;
    draft.parent = {
      username: parentMessage.u.username,
      name: parentMessage.u.name ?? null,
      avatarUrl: avatarUrl(
        baseUrl,
        me.avatarEtags,
        parentMessage.u.username
      ),
      message: parentMessage.msg,
      ts: parentMessage.ts,
    };
  }

  return draft;
}

export function registerDraftMessage(
  server: McpServer,
  client: RocketChatClient,
  composerHtml?: string
): void {
  const baseUrl = client.config.url;
  const hasUi = Boolean(composerHtml);

  const config = {
    title: "Draft Message",
    description:
      "Prepare a draft of a message for a Rocket.Chat room so a human can review and edit it before sending. Shows a Rocket.Chat-style preview with the room, sender and (optionally) thread context. The message is NOT sent until the user confirms in the composer. Use this instead of send-message whenever a human should vet the wording or destination first.",
    inputSchema: z.object({
      roomName: z
        .string()
        .describe(
          "The exact room name to draft in (case-sensitive, without leading # or +). For DMs, use the other user's username. If unsure about casing, use search-directory first."
        ),
      message: z.string().describe("The message text to prepare"),
      tmid: z
        .string()
        .optional()
        .describe("Parent message ID when drafting a thread reply"),
    }),
    outputSchema: DraftMessageSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    // Advertises the companion UI when the bundled HTML is available. When it
    // is not, `ui` carries no resourceUri and hosts fall back to the plain
    // text/structured result.
    _meta: hasUi
      ? { ui: { resourceUri: COMPOSER_RESOURCE_URI } }
      : { ui: {} },
  } as const;

  registerAppTool(
    server,
    "draft-message",
    config,
    async ({ roomName, message, tmid }) => {
      try {
        const draft = await buildDraft(client, roomName, message, tmid);
        return {
          content: [
            {
              type: "text" as const,
              text: `Draft prepared for ${draft.room.displayName}: ${message}${
                tmid ? " (thread reply)" : ""
              }. The user can review, edit and send it from the composer.`,
            },
          ],
          structuredContent: draft,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to draft message: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  if (hasUi) {
    registerAppResource(
      server,
      "Rocket.Chat Composer",
      COMPOSER_RESOURCE_URI,
      {
        description:
          "Interactive draft composer rendered like a Rocket.Chat message",
        mimeType: RESOURCE_MIME_TYPE,
      },
      async () => ({
        contents: [
          {
            uri: COMPOSER_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: composerHtml ?? "",
          },
        ],
        // Avatars are the only network fetch the composer makes, so the CSP
        // whitelists the configured Rocket.Chat origin for resources; all
        // scripts, styles and emoji data are inlined in the HTML itself.
        _meta: {
          ui: { csp: { resourceDomains: [baseUrl] } },
        },
      })
    );
  }
}
