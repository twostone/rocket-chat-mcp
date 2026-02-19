import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetGroupMessages } from "../../src/tools/get-group-messages.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-group-messages tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getGroupMessages: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetGroupMessages(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-group-messages",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns messages on success", async () => {
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

    const result = await toolHandler({ roomId: "grp1" });

    expect(client.getGroupMessages).toHaveBeenCalledWith(
      "grp1",
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

  it("passes count, offset, oldest, and latest to client", async () => {
    vi.mocked(client.getGroupMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({
      roomId: "grp1",
      count: 10,
      offset: 5,
      oldest: "2026-01-01T00:00:00.000Z",
      latest: "2026-01-31T23:59:59.000Z",
    });

    expect(client.getGroupMessages).toHaveBeenCalledWith(
      "grp1",
      10,
      5,
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.000Z"
    );
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getGroupMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Group not found")
    );

    const result = await toolHandler({ roomId: "badgroup" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get group messages: Rocket.Chat API error (404): Group not found",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getGroupMessages).mockRejectedValueOnce(
      "unexpected error"
    );

    const result = await toolHandler({ roomId: "grp1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get group messages: unexpected error",
        },
      ],
      isError: true,
    });
  });
});
