import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerListRooms(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "list-rooms",
    {
      description:
        "List all joined rooms (public channels, private groups, and DMs) of the authenticated Rocket.Chat user. Each room includes _id (room ID) and name, usable with other tools like get-messages and send-message.",
      inputSchema: {
        updatedSince: z
          .string()
          .optional()
          .describe(
            "ISO 8601 date string to only return rooms updated since that date"
          ),
      },
    },
    async ({ updatedSince }) => {
      try {
        const result = await client.getRooms(updatedSince);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.update, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list rooms: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
