import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetChannelMembers } from "../../src/tools/get-channel-members.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-channel-members tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getChannelMembers: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetChannelMembers(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-channel-members",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns members on success", async () => {
    const mockMembers = [
      { _id: "u1", username: "alice", name: "Alice" },
      { _id: "u2", username: "bob", name: "Bob" },
    ];
    vi.mocked(client.getChannelMembers).mockResolvedValueOnce({
      members: mockMembers,
      success: true,
    });

    const result = await toolHandler({ roomId: "ch1" });

    expect(client.getChannelMembers).toHaveBeenCalledWith(
      "ch1",
      undefined,
      undefined
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMembers, null, 2) },
      ],
    });
  });

  it("passes count and offset to client", async () => {
    vi.mocked(client.getChannelMembers).mockResolvedValueOnce({
      members: [],
      success: true,
    });

    await toolHandler({ roomId: "ch1", count: 10, offset: 5 });

    expect(client.getChannelMembers).toHaveBeenCalledWith("ch1", 10, 5);
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getChannelMembers).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Not allowed")
    );

    const result = await toolHandler({ roomId: "ch1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get channel members: Rocket.Chat API error (403): Not allowed",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getChannelMembers).mockRejectedValueOnce("string error");

    const result = await toolHandler({ roomId: "ch1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get channel members: string error",
        },
      ],
      isError: true,
    });
  });
});
