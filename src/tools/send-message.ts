import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerSendMessage(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "send-message",
    {
      description:
        "Send a message to a Rocket.Chat room by name. Works for public channels, private groups, and DMs (pass the other user's username as roomName). The room is resolved internally, so no separate get-room-info call is needed. If unsure about the exact name casing, use search-directory first.",
      inputSchema: {
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
      },
    },
    async ({ roomName, message, tmid, tshow }) => {
      try {
        const info = await client.getRoomInfo(roomName);
        const result = await client.sendMessage(info.room._id, message, {
          tmid,
          tshow,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.message, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
