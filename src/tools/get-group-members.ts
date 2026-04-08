import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetGroupMembers(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-group-members",
    {
      description:
        "List members of a Rocket.Chat private group (type 'p') by room ID. Use get-room-info to resolve a group name to a room ID. For public channels (type 'c'), use get-channel-members instead.",
      inputSchema: {
        roomId: z
          .string()
          .describe(
            "The private group room ID to list members for (use get-room-info to resolve a group name)"
          ),
        count: z
          .number()
          .optional()
          .describe("Number of members to return (default: 20)"),
        offset: z
          .number()
          .optional()
          .describe("Number of members to skip for pagination"),
      },
    },
    async ({ roomId, count, offset }) => {
      try {
        const result = await client.getGroupMembers(roomId, count, offset);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.members, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get group members: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
