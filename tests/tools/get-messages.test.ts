import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetMessages } from "../../src/tools/get-messages.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-messages tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getMessages: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetMessages(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-messages",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns messages on success", async () => {
    const mockMessages = [
      {
        _id: "msg1",
        rid: "room1",
        msg: "Hello",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
      },
    ];
    vi.mocked(client.getMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({ roomId: "room1" });

    expect(client.getMessages).toHaveBeenCalledWith(
      "room1",
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessages, null, 2) },
      ],
    });
  });

  it("passes count and offset to client", async () => {
    vi.mocked(client.getMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({ roomId: "room1", count: 10, offset: 5 });

    expect(client.getMessages).toHaveBeenCalledWith("room1", 10, 5, undefined, undefined);
  });

  it("passes oldest and latest to client", async () => {
    vi.mocked(client.getMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({
      roomId: "room1",
      oldest: "2026-01-01T00:00:00.000Z",
      latest: "2026-01-31T23:59:59.000Z",
    });

    expect(client.getMessages).toHaveBeenCalledWith(
      "room1",
      undefined,
      undefined,
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.000Z"
    );
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Channel not found")
    );

    const result = await toolHandler({ roomId: "badroom" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get messages: Rocket.Chat API error (404): Channel not found",
        },
      ],
      isError: true,
    });
  });
});
