import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import {
  registerDraftMessage,
  COMPOSER_RESOURCE_URI,
} from "../../src/tools/draft-message.js";

vi.mock("../../src/client/rocketchat.js");

const ME = {
  _id: "u1",
  username: "bot",
  name: "Bot",
  avatarEtags: { bot: "etag123" },
  success: true,
};

describe("draft-message tool", () => {
  let server: McpServer;
  let client: RocketChatClient;
  let toolHandler: (args: Record<string, unknown>) => Promise<unknown>;

  const register = (composerHtml?: string) => {
    registerDraftMessage(server, client, composerHtml);
    const toolCall = vi.mocked(server.registerTool).mock.calls[0];
    toolHandler = toolCall[2] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
  };

  const registeredResourceRead = () =>
    vi.mocked(server.registerResource).mock.calls[0]?.[3] as
      | ((...args: unknown[]) => Promise<unknown>)
      | undefined;

  beforeEach(() => {
    server = {
      registerTool: vi.fn(),
      registerResource: vi.fn(),
    } as unknown as McpServer;

    client = {
      config: {
        url: "https://chat.example.com",
        userId: "u1",
        authToken: "token",
      },
      getRoomInfo: vi.fn(),
      getMe: vi.fn().mockResolvedValue(ME),
      getMessage: vi.fn(),
    } as unknown as RocketChatClient;

    register("<html>bundled composer</html>");
  });

  it("registers the tool with UI metadata pointing at the composer resource", () => {
    expect(vi.mocked(server.registerTool)).toHaveBeenCalledWith(
      "draft-message",
      expect.objectContaining({
        title: "Draft Message",
        _meta: expect.objectContaining({
          ui: { resourceUri: COMPOSER_RESOURCE_URI },
        }),
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      }),
      expect.any(Function)
    );
  });

  it("advertises no resourceUri when the composer HTML is unavailable", () => {
    const bareServer = {
      registerTool: vi.fn(),
      registerResource: vi.fn(),
    } as unknown as McpServer;
    registerDraftMessage(bareServer, client);

    const config = vi.mocked(bareServer.registerTool).mock.calls[0][1] as {
      _meta: { ui: unknown };
    };
    expect(config._meta.ui).toEqual({});
    expect(vi.mocked(bareServer.registerResource)).not.toHaveBeenCalled();
  });

  it("registers the composer resource with the app MIME type", () => {
    expect(vi.mocked(server.registerResource)).toHaveBeenCalledTimes(1);
    const [name, uri, meta] = vi.mocked(server.registerResource)
      .mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe("Rocket.Chat Composer");
    expect(uri).toBe(COMPOSER_RESOURCE_URI);
    expect(meta.mimeType).toBe("text/html;profile=mcp-app");
  });

  it("serves the bundled HTML with a CSP allowing the Rocket.Chat origin", async () => {
    const read = registeredResourceRead();
    expect(read).toBeDefined();
    if (!read) {
      throw new Error("expected resource read callback");
    }
    const result = (await read()) as {
      contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
      }>;
      _meta: { ui: { csp: { resourceDomains: string[] } } };
    };

    expect(result.contents).toEqual([
      {
        uri: COMPOSER_RESOURCE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: "<html>bundled composer</html>",
      },
    ]);
    expect(result._meta.ui.csp.resourceDomains).toEqual([
      "https://chat.example.com",
    ]);
  });

  it("prepares a channel draft with sender and avatar", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "room1", name: "general", t: "c" },
      success: true,
    });

    const result = (await toolHandler({
      roomName: "general",
      message: "Hello team!",
    })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
      isError?: boolean;
    };

    expect(result.isError).toBeUndefined();
    expect(client.getRoomInfo).toHaveBeenCalledWith("general");
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      roomName: "general",
      room: { displayName: "general", kind: "channel" },
      sender: {
        username: "bot",
        name: "Bot",
        avatarUrl:
          "https://chat.example.com/bot/etag123/avatar",
      },
      message: "Hello team!",
    });
    const text = result.content[0].text;
    expect(text).toContain("Draft prepared for general");
    expect(text).toContain("Hello team!");
  });

  it("maps a group room to kind group", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "grp1", name: "ops", t: "p" },
      success: true,
    });

    const result = (await toolHandler({
      roomName: "ops",
      message: "Heads up",
    })) as { structuredContent: { room: { kind: string } } };

    expect(result.structuredContent.room.kind).toBe("group");
  });

  it("resolves a DM room via its usernames when the name is absent", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "dm1", t: "d", usernames: ["alice"] },
      success: true,
    });

    const result = (await toolHandler({
      roomName: "alice",
      message: "Ping",
    })) as { structuredContent: { room: { displayName: string; kind: string } } };

    expect(result.structuredContent.room.kind).toBe("dm");
    expect(result.structuredContent.room.displayName).toBe("alice");
  });

  it("includes the parent message when drafting a thread reply", async () => {
    vi.mocked(client.getRoomInfo).mockResolvedValueOnce({
      room: { _id: "room1", name: "general", t: "c" },
      success: true,
    });
    vi.mocked(client.getMessage).mockResolvedValueOnce({
      _id: "parent1",
      rid: "room1",
      msg: "Original question",
      ts: "2026-01-02T10:00:00.000Z",
      u: { _id: "u2", username: "alice", name: "Alice" },
    });

    const result = (await toolHandler({
      roomName: "general",
      message: "Answer",
      tmid: "parent1",
    })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
    };

    expect(client.getMessage).toHaveBeenCalledWith("parent1");
    expect(result.structuredContent).toEqual({
      roomName: "general",
      room: { displayName: "general", kind: "channel" },
      sender: {
        username: "bot",
        name: "Bot",
        avatarUrl: "https://chat.example.com/bot/etag123/avatar",
      },
      message: "Answer",
      tmid: "parent1",
      parent: {
        username: "alice",
        name: "Alice",
        avatarUrl: null,
        message: "Original question",
        ts: "2026-01-02T10:00:00.000Z",
      },
    });
    expect(result.content[0].text).toContain("(thread reply)");
  });

  it("returns isError=true when the room does not exist", async () => {
    vi.mocked(client.getRoomInfo).mockRejectedValueOnce(
      new Error("Rocket.Chat API error (404): Not Found")
    );

    const result = (await toolHandler({
      roomName: "nope",
      message: "x",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to draft message");
  });
});
