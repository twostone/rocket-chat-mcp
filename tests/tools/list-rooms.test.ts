import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { registerListRooms } from "../../src/tools/list-rooms.js";

vi.mock("../../src/client/rocketchat.js");

describe("list-rooms tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    client = {
      getRooms: vi.fn(),
    } as unknown as RocketChatClient;

    registerListRooms(server, client);

    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  });

  it("registers tool with correct name", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "list-rooms",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });

  it("returns rooms on success", async () => {
    const mockRooms = [
      { _id: "ch1", name: "general", t: "c" },
      { _id: "grp1", name: "secret-team", t: "p" },
      { _id: "dm1", name: "alice", t: "d" },
    ];
    vi.mocked(client.getRooms).mockResolvedValueOnce({
      update: mockRooms,
      success: true,
    });

    const result = await toolHandler({});

    expect(client.getRooms).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify(mockRooms, null, 2) },
      ],
    });
  });

  it("passes updatedSince to client", async () => {
    vi.mocked(client.getRooms).mockResolvedValueOnce({
      update: [],
      success: true,
    });

    await toolHandler({ updatedSince: "2025-01-01T00:00:00.000Z" });

    expect(client.getRooms).toHaveBeenCalledWith(
      "2025-01-01T00:00:00.000Z"
    );
  });

  it("returns isError on API failure", async () => {
    vi.mocked(client.getRooms).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (403): Forbidden")
    );

    const result = await toolHandler({});

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Failed to list rooms: Rocket.Chat API error (403): Forbidden",
        },
      ],
      isError: true,
    });
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(client.getRooms).mockRejectedValueOnce("unexpected error");

    const result = await toolHandler({});

    expect(result).toEqual({
      content: [
        { type: "text", text: "Failed to list rooms: unexpected error" },
      ],
      isError: true,
    });
  });
});
