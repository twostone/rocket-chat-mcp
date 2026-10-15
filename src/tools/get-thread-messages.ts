import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import { RocketChatMessageSchema } from "../types.js";

// Declares exactly the fields each message exposes. Parsing through it strips
// any extra fields Rocket.Chat attaches (md, urls, reactions, tcount, ...) so
// the tool output always matches its schema.
const MessagesSchema = z.array(RocketChatMessageSchema);

export function registerGetThreadMessages(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "get-thread-messages",
    {
      title: "Get Thread Messages",
      description:
        "Get all replies in a Rocket.Chat message thread. Requires the parent message ID (tmid), which can be found in message objects returned by get-room-messages or search-messages.",
      inputSchema: z.object({
        tmid: z.string().describe("The ID of the parent message (thread)"),
        count: z
          .number()
          .optional()
          .describe("Number of messages to return (default: 20)"),
        offset: z
          .number()
          .optional()
          .describe("Number of messages to skip for pagination"),
      }),
      outputSchema: MessagesSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tmid, count, offset }) => {
      try {
        const result = await client.getThreadMessages(tmid, count, offset);
        const messages = MessagesSchema.parse(result.messages);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(messages, null, 2),
            },
          ],
          structuredContent: messages,
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
