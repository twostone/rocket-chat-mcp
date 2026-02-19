import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetThreadMessages(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-thread-messages",
    {
      description: "Get all replies in a Rocket.Chat message thread",
      inputSchema: {
        tmid: z.string().describe("The ID of the parent message (thread)"),
        count: z
          .number()
          .optional()
          .describe("Number of messages to return (default: 20)"),
        offset: z
          .number()
          .optional()
          .describe("Number of messages to skip for pagination"),
      },
    },
    async ({ tmid, count, offset }) => {
      try {
        const result = await client.getThreadMessages(tmid, count, offset);
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
              text: `Failed to get thread messages: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
