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
      description: "Search for messages in a Rocket.Chat channel by text",
      inputSchema: {
        roomId: z.string().describe("The room ID to search in"),
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
    async ({ roomId, searchText, count, offset }) => {
      try {
        const result = await client.searchMessages(roomId, searchText, count, offset);
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
