import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetRoomInfo } from "../../src/tools/get-room-info.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-room-info tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getRoomInfo: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetRoomInfo(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-room-info",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns room info on success", async () => {
    const mockRoom = { _id: "room1", name: "general", t: "c" };
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: mockRoom,
      success: true,
    });

    const result = await toolHandler({ roomName: "general" });

    expect(client.getRoomInfo).toHaveBeenCalledWith("general");
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockRoom, null, 2) },
      ],
    });
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Room not found")
    );

    const result = await toolHandler({ roomName: "nonexistent" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get room info: Rocket.Chat API error (404): Room not found",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce("string error");

    const result = await toolHandler({ roomName: "test" });

    expect(result).toEqual({
      content: [
        { type: "text", text: "Failed to get room info: string error" },
      ],
      isError: true,
    });
  });
});
