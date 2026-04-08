import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetRoomInfo(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-room-info",
    {
      description:
        "Resolve a Rocket.Chat room name to its room ID and metadata. Returns a room object with _id (the room ID needed by send-message, get-messages, and other tools), name, type (t), usersCount, topic, and description. Works for channels, groups, and DMs.",
      inputSchema: {
        roomName: z
          .string()
          .describe(
            "The exact room name to look up (case-sensitive, without leading #). If unsure about casing, use search-directory first to find the correct name."
          ),
      },
    },
    async ({ roomName }) => {
      try {
        const result = await client.getRoomInfo(roomName);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.room, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get room info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
