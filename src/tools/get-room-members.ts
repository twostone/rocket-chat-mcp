import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerGetRoomMembers(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-room-members",
    {
      description:
        "List members of a Rocket.Chat room by name. Works for public channels (type 'c') and private groups (type 'p') — the room type is detected automatically, so no separate channel/group tool is needed. If unsure about the exact room name casing, use search-directory first.",
      inputSchema: {
        roomName: z
          .string()
          .describe(
            "The exact room name (case-sensitive, without leading # or +). If unsure about casing, use search-directory first to find the correct name."
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
    async ({ roomName, count, offset }) => {
      try {
        const info = await client.getRoomInfo(roomName);
        const room = info.room;

        if (room.t !== "c" && room.t !== "p") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Room "${roomName}" is type '${room.t}', which is not supported by get-room-members. Only public channels (c) and private groups (p) are supported.`,
              },
            ],
            isError: true,
          };
        }

        const result =
          room.t === "c"
            ? await client.getChannelMembers(room._id, count, offset)
            : await client.getGroupMembers(room._id, count, offset);

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
              text: `Failed to get room members: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
