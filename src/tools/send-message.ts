import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerSendMessage(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "send-message",
    {
      description: "Send a message to a Rocket.Chat channel or direct message",
      inputSchema: {
        roomId: z.string().describe("The room ID to send the message to"),
        message: z.string().describe("The message text to send"),
        tmid: z
          .string()
          .optional()
          .describe("Parent message ID to reply in a thread"),
        tshow: z
          .boolean()
          .optional()
          .describe(
            "If true, the thread reply is also shown in the main channel timeline"
          ),
      },
    },
    async ({ roomId, message, tmid, tshow }) => {
      try {
        const result = await client.sendMessage(roomId, message, {
          tmid,
          tshow,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.message, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
