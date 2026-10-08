import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerSearchMessages(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "search-messages",
    {
      description:
        "Search for messages in a Rocket.Chat room by text. Works for public channels, private groups, and DMs — the room is resolved internally from the name, so no separate get-room-info call is needed. If unsure about the exact name casing, use search-directory first.",
      inputSchema: {
        roomName: z
          .string()
          .describe(
            "The exact room name to search in (case-sensitive, without leading # or +). For DMs, use the other user's username. If unsure about casing, use search-directory first."
          ),
        searchText: z.string().describe("The text to search for"),
        count: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
        offset: z
          .number()
          .optional()
          .describe("Number of results to skip for pagination"),
      },
    },
    async ({ roomName, searchText, count, offset }) => {
      try {
        const info = await client.getRoomInfo(roomName);
        const result = await client.searchMessages(
          info.room._id,
          searchText,
          count,
          offset
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.messages, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to search messages: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
