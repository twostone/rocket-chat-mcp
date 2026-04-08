import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetMessages(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-messages",
    {
      description:
        "Get message history from a Rocket.Chat public channel (type 'c') by room ID. Use get-room-info to resolve a channel name to a room ID. For private groups (type 'p'), use get-group-messages instead.",
      inputSchema: {
        roomId: z
          .string()
          .describe(
            "The room ID to get messages from (use get-room-info to resolve a channel name)"
          ),
        count: z
          .number()
          .optional()
          .describe("Number of messages to return (default: 20)"),
        offset: z
          .number()
          .optional()
          .describe("Number of messages to skip for pagination"),
        oldest: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp — only return messages after this date"),
        latest: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp — only return messages before this date"),
      },
    },
    async ({ roomId, count, offset, oldest, latest }) => {
      try {
        const result = await client.getMessages(roomId, count, offset, oldest, latest);
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
              text: `Failed to get messages: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
