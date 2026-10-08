import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetRoomMessages } from "../../src/tools/get-room-messages.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-room-messages tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getRoomInfo: vi.fn(),
      getMessages: vi.fn(),
      getGroupMessages: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetRoomMessages(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-room-messages",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("resolves channel and returns messages via channels.history", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "chan1", name: "general", t: "c" },
      success: true,
    });
    const mockMessages = [
      {
        _id: "msg1",
        rid: "chan1",
        msg: "Hello channel",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
      },
    ];
    vi.mocked(client.getMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({ roomName: "general" });

    expect(client.getRoomInfo).toHaveBeenCalledWith("general");
    expect(client.getMessages).toHaveBeenCalledWith(
      "chan1",
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(client.getGroupMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessages, null, 2) },
      ],
    });
  });

  it("resolves group and returns messages via groups.history", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "grp1", name: "team-x", t: "p" },
      success: true,
    });
    const mockMessages = [
      {
        _id: "msg1",
        rid: "grp1",
        msg: "Hello group",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
      },
    ];
    vi.mocked(client.getGroupMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({ roomName: "team-x" });

    expect(client.getGroupMessages).toHaveBeenCalledWith(
      "grp1",
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(client.getMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessages, null, 2) },
      ],
    });
  });

  it("passes count, offset, oldest, and latest to client", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "chan1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.getMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({
      roomName: "general",
      count: 10,
      offset: 5,
      oldest: "2026-01-01T00:00:00.000Z",
      latest: "2026-01-31T23:59:59.000Z",
    });

    expect(client.getMessages).toHaveBeenCalledWith(
      "chan1",
      10,
      5,
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.000Z"
    );
  });

  it("returns isError for unsupported room types (dm)", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "dm1", name: "someuser", t: "d" },
      success: true,
    });

    const result = await toolHandler({ roomName: "someuser" });

    expect(client.getMessages).not.toHaveBeenCalled();
    expect(client.getGroupMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: 'Room "someuser" is type \'d\', which is not supported by get-room-messages. Only public channels (c) and private groups (p) are supported.',
        },
      ],
      isError: true,
    });
  });

  it("returns isError when room is not found", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Room Not Found")
    );

    const result = await toolHandler({ roomName: "nope" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get room messages: Rocket.Chat API error (404): Room Not Found",
        },
      ],
      isError: true,
    });
  });

  it("returns isError when the history API fails", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "chan1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.getMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Not authorized")
    );

    const result = await toolHandler({ roomName: "general" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get room messages: Rocket.Chat API error (403): Not authorized",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce("unexpected error");

    const result = await toolHandler({ roomName: "general" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get room messages: unexpected error",
        },
      ],
      isError: true,
    });
  });
});
