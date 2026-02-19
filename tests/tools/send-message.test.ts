import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerSendMessage } from "../../src/tools/send-message.js";

vi.mock("../../src/client/rocketchat.js");

describe("send-message tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      sendMessage: vi.fn(),
    } as unknown as RocketChatClient;

    registerSendMessage(server, client);

    // Extract the handler registered with server.registerTool
    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "send-message",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns sent message on success", async () => {
    const mockMessage = {
      _id: "msg1",
      rid: "room1",
      msg: "Hello",
      ts: "2026-01-01T00:00:00.000Z",
      u: { _id: "u1", username: "bot" },
    };
    vi.mocked(client.sendMessage).mockResolvedValueOnce({
      message: mockMessage,
      success: true,
    });

    const result = await toolHandler({ roomId: "room1", message: "Hello" });

    expect(client.sendMessage).toHaveBeenCalledWith("room1", "Hello", {
      tmid: undefined,
      tshow: undefined,
    });
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessage, null, 2) },
      ],
    });
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.sendMessage).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Forbidden")
    );

    const result = await toolHandler({ roomId: "room1", message: "Hello" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to send message: Rocket.Chat API error (403): Forbidden",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.sendMessage).mockRejectedValueOnce("string error");

    const result = await toolHandler({ roomId: "room1", message: "Hello" });

    expect(result).toEqual({
      content: [
        { type: "text", text: "Failed to send message: string error" },
      ],
      isError: true,
    });
  });

  it("passes tmid for thread replies", async () => {
    const mockMessage = {
      _id: "reply1",
      rid: "room1",
      msg: "Thread reply",
      ts: "2026-01-01T00:00:00.000Z",
      u: { _id: "u1", username: "bot" },
      tmid: "parent1",
    };
    vi.mocked(client.sendMessage).mockResolvedValueOnce({
      message: mockMessage,
      success: true,
    });

    const result = await toolHandler({
      roomId: "room1",
      message: "Thread reply",
      tmid: "parent1",
    });

    expect(client.sendMessage).toHaveBeenCalledWith(
      "room1",
      "Thread reply",
      { tmid: "parent1", tshow: undefined }
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMessage, null, 2) },
      ],
    });
  });

  it("passes tmid and tshow for visible thread replies", async () => {
    vi.mocked(client.sendMessage).mockResolvedValueOnce({
      message: { _id: "r1", rid: "room1", msg: "reply", ts: "", u: { _id: "u1", username: "bot" } },
      success: true,
    });

    await toolHandler({
      roomId: "room1",
      message: "reply",
      tmid: "parent1",
      tshow: true,
    });

    expect(client.sendMessage).toHaveBeenCalledWith(
      "room1",
      "reply",
      { tmid: "parent1", tshow: true }
    );
  });
});
