import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerGetRoomMembers } from "../../src/tools/get-room-members.js";

vi.mock("../../src/client/rocketchat.js");

describe("get-room-members tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getRoomInfo: vi.fn(),
      getChannelMembers: vi.fn(),
      getGroupMembers: vi.fn(),
    } as unknown as RocketChatClient;

    registerGetRoomMembers(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "get-room-members",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("resolves channel and returns members via channels.members", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "chan1", name: "general", t: "c" },
      success: true,
    });
    const mockMembers = [
      { _id: "u1", username: "user1", name: "User One" },
    ];
    vi.mocked(client.getChannelMembers).mockResolvedValueOnce({
      members: mockMembers,
      success: true,
    });

    const result = await toolHandler({ roomName: "general" });

    expect(client.getRoomInfo).toHaveBeenCalledWith("general");
    expect(client.getChannelMembers).toHaveBeenCalledWith(
      "chan1",
      undefined,
      undefined
    );
    expect(client.getGroupMembers).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMembers, null, 2) },
      ],
    });
  });

  it("resolves group and returns members via groups.members", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "grp1", name: "team-x", t: "p" },
      success: true,
    });
    const mockMembers = [
      { _id: "u1", username: "user1", name: "User One" },
    ];
    vi.mocked(client.getGroupMembers).mockResolvedValueOnce({
      members: mockMembers,
      success: true,
    });

    const result = await toolHandler({ roomName: "team-x" });

    expect(client.getGroupMembers).toHaveBeenCalledWith(
      "grp1",
      undefined,
      undefined
    );
    expect(client.getChannelMembers).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockMembers, null, 2) },
      ],
    });
  });

  it("passes count and offset to client", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "chan1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.getChannelMembers).mockResolvedValueOnce({
      members: [],
      success: true,
    });

    await toolHandler({ roomName: "general", count: 10, offset: 5 });

    expect(client.getChannelMembers).toHaveBeenCalledWith("chan1", 10, 5);
  });

  it("returns isError for unsupported room types (dm)", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "dm1", name: "someuser", t: "d" },
      success: true,
    });

    const result = await toolHandler({ roomName: "someuser" });

    expect(client.getChannelMembers).not.toHaveBeenCalled();
    expect(client.getGroupMembers).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: 'Room "someuser" is type \'d\', which is not supported by get-room-members. Only public channels (c) and private groups (p) are supported.',
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
          text: "Failed to get room members: Rocket.Chat API error (404): Room Not Found",
        },
      ],
      isError: true,
    });
  });

  it("returns isError when the members API fails", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "grp1", name: "team-x", t: "p" },
      success: true,
    });
    vi.mocked(client.getGroupMembers).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Not authorized")
    );

    const result = await toolHandler({ roomName: "team-x" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to get room members: Rocket.Chat API error (403): Not authorized",
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
          text: "Failed to get room members: unexpected error",
        },
      ],
      isError: true,
    });
  });
});
