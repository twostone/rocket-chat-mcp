#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import type { Application } from "express";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import type { McpServerFactory } from "@modelcontextprotocol/server";
import {
  toNodeHandler,
  hostHeaderValidation,
  originValidation,
} from "@modelcontextprotocol/node";
import { RocketChatClient } from "./client/rocketchat.js";
import { getConfigFromEnv } from "./types.js";
import { registerSendMessage } from "./tools/send-message.js";
import { registerGetRoomMessages } from "./tools/get-room-messages.js";
import { registerSearchMessages } from "./tools/search-messages.js";
import { registerGetRoomInfo } from "./tools/get-room-info.js";
import { registerGetThreadMessages } from "./tools/get-thread-messages.js";
import { registerGetRoomMembers } from "./tools/get-room-members.js";
import { registerListRooms } from "./tools/list-rooms.js";
import { registerSearchDirectory } from "./tools/search-directory.js";
import { registerDraftMessage } from "./tools/draft-message.js";

/**
 * Loads the bundled composer UI. Resolves the HTML from whichever layout the
 * module runs in: the compiled server (build/index.js → build/ui/composer.html)
 * or a dev/source checkout (src/index.ts → ui/composer.html). Returns
 * undefined when no build artifact is present, so the server still works —
 * tools just lose their interactive companion.
 */
async function loadComposerHtml(): Promise<string | undefined> {
  const candidates = [
    // Compiled layout: build/index.js → build/ui/composer.html
    new URL("./ui/composer.html", import.meta.url),
    // Dev/vitest layout: src/index.ts → build/ui/composer.html
    new URL("../build/ui/composer.html", import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(fileURLToPath(candidate), "utf-8");
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

/**
 * Per-request server factory. The MCP handler constructs a fresh instance per
 * request/connection (the protocol is stateless as of the 2026-07-28
 * revision: no Mcp-Session-Id, no per-connection state), so this must not
 * cache or share a single server instance.
 */
export function createServer(
  client: RocketChatClient,
  composerHtml?: string,
  requireDraftReview = false
): McpServer {
  const server = new McpServer({
    name: "rocket-chat-mcp",
    version: "1.0.0",
  });

  registerSendMessage(server, client, requireDraftReview);
  registerGetRoomMessages(server, client);
  registerSearchMessages(server, client);
  registerGetRoomInfo(server, client);
  registerGetThreadMessages(server, client);
  registerGetRoomMembers(server, client);
  registerListRooms(server, client);
  registerSearchDirectory(server, client);
  registerDraftMessage(server, client, composerHtml);

  return server;
}

export function createServerFactory(
  client: RocketChatClient,
  composerHtml?: string,
  requireDraftReview = false
): McpServerFactory {
  return () => createServer(client, composerHtml, requireDraftReview);
}

/**
 * Split a comma-separated env var into a trimmed, non-empty list. Returns
 * undefined when the value is absent or blank, signalling "validation off".
 */
function splitAllowlist(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

export async function createExpressApp(
  client: RocketChatClient
): Promise<Application> {
  const composerHtml = await loadComposerHtml();
  const requireDraftReview = Boolean(process.env.REQUIRE_DRAFT_REVIEW);
  const factory = createServerFactory(
    client,
    composerHtml,
    requireDraftReview
  );

  // createMcpHandler serves the 2026-07-28 (stateless) protocol and, by
  // default, falls back to stateless serving for 2025-era clients, so both
  // old and new MCP clients keep working behind the single /mcp endpoint.
  const mcpHandler = toNodeHandler(createMcpHandler(factory));

  // Opt-in inbound validation. Left unset by default so container and ingress
  // deployments (whose Host/Origin reflect the service, not a literal
  // localhost) work without configuration. Setting either env var enforces the
  // guard; it responds 403 itself when a request is rejected.
  const allowedHosts = splitAllowlist(process.env.ALLOWED_HOSTS);
  const allowedOrigins = splitAllowlist(process.env.ALLOWED_ORIGINS);
  const hostGuard = allowedHosts ? hostHeaderValidation(allowedHosts) : undefined;
  const originGuard = allowedOrigins ? originValidation(allowedOrigins) : undefined;

  const app = express();
  app.use(express.json());

  app.all("/mcp", (req, res) => {
    if (hostGuard && !hostGuard(req, res)) {
      return;
    }
    if (originGuard && !originGuard(req, res)) {
      return;
    }
    void mcpHandler(req, res, req.body);
  });

  return app;
}

const isEntryPoint =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isEntryPoint) {
  const config = getConfigFromEnv();
  const rcClient = new RocketChatClient(config);
  const useStdio = process.argv.includes("--stdio");

  if (useStdio) {
    const composerHtml = await loadComposerHtml();
    const server = createServer(
      rcClient,
      composerHtml,
      Boolean(process.env.REQUIRE_DRAFT_REVIEW)
    );
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const app = await createExpressApp(rcClient);
    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    app.listen(port, () => {
      console.log(`rocket-chat-mcp server listening on port ${port}`);
      console.log(`Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    });
  }
}
