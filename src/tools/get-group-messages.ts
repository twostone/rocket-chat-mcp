import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetGroupMessages(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-group-messages",
    {
      description: "Get message history from a Rocket.Chat private group",
      inputSchema: {
        roomId: z
          .string()
          .describe("The private group room ID to get messages from"),
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
          .describe(
            "ISO 8601 timestamp — only return messages after this date"
          ),
        latest: z
          .string()
          .optional()
          .describe(
            "ISO 8601 timestamp — only return messages before this date"
          ),
      },
    },
    async ({ roomId, count, offset, oldest, latest }) => {
      try {
        const result = await client.getGroupMessages(
          roomId,
          count,
          offset,
          oldest,
          latest
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
              text: `Failed to get group messages: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
