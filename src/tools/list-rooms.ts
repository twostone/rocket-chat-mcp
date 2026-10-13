import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import { RoomInfoSchema } from "../types.js";

export function registerListRooms(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "list-rooms",
    {
      title: "List Joined Rooms",
      description:
        "List all joined rooms (public channels, private groups, and DMs) of the authenticated Rocket.Chat user. Public channels and groups include _id (room ID) and name; DMs have no name but list the counterpart's username in `usernames[0]`. Room name/username values are usable with other tools like get-room-messages and send-message.",
      inputSchema: z.object({
        updatedSince: z
          .string()
          .optional()
          .describe(
            "ISO 8601 date string to only return rooms updated since that date"
          ),
      }),
      outputSchema: z.array(RoomInfoSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ updatedSince }) => {
      try {
        const result = await client.getRooms(updatedSince);
        const rooms = result.update;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(rooms, null, 2),
            },
          ],
          structuredContent: rooms,
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
