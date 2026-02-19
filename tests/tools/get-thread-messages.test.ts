import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetThreadMessages } from "../../src/tools/get-thread-messages.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-thread-messages tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getThreadMessages: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetThreadMessages(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-thread-messages",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns thread messages on success", async () => {
    const mockMessages = [
      {
        _id: "msg1",
        rid: "room1",
        msg: "Thread reply",
        ts: "2026-01-01T00:00:00.000Z",
        u: { _id: "u1", username: "user1" },
        tmid: "parent1",
      },
    ];
    vi.mocked(client.getThreadMessages).mockResolvedValueOnce({
      messages: mockMessages,
      success: true,
    });

    const result = await toolHandler({ tmid: "parent1" });

    expect(client.getThreadMessages).toHaveBeenCalledWith(
      "parent1",
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
    vi.mocked(client.getThreadMessages).mockResolvedValueOnce({
      messages: [],
      success: true,
    });

    await toolHandler({ tmid: "parent1", count: 10, offset: 5 });

    expect(client.getThreadMessages).toHaveBeenCalledWith("parent1", 10, 5);
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getThreadMessages).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Thread not found")
    );

    const result = await toolHandler({ tmid: "badthread" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get thread messages: Rocket.Chat API error (404): Thread not found",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getThreadMessages).mockRejectedValueOnce(
      "unexpected error"
    );

    const result = await toolHandler({ tmid: "parent1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get thread messages: unexpected error",
        },
      ],
      isError: true,
    });
  });
});
