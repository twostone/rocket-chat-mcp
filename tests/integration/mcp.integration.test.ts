import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inject } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { createExpressApp } from "../../src/index.js";

describe("MCP server (integration)", () => {
  let httpServer: Server;
  let mcpClient: Client;
  let channelId: string;

  beforeAll(async () => {
    const rcUrl = inject("rcUrl");
    const adminUserId = inject("adminUserId");
    const adminAuthToken = inject("adminAuthToken");
    channelId = inject("channelId");

    const rcClient = new RocketChatClient({
      url: rcUrl,
      userId: adminUserId,
      authToken: adminAuthToken,
    });

    const app = createExpressApp(rcClient);

    await new Promise<void>((resolve) => {
      httpServer = app.listen(0, resolve);
    });

    const address = httpServer.address() as { port: number };
    const mcpUrl = new URL(`http://localhost:${address.port}/mcp`);

    mcpClient = new Client({ name: "test-client", version: "1.0.0" });
    await mcpClient.connect(new StreamableHTTPClientTransport(mcpUrl));
  });

  afterAll(async () => {
    await mcpClient.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("send-message tool", () => {
    it("sends a message by room name and returns the message text", async () => {
      const channelName = inject("channelName");
      const result = await mcpClient.callTool({
        name: "send-message",
        arguments: { roomName: channelName, message: "mcp e2e test message" },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as { msg: string };
      expect(parsed.msg).toBe("mcp e2e test message");
    });

    it("returns isError=true for a non-existent room", async () => {
      const result = await mcpClient.callTool({
        name: "send-message",
        arguments: { roomName: "__nonexistent__", message: "should fail" },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("get-room-messages tool", () => {
    it("retrieves messages from a channel by name", async () => {
      const channelName = inject("channelName");
      const result = await mcpClient.callTool({
        name: "get-room-messages",
        arguments: { roomName: channelName },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it("retrieves messages from a group by name", async () => {
      const groupName = inject("groupName");
      const result = await mcpClient.callTool({
        name: "get-room-messages",
        arguments: { roomName: groupName },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("returns isError=true for a non-existent room", async () => {
      const result = await mcpClient.callTool({
        name: "get-room-messages",
        arguments: { roomName: "__invalid__" },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("search-messages tool", () => {
    it("returns messages matching the search text", async () => {
      const channelName = inject("channelName");
      const result = await mcpClient.callTool({
        name: "search-messages",
        arguments: { roomName: channelName, searchText: "integration test" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as unknown[];
      expect(parsed.length).toBeGreaterThan(0);
    });
  });

  describe("get-room-info tool", () => {
    it("returns room info for the test channel", async () => {
      const channelName = inject("channelName");
      const result = await mcpClient.callTool({
        name: "get-room-info",
        arguments: { roomName: channelName },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as { _id: string };
      expect(parsed._id).toBe(channelId);
    });
  });

  describe("list-rooms tool", () => {
    it("returns a list of rooms including the test channel", async () => {
      const channelName = inject("channelName");
      const result = await mcpClient.callTool({
        name: "list-rooms",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as { name?: string }[];
      const names = parsed.map((r) => r.name);
      expect(names).toContain(channelName);
    });
  });

  describe("get-room-members tool", () => {
    it("returns members of the test group including the admin", async () => {
      const groupName = inject("groupName");
      const result = await mcpClient.callTool({
        name: "get-room-members",
        arguments: { roomName: groupName },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as { username: string }[];
      const usernames = parsed.map((m) => m.username);
      expect(usernames).toContain("rcadmin");
    });
  });

  describe("end-to-end workflows", () => {
    it("sends a message to a channel by name", async () => {
      const channelName = inject("channelName");

      const sendResult = await mcpClient.callTool({
        name: "send-message",
        arguments: { roomName: channelName, message: "e2e workflow test" },
      });
      expect(sendResult.isError).toBeFalsy();
      const sent = JSON.parse(
        (sendResult.content[0] as { type: string; text: string }).text
      ) as { msg: string; rid: string };
      expect(sent.msg).toBe("e2e workflow test");
      expect(sent.rid).toBe(channelId);
    });

    it("reads message history by channel name", async () => {
      const channelName = inject("channelName");

      const msgResult = await mcpClient.callTool({
        name: "get-room-messages",
        arguments: { roomName: channelName },
      });
      expect(msgResult.isError).toBeFalsy();
      const messages = JSON.parse(
        (msgResult.content[0] as { type: string; text: string }).text
      ) as unknown[];
      expect(messages.length).toBeGreaterThan(0);
    });

    it("lists channel members by name", async () => {
      const channelName = inject("channelName");

      const membersResult = await mcpClient.callTool({
        name: "get-room-members",
        arguments: { roomName: channelName },
      });
      expect(membersResult.isError).toBeFalsy();
      const members = JSON.parse(
        (membersResult.content[0] as { type: string; text: string }).text
      ) as { username: string }[];
      expect(members.length).toBeGreaterThan(0);
      const usernames = members.map((m) => m.username);
      expect(usernames).toContain("rcadmin");
    });

    it("discovers a channel via search-directory then sends a message", async () => {
      const channelName = inject("channelName");

      // Step 1: search directory with a substring (case-insensitive)
      const searchResult = await mcpClient.callTool({
        name: "search-directory",
        arguments: { text: channelName, type: "channels" },
      });
      expect(searchResult.isError).toBeFalsy();
      const channels = JSON.parse(
        (searchResult.content[0] as { type: string; text: string }).text
      ) as { name: string }[];
      const match = channels.find((c) => c.name === channelName);
      if (!match) throw new Error(`Channel ${channelName} not found in directory`);

      // Step 2: send a message using the discovered name
      const sendResult = await mcpClient.callTool({
        name: "send-message",
        arguments: {
          roomName: match.name,
          message: "e2e search-directory workflow",
        },
      });
      expect(sendResult.isError).toBeFalsy();
      const sent = JSON.parse(
        (sendResult.content[0] as { type: string; text: string }).text
      ) as { msg: string; rid: string };
      expect(sent.msg).toBe("e2e search-directory workflow");
      expect(sent.rid).toBe(inject("channelId"));
    });
  });
});
