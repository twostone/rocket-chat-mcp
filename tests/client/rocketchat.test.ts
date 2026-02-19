import { describe, it, expect, vi, beforeEach } from "vitest";
import { RocketChatClient } from "../../src/client/rocketchat.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("RocketChatClient", () => {
  const config = {
    url: "https://chat.example.com",
    userId: "user123",
    authToken: "token456",
  };
  let client: RocketChatClient;

  beforeEach(() => {
    client = new RocketChatClient(config);
    mockFetch.mockReset();
  });

  describe("auth headers", () => {
    it("sends X-Auth-Token and X-User-Id on every request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getMessages("room1");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toMatchObject({
        "X-Auth-Token": "token456",
        "X-User-Id": "user123",
        "Content-Type": "application/json",
      });
    });
  });

  describe("sendMessage", () => {
    it("calls POST /api/v1/chat.sendMessage with correct body", async () => {
      const mockResponse = {
        message: {
          _id: "msg1",
          rid: "room1",
          msg: "Hello",
          ts: "2026-01-01T00:00:00.000Z",
          u: { _id: "user123", username: "testuser" },
        },
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.sendMessage("room1", "Hello");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://chat.example.com/api/v1/chat.sendMessage",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: { rid: "room1", msg: "Hello" } }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes tmid in body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: {}, success: true }),
      });

      await client.sendMessage("room1", "Reply", { tmid: "parent1" });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.message.tmid).toBe("parent1");
      expect(body.message.tshow).toBeUndefined();
    });

    it("includes tmid and tshow in body when both provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: {}, success: true }),
      });

      await client.sendMessage("room1", "Reply", {
        tmid: "parent1",
        tshow: true,
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.message.tmid).toBe("parent1");
      expect(body.message.tshow).toBe(true);
    });

    it("excludes tmid and tshow when options not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: {}, success: true }),
      });

      await client.sendMessage("room1", "Hello");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.message).toEqual({ rid: "room1", msg: "Hello" });
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });

      await expect(client.sendMessage("room1", "Hello")).rejects.toThrow(
        "Rocket.Chat API error (403): Forbidden"
      );
    });
  });

  describe("getMessages", () => {
    it("calls GET /api/v1/channels.history with roomId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getMessages("room1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/channels.history?roomId=room1"
      );
    });

    it("includes count and offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getMessages("room1", 10, 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("roomId=room1");
      expect(url).toContain("count=10");
      expect(url).toContain("offset=5");
    });

    it("includes oldest and latest when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getMessages(
        "room1",
        undefined,
        undefined,
        "2026-01-01T00:00:00.000Z",
        "2026-01-31T23:59:59.000Z"
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("oldest=2026-01-01T00%3A00%3A00.000Z");
      expect(url).toContain("latest=2026-01-31T23%3A59%3A59.000Z");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Channel not found",
      });

      await expect(client.getMessages("badroom")).rejects.toThrow(
        "Rocket.Chat API error (404): Channel not found"
      );
    });
  });

  describe("searchMessages", () => {
    it("calls GET /api/v1/chat.search with roomId and searchText", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.searchMessages("room1", "hello world");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        "https://chat.example.com/api/v1/chat.search?"
      );
      expect(url).toContain("roomId=room1");
      expect(url).toContain("searchText=hello+world");
    });

    it("includes count when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.searchMessages("room1", "test", 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("count=5");
    });

    it("includes offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.searchMessages("room1", "test", 5, 10);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("count=5");
      expect(url).toContain("offset=10");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        client.searchMessages("room1", "test")
      ).rejects.toThrow("Rocket.Chat API error (500): Internal Server Error");
    });
  });

  describe("getThreadMessages", () => {
    it("calls GET /api/v1/chat.getThreadMessages with tmid", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getThreadMessages("parent1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/chat.getThreadMessages?tmid=parent1"
      );
    });

    it("includes count and offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getThreadMessages("parent1", 10, 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("tmid=parent1");
      expect(url).toContain("count=10");
      expect(url).toContain("offset=5");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Thread not found",
      });

      await expect(client.getThreadMessages("badthread")).rejects.toThrow(
        "Rocket.Chat API error (404): Thread not found"
      );
    });
  });

  describe("getRoomInfo", () => {
    it("calls GET /api/v1/rooms.info with roomName", async () => {
      const mockResponse = {
        room: { _id: "room1", name: "general" },
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getRoomInfo("general");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/rooms.info?roomName=general"
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Room not found",
      });

      await expect(client.getRoomInfo("nonexistent")).rejects.toThrow(
        "Rocket.Chat API error (404): Room not found"
      );
    });
  });

  describe("getGroupMessages", () => {
    it("calls GET /api/v1/groups.history with roomId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getGroupMessages("grp1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/groups.history?roomId=grp1"
      );
    });

    it("includes count, offset, oldest, and latest when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await client.getGroupMessages(
        "grp1",
        10,
        5,
        "2026-01-01T00:00:00.000Z",
        "2026-01-31T23:59:59.000Z"
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("roomId=grp1");
      expect(url).toContain("count=10");
      expect(url).toContain("offset=5");
      expect(url).toContain("oldest=2026-01-01T00%3A00%3A00.000Z");
      expect(url).toContain("latest=2026-01-31T23%3A59%3A59.000Z");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Group not found",
      });

      await expect(client.getGroupMessages("badgroup")).rejects.toThrow(
        "Rocket.Chat API error (404): Group not found"
      );
    });
  });

  describe("getGroupMembers", () => {
    it("calls GET /api/v1/groups.members with roomId", async () => {
      const mockResponse = {
        members: [{ _id: "u1", username: "alice", name: "Alice" }],
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getGroupMembers("grp1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/groups.members?roomId=grp1"
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes count and offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members: [], success: true }),
      });

      await client.getGroupMembers("grp1", 10, 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("count=10");
      expect(url).toContain("offset=5");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Not allowed",
      });

      await expect(client.getGroupMembers("grp1")).rejects.toThrow(
        "Rocket.Chat API error (403): Not allowed"
      );
    });
  });

  describe("getChannelMembers", () => {
    it("calls GET /api/v1/channels.members with roomId", async () => {
      const mockResponse = {
        members: [{ _id: "u1", username: "alice", name: "Alice" }],
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getChannelMembers("ch1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/channels.members?roomId=ch1"
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes count and offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members: [], success: true }),
      });

      await client.getChannelMembers("ch1", 10, 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("count=10");
      expect(url).toContain("offset=5");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Not allowed",
      });

      await expect(client.getChannelMembers("ch1")).rejects.toThrow(
        "Rocket.Chat API error (403): Not allowed"
      );
    });
  });

  describe("searchDirectory", () => {
    it("calls GET /api/v1/directory with query JSON", async () => {
      const mockResponse = {
        result: [{ _id: "u1", username: "alice", name: "Alice" }],
        count: 1,
        offset: 0,
        total: 1,
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.searchDirectory("alice", "users");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        "https://chat.example.com/api/v1/directory?"
      );
      expect(url).toContain(
        `query=${encodeURIComponent(JSON.stringify({ text: "alice", type: "users" }))}`
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes workspace in query JSON when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [],
          count: 0,
          offset: 0,
          total: 0,
          success: true,
        }),
      });

      await client.searchDirectory("bob", "users", undefined, undefined, "all");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        `query=${encodeURIComponent(JSON.stringify({ text: "bob", type: "users", workspace: "all" }))}`
      );
    });

    it("includes count and offset when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [],
          count: 0,
          offset: 10,
          total: 0,
          success: true,
        }),
      });

      await client.searchDirectory("test", "channels", 5, 10);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("count=5");
      expect(url).toContain("offset=10");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        client.searchDirectory("test", "users")
      ).rejects.toThrow(
        "Rocket.Chat API error (500): Internal Server Error"
      );
    });
  });

  describe("getRooms", () => {
    it("calls GET /api/v1/rooms.get", async () => {
      const mockResponse = {
        update: [
          { _id: "ch1", name: "general", t: "c" },
          { _id: "grp1", name: "secret-team", t: "p" },
        ],
        success: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getRooms();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://chat.example.com/api/v1/rooms.get"
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes updatedSince when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ update: [], success: true }),
      });

      await client.getRooms("2025-01-01T00:00:00.000Z");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("updatedSince=2025-01-01T00%3A00%3A00.000Z");
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });

      await expect(client.getRooms()).rejects.toThrow(
        "Rocket.Chat API error (403): Forbidden"
      );
    });
  });

  describe("URL construction", () => {
    it("strips trailing slashes from base URL", async () => {
      const clientWithSlash = new RocketChatClient({
        ...config,
        url: "https://chat.example.com/",
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], success: true }),
      });

      await clientWithSlash.getMessages("room1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        "https://chat.example.com/api/v1/channels.history"
      );
    });
  });
});
