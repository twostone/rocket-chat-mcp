import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RocketChatClient } from "../client/rocketchat.js";

export function registerSearchDirectory(
  server: McpServer,
  client: RocketChatClient
): void {
  server.registerTool(
    "search-directory",
    {
      description:
        "Search the Rocket.Chat workspace directory for users or channels (case-insensitive substring match). Returns matching entries with their IDs. Use this to find the correct room name before calling get-room-info when the exact casing is unknown.",
      inputSchema: {
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
      },
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
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.result, null, 2),
            },
          ],
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
