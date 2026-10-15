import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerSearchDirectory } from "../../src/tools/search-directory.js";

vi.mock("../../src/client/rocketchat.js");

describe("search-directory tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      searchDirectory: vi.fn(),
    } as unknown as RocketChatClient;

    registerSearchDirectory(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "search-directory",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns results when searching for users", async () => {
    // Keys are listed in the DirectoryResultSchema declaration order
    // (_id, name, username, ...) so the pretty-printed text matches the
    // canonicalized output of the tool.
    const mockResults = [
      { _id: "u1", name: "Alice", username: "alice" },
      { _id: "u2", name: "Bob", username: "bob" },
    ];
    vi.mocked(client.searchDirectory).mockResolvedValueOnce({
      result: mockResults,
      count: 2,
      offset: 0,
      total: 2,
      success: true,
    });

    const result = await toolHandler({ text: "ali", type: "users" });

    expect(client.searchDirectory).toHaveBeenCalledWith(
      "ali",
      "users",
      undefined,
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockResults, null, 2) },
      ],
      structuredContent: mockResults,
    });
  });

  it("returns results when searching for channels", async () => {
    const mockResults = [
      { _id: "ch1", name: "general", t: "c", usersCount: 50 },
    ];
    vi.mocked(client.searchDirectory).mockResolvedValueOnce({
      result: mockResults,
      count: 1,
      offset: 0,
      total: 1,
      success: true,
    });

    const result = await toolHandler({ text: "gen", type: "channels" });

    expect(client.searchDirectory).toHaveBeenCalledWith(
      "gen",
      "channels",
      undefined,
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockResults, null, 2) },
      ],
      structuredContent: mockResults,
    });
  });

  it("strips unrecognized fields from results so output matches its schema", async () => {
    vi.mocked(client.searchDirectory).mockResolvedValueOnce({
      result: [
        {
          _id: "u1",
          username: "alice",
          name: "Alice",
          // Fields Rocket.Chat attaches that the output schema does not declare:
          statuses: "online",
          roles: ["user"],
          lastLoginTs: "2026-01-01T00:00:00.000Z",
        },
      ],
      count: 1,
      offset: 0,
      total: 1,
      success: true,
    });

    const result = await toolHandler({ text: "ali", type: "users" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual([
      { _id: "u1", username: "alice", name: "Alice" },
    ]);
  });

  it("passes count, offset, and workspace to client", async () => {
    vi.mocked(client.searchDirectory).mockResolvedValueOnce({
      result: [],
      count: 0,
      offset: 10,
      total: 0,
      success: true,
    });

    await toolHandler({
      text: "test",
      type: "users",
      count: 5,
      offset: 10,
      workspace: "all",
    });

    expect(client.searchDirectory).toHaveBeenCalledWith(
      "test",
      "users",
      5,
      10,
      "all"
    );
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.searchDirectory).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Not allowed")
    );

    const result = await toolHandler({ text: "test", type: "users" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search directory: Rocket.Chat API error (403): Not allowed",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.searchDirectory).mockRejectedValueOnce("string error");

    const result = await toolHandler({ text: "test", type: "channels" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search directory: string error",
        },
      ],
      isError: true,
    });
  });
});
