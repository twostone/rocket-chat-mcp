import { describe, it, expect, beforeAll } from "vitest";
import { inject } from "vitest";
import { RocketChatClient } from "../../src/client/rocketchat.js";

describe("RocketChatClient (integration)", () => {
  let client: RocketChatClient;
  let channelId: string;
  let groupId: string;
  let seedMsgId: string;

  beforeAll(() => {
    const rcUrl = inject("rcUrl");
    const adminUserId = inject("adminUserId");
    const adminAuthToken = inject("adminAuthToken");

    client = new RocketChatClient({
      url: rcUrl,
      userId: adminUserId,
      authToken: adminAuthToken,
    });

    channelId = inject("channelId");
    groupId = inject("groupId");
    seedMsgId = inject("seedMsgId");
  });

  describe("sendMessage", () => {
    it("sends a message to a channel and returns the message", async () => {
      const result = await client.sendMessage(channelId, "hello from integration test");

      expect(result.success).toBe(true);
      expect(result.message._id).toBeTruthy();
      expect(result.message.msg).toBe("hello from integration test");
    });

    it("throws on an invalid room ID", async () => {
      await expect(
        client.sendMessage("__invalid_room__", "hi")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getMessages", () => {
    it("retrieves messages from a channel", async () => {
      const result = await client.getMessages(channelId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("respects the count parameter", async () => {
      const result = await client.getMessages(channelId, 2);

      expect(result.messages.length).toBeLessThanOrEqual(2);
    });

    it("throws on an invalid room ID", async () => {
      await expect(client.getMessages("__invalid_room__")).rejects.toThrow(
        "Rocket.Chat API error"
      );
    });
  });

  describe("searchMessages", () => {
    it("returns messages matching the search text", async () => {
      const result = await client.searchMessages(channelId, "integration test");

      expect(result.success).toBe(true);
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("returns empty results for a non-matching search", async () => {
      const result = await client.searchMessages(
        channelId,
        "xyzzy-no-match-12345"
      );

      expect(result.success).toBe(true);
      expect(result.messages.length).toBe(0);
    });
  });

  describe("getThreadMessages", () => {
    it("retrieves thread replies for a message", async () => {
      const threadMsgId = inject("threadMsgId");
      const result = await client.getThreadMessages(seedMsgId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.messages)).toBe(true);
      const replyIds = result.messages.map((m) => m._id);
      expect(replyIds).toContain(threadMsgId);
    });

    it("throws on an invalid message ID", async () => {
      await expect(
        client.getThreadMessages("__invalid_tmid__")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getRoomInfo", () => {
    it("retrieves room info by room name", async () => {
      const channelName = inject("channelName");
      const result = await client.getRoomInfo(channelName);

      expect(result.success).toBe(true);
      expect(result.room._id).toBe(channelId);
    });

    it("throws for a non-existent room name", async () => {
      await expect(
        client.getRoomInfo("__nonexistent_room__")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getGroupMessages", () => {
    it("retrieves messages from a private group", async () => {
      const result = await client.getGroupMessages(groupId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it("throws on an invalid group room ID", async () => {
      await expect(
        client.getGroupMessages("__invalid_group__")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getGroupMembers", () => {
    it("returns members of a private group including the admin", async () => {
      const result = await client.getGroupMembers(groupId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.members)).toBe(true);
      const usernames = result.members.map((m) => m.username);
      expect(usernames).toContain("rcadmin");
    });

    it("throws on an invalid group room ID", async () => {
      await expect(
        client.getGroupMembers("__invalid_group__")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getChannelMembers", () => {
    it("returns members of a public channel including the admin", async () => {
      const result = await client.getChannelMembers(channelId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.members)).toBe(true);
      const usernames = result.members.map((m) => m.username);
      expect(usernames).toContain("rcadmin");
    });

    it("throws on an invalid channel room ID", async () => {
      await expect(
        client.getChannelMembers("__invalid_channel__")
      ).rejects.toThrow("Rocket.Chat API error");
    });
  });

  describe("getRooms", () => {
    it("returns a list of rooms that includes the test channel and group", async () => {
      const channelName = inject("channelName");
      const groupName = inject("groupName");
      const result = await client.getRooms();

      expect(result.success).toBe(true);
      const names = result.update.map((r) => r.name);
      expect(names).toContain(channelName);
      expect(names).toContain(groupName);
    });
  });

  describe("searchDirectory", () => {
    it("returns a valid response for a user directory search", async () => {
      const result = await client.searchDirectory("rcadmin", "users");

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
    });

    it("finds the test channel by name search", async () => {
      const channelName = inject("channelName");
      const result = await client.searchDirectory(channelName, "channels");

      expect(result.success).toBe(true);
      const names = result.result.map((r) => r.name);
      expect(names).toContain(channelName);
    });
  });
});
