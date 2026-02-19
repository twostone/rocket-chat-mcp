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
        "Resolve a Rocket.Chat room name to its room ID and metadata (works for channels, groups, and DMs)",
      inputSchema: {
        roomName: z
          .string()
          .describe("The room name to look up (without leading #)"),
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
