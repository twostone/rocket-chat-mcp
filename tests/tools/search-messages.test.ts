import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerSearchMessages } from "../../src/tools/search-messages.js";

vi.mock("../../src/client/rocketchat.js");

describe("search-messages tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      searchMessages: vi.fn(),
    } as unknown as RocketChatClient;

    registerSearchMessages(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "search-messages",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns matching messages on success", async () => {
    const mockMessages = [
      {
        _id: "msg1",
        rid: "room1",
        msg: "matching text",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
      },
    ];
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({
      roomId: "room1",
      searchText: "matching",
    });

    expect(client.searchMessages).toHaveBeenCalledWith(
      "room1",
      "matching",
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessages, null, 2) },
      ],
    });
  });

  it("returns empty array when no messages match", async () => {
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    const result = await toolHandler({
      roomId: "room1",
      searchText: "nomatch",
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "[]" }],
    });
  });

  it("passes count to client", async () => {
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({ roomId: "room1", searchText: "test", count: 5 });

    expect(client.searchMessages).toHaveBeenCalledWith("room1", "test", 5, undefined);
  });

  it("passes offset to client", async () => {
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({ roomId: "room1", searchText: "test", count: 5, offset: 10 });

    expect(client.searchMessages).toHaveBeenCalledWith("room1", "test", 5, 10);
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.searchMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (500): Internal Server Error")
    );

    const result = await toolHandler({
      roomId: "room1",
      searchText: "test",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search messages: Rocket.Chat API error (500): Internal Server Error",
        },
      ],
      isError: true,
    });
  });
});
