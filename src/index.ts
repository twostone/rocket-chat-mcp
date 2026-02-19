#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { RocketChatClient } from "./client/rocketchat.js";
import { getConfigFromEnv } from "./types.js";
import { registerSendMessage } from "./tools/send-message.js";
import { registerGetMessages } from "./tools/get-messages.js";
import { registerSearchMessages } from "./tools/search-messages.js";
import { registerGetRoomInfo } from "./tools/get-room-info.js";
import { registerGetThreadMessages } from "./tools/get-thread-messages.js";
import { registerGetGroupMessages } from "./tools/get-group-messages.js";
import { registerGetGroupMembers } from "./tools/get-group-members.js";
import { registerGetChannelMembers } from "./tools/get-channel-members.js";
import { registerListRooms } from "./tools/list-rooms.js";
import { registerSearchDirectory } from "./tools/search-directory.js";

const config = getConfigFromEnv();
const rcClient = new RocketChatClient(config);

function createServer(): McpServer {
  const server = new McpServer({
    name: "rocket-chat-mcp",
    version: "1.0.0",
  });

  registerSendMessage(server, rcClient);
  registerGetMessages(server, rcClient);
  registerSearchMessages(server, rcClient);
  registerGetRoomInfo(server, rcClient);
  registerGetThreadMessages(server, rcClient);
  registerGetGroupMessages(server, rcClient);
  registerGetGroupMembers(server, rcClient);
  registerGetChannelMembers(server, rcClient);
  registerListRooms(server, rcClient);
  registerSearchDirectory(server, rcClient);

  return server;
}

const useStdio = process.argv.includes("--stdio");

if (useStdio) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const app = express();
  app.use(express.json());

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId) as StreamableHTTPServerTransport;
    } else if (
      !sessionId &&
      req.method === "POST" &&
      isInitializeRequest(req.body)
    ) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
        }
      };

      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.log(`rocket-chat-mcp server listening on port ${port}`);
    console.log(`Streamable HTTP endpoint: http://localhost:${port}/mcp`);
  });
}
