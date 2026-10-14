import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inject } from "vitest";
import type { Server } from "node:http";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { RocketChatClient } from "../../src/client/rocketchat.js";
import { createExpressApp } from "../../src/index.js";

const COMPOSER_BUNDLE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../build/ui/composer.html"
);
const COMPOSER_RESOURCE_URI = "ui://rocket-chat/composer.html";

/**
 * The composer resource serves the Vite bundle, which only exists after
 * `npm run build`. Skip the suite instead of failing when the developer has
 * not built it yet (the plain-MCP behaviour is covered by the main suite).
 */
describe.skipIf(!existsSync(COMPOSER_BUNDLE))(
  "composer app (integration)",
  () => {
    let httpServer: Server;
    let mcpClient: Client;

    beforeAll(async () => {
      const rcUrl = inject("rcUrl");
      const adminUserId = inject("adminUserId");
      const adminAuthToken = inject("adminAuthToken");

      const rcClient = new RocketChatClient({
        url: rcUrl,
        userId: adminUserId,
        authToken: adminAuthToken,
      });

      const app = await createExpressApp(rcClient);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(0, resolve);
      });
      const address = httpServer.address();
      if (address === null || typeof address === "string") {
        throw new Error("No bound address for test server");
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${address.port}/mcp`)
      );
      mcpClient = new Client({ name: "integration-test", version: "1.0.0" });
      await mcpClient.connect(transport);
    });

    afterAll(async () => {
      await mcpClient?.close();
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    describe("tools/list metadata", () => {
      it("exposes draft-message with the composer resource URI in _meta.ui", async () => {
        const { tools } = await mcpClient.listTools();
        const draft = tools.find((tool) => tool.name === "draft-message");
        expect(draft).toBeDefined();
        expect(draft?._meta?.ui?.resourceUri).toBe(COMPOSER_RESOURCE_URI);
        expect(draft?.annotations?.readOnlyHint).toBe(true);
        expect(draft?.title).toBe("Draft Message");
      });

      it("leaves send-message unrestricted when REQUIRE_DRAFT_REVIEW is unset", async () => {
        const { tools } = await mcpClient.listTools();
        const send = tools.find((tool) => tool.name === "send-message");
        expect(send).toBeDefined();
        // No _meta (or no ui.visibility) — the tool is visible to the model.
        expect(send?._meta?.ui?.visibility).toBeUndefined();
      });
    });

    describe("draft-message tool (against live Rocket.Chat)", () => {
      it("returns a structured draft resolving the room and sender", async () => {
        const channelName = inject("channelName");
        const result = await mcpClient.callTool({
          name: "draft-message",
          arguments: { roomName: channelName, message: "draft e2e text" },
        });

        expect(result.isError).toBeFalsy();
        const draft = result.structuredContent as Record<string, unknown>;
        expect(draft.roomName).toBe(channelName);
        expect(draft.message).toBe("draft e2e text");
        expect(draft.room).toEqual(
          expect.objectContaining({ kind: "channel" })
        );
        expect(draft.sender).toEqual(
          expect.objectContaining({ username: "rcadmin" })
        );
        expect(draft.tmid).toBeUndefined();
        expect(draft.parent).toBeUndefined();
      });

      it("includes the thread parent when a tmid is given", async () => {
        const channelName = inject("channelName");
        const seedMsgId = inject("seedMsgId");
        const result = await mcpClient.callTool({
          name: "draft-message",
          arguments: {
            roomName: channelName,
            message: "thread draft",
            tmid: seedMsgId,
          },
        });

        expect(result.isError).toBeFalsy();
        const draft = result.structuredContent as {
          tmid?: string;
          parent?: { username?: string; message?: string };
        };
        expect(draft.tmid).toBe(seedMsgId);
        expect(draft.parent?.message).toBe("integration test message 1");
      });

      it("returns isError=true for a non-existent room", async () => {
        const result = await mcpClient.callTool({
          name: "draft-message",
          arguments: { roomName: "__nonexistent__", message: "x" },
        });
        expect(result.isError).toBe(true);
      });
    });

    describe("composer resource", () => {
      it("lists the resource with the mcp-app MIME type", async () => {
        const { resources } = await mcpClient.listResources();
        const composer = resources.filter(
          (resource) => resource.uri === COMPOSER_RESOURCE_URI
        );
        expect(composer).toHaveLength(1);
        expect(composer[0]?.mimeType).toBe("text/html;profile=mcp-app");
      });

      it("serves the self-contained bundle as inlined HTML", async () => {
        const { contents } = await mcpClient.readResource({
          uri: COMPOSER_RESOURCE_URI,
        });

        const item = contents[0] as { text?: string };
        const html = item.text ?? "";

        // Self-contained: inlined JS and CSS, no external assets, mount point
        // present. (The CSP whitelist is asserted in the unit test, since the
        // MCP client does not surface content `_meta`.)
        expect(html.length).toBeGreaterThan(10_000);
        expect(html).toContain('<div id="root"></div>');
        expect(html).toMatch(/<style[^>]*>/);
        expect(html).not.toMatch(/<script[^>]+src\s*=/);
        expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/);
      });
    });
  }
);
