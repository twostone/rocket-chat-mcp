import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import { RoomInfoSchema } from "../types.js";

export function registerGetRoomInfo(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-room-info",
    {
      title: "Get Room Info",
      description:
        "Resolve a Rocket.Chat room name to its room ID and metadata. Returns a room object with _id, name, type (t), usersCount, topic, and description. Works for channels, groups, and DMs. Use this to inspect room metadata; the other tools accept room names directly and resolve rooms internally.",
      inputSchema: z.object({
        roomName: z
          .string()
          .describe(
            "The exact room name to look up (case-sensitive, without leading #). If unsure about casing, use search-directory first to find the correct name."
          ),
      }),
      outputSchema: RoomInfoSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ roomName }) => {
      try {
        const result = await client.getRoomInfo(roomName);
        // Parse through the schema so the room only carries the fields we
        // declared — Rocket.Chat returns extras (_modifiedAt, favicons, ...).
        const room = RoomInfoSchema.parse(result.room);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(room, null, 2),
            },
          ],
          structuredContent: room,
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
