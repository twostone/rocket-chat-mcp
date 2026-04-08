import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetChannelMembers(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-channel-members",
    {
      description:
        "List members of a Rocket.Chat public channel (type 'c') by room ID. Use get-room-info to resolve a channel name to a room ID. For private groups (type 'p'), use get-group-members instead.",
      inputSchema: {
        roomId: z
          .string()
          .describe(
            "The public channel room ID to list members for (use get-room-info to resolve a channel name)"
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
        const result = await client.getChannelMembers(roomId, count, offset);
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
              text: `Failed to get channel members: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
