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
      getRoomInfo: vi.fn(),
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

  it("resolves a channel by name and returns matching messages", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "room1", name: "general", t: "c" },
      success: true,
    });
    const mockMessages = [
      {
        _id: "msg1",
        rid: "room1",
        msg: "found it",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
      },
    ];
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({
      roomName: "general",
      searchText: "found",
    });

    expect(client.getRoomInfo).toHaveBeenCalledWith("general");
    expect(client.searchMessages).toHaveBeenCalledWith(
      "room1",
      "found",
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessages, null, 2) },
      ],
    });
  });

  it("resolves a group by name and searches it", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "grp1", name: "team-x", t: "p" },
      success: true,
    });
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({ roomName: "team-x", searchText: "hello" });

    expect(client.searchMessages).toHaveBeenCalledWith(
      "grp1",
      "hello",
      undefined,
      undefined
    );
  });

  it("passes count and offset to client", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "room1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.searchMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({
      roomName: "general",
      searchText: "hello",
      count: 10,
      offset: 5,
    });

    expect(client.searchMessages).toHaveBeenCalledWith("room1", "hello", 10, 5);
  });

  it("returns isError when the room cannot be resolved", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Room Not Found")
    );

    const result = await toolHandler({
      roomName: "nope",
      searchText: "hello",
    });

    expect(client.searchMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search messages: Rocket.Chat API error (404): Room Not Found",
        },
      ],
      isError: true,
    });
  });

  it("returns isError on search API failure", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "room1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.searchMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Forbidden")
    );

    const result = await toolHandler({
      roomName: "general",
      searchText: "hello",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search messages: Rocket.Chat API error (403): Forbidden",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce("string error");

    const result = await toolHandler({
      roomName: "general",
      searchText: "hello",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to search messages: string error",
        },
      ],
      isError: true,
    });
  });
});
