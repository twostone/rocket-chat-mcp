import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import { RocketChatMessageSchema } from "../types.js";

export function registerSendMessage(
  server: McpServer,
  client: RocketChatClient,
  requireDraftReview = false
): void {
  const config = {
    title: "Send Message",
    description:
      "Send a message to a Rocket.Chat room by name. Works for public channels, private groups, and DMs (pass the other user's username as roomName). The room is resolved internally, so no separate get-room-info call is needed. If unsure about the exact name casing, use search-directory first.",
    inputSchema: z.object({
      roomName: z
        .string()
        .describe(
          "The exact room name to send to (case-sensitive, without leading # or +). For DMs, use the other user's username. If unsure about casing, use search-directory first."
        ),
      message: z.string().describe("The message text to send"),
      tmid: z
        .string()
        .optional()
        .describe("Parent message ID to reply in a thread"),
      tshow: z
        .boolean()
        .optional()
        .describe(
          "If true, the thread reply is also shown in the main channel timeline"
        ),
    }),
    outputSchema: RocketChatMessageSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    // When REQUIRE_DRAFT_REVIEW is set, the model must not send directly —
    // every outbound message goes through the draft-message composer, which
    // calls this tool from the app context. Hosts without apps support
    // ignore _meta, so the flag degrades to advisory there.
    ...(requireDraftReview ? { _meta: { ui: { visibility: ["app"] } } } : {}),
  };

  server.registerTool(
    "send-message",
    config,
    async ({ roomName, message, tmid, tshow }) => {
      try {
        const info = await client.getRoomInfo(roomName);
        const result = await client.sendMessage(info.room._id, message, {
          tmid,
          tshow,
        });
        const sent = result.message;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sent, null, 2),
            },
          ],
          structuredContent: sent,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to send message: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
