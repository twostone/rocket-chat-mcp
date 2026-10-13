import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { RocketChatClient } from "../client/rocketchat.js";
import { DirectoryResultSchema } from "../types.js";

export function registerSearchDirectory(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "search-directory",
    {
      title: "Search Directory",
      description:
        "Search the Rocket.Chat workspace directory for users or channels (case-insensitive substring match). Returns matching entries with their IDs. Use this to find the correct room name before calling get-room-info when the exact casing is unknown.",
      inputSchema: z.object({
        text: z.string().describe("The search term to filter results"),
        type: z
          .enum(["users", "channels"])
          .describe("Type of directory entries to search for"),
        count: z
          .number()
          .optional()
          .describe("Number of results to return"),
        offset: z
          .number()
          .optional()
          .describe("Number of results to skip for pagination"),
        workspace: z
          .enum(["local", "all"])
          .optional()
          .describe(
            "Workspace scope: 'local' (default) or 'all' (requires federation)"
          ),
      }),
      outputSchema: z.array(DirectoryResultSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ text, type, count, offset, workspace }) => {
      try {
        const result = await client.searchDirectory(
          text,
          type,
          count,
          offset,
          workspace
        );
        const matches = result.result;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(matches, null, 2),
            },
          ],
          structuredContent: matches,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to search directory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
