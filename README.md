# rocket-chat-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes Rocket.Chat messaging capabilities as tools for LLM agents. Built with TypeScript and the official MCP SDK.

## Features

- Send messages and thread replies
- Read channel and private group history with date filtering
- Full-text message search
- Read thread conversations
- Resolve channel and group names to room IDs
- List private groups and their members
- Two transport modes: **Streamable HTTP** (default) and **stdio** (`--stdio` flag)

## Prerequisites

- **Node.js 22+**
- A **Rocket.Chat** instance with API access
- A Rocket.Chat **user ID** and **auth token** (see [Authentication](#authentication))

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run (provide Rocket.Chat credentials via env vars)
ROCKETCHAT_URL=https://chat.example.com \
ROCKETCHAT_USER_ID=your-user-id \
ROCKETCHAT_AUTH_TOKEN=your-auth-token \
npm start
```

The server starts on port `3000` by default. Set the `PORT` env var to change it.

## Authentication

This server authenticates with Rocket.Chat using personal access tokens (header-based auth). To generate a token:

1. Go to **My Account → Personal Access Tokens** in your Rocket.Chat instance
2. Create a new token — note both the **Token** and your **User ID**
3. Pass them as environment variables:

| Variable | Description |
|---|---|
| `ROCKETCHAT_URL` | Base URL of your Rocket.Chat instance (e.g. `https://chat.example.com`) |
| `ROCKETCHAT_USER_ID` | Your Rocket.Chat user ID |
| `ROCKETCHAT_AUTH_TOKEN` | Your personal access token |

## Transport Modes

The server supports two transports:

| Mode | Flag | Use case |
|---|---|---|
| **Streamable HTTP** (default) | *(none)* | Run as a long-lived HTTP service (Docker, shared server) |
| **stdio** | `--stdio` | Client launches the process directly (VS Code, Claude Desktop) |

### Streamable HTTP (default)

Start the server, then point clients at the endpoint:

```bash
npm start   # listens on http://localhost:3000/mcp
```

### stdio

The client spawns the process and communicates over stdin/stdout:

```bash
node build/index.js --stdio
```

## Connecting MCP Clients

### VS Code (GitHub Copilot) — stdio

Add to your VS Code `settings.json` or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "rocket-chat": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/rocket-chat-mcp/build/index.js", "--stdio"],
      "env": {
        "ROCKETCHAT_URL": "https://chat.example.com",
        "ROCKETCHAT_USER_ID": "your-user-id",
        "ROCKETCHAT_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

### VS Code (GitHub Copilot) — HTTP

Start the server first (`npm start`), then:

```json
{
  "mcpServers": {
    "rocket-chat": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Claude Desktop — stdio

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rocket-chat": {
      "command": "node",
      "args": ["/absolute/path/to/rocket-chat-mcp/build/index.js", "--stdio"],
      "env": {
        "ROCKETCHAT_URL": "https://chat.example.com",
        "ROCKETCHAT_USER_ID": "your-user-id",
        "ROCKETCHAT_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

### Claude Desktop — HTTP

Start the server first (`npm start`), then:

```json
{
  "mcpServers": {
    "rocket-chat": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Docker — stdio

Use the pre-built multi-arch image (amd64 + arm64) from GHCR directly as the MCP command. No local Node.js installation required:

```json
{
  "mcpServers": {
    "rocket-chat": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "ROCKETCHAT_URL",
        "-e", "ROCKETCHAT_USER_ID",
        "-e", "ROCKETCHAT_AUTH_TOKEN",
        "ghcr.io/twostone/rocket-chat-mcp:edge",
        "node", "build/index.js", "--stdio"
      ],
      "env": {
        "ROCKETCHAT_URL": "https://chat.example.com",
        "ROCKETCHAT_USER_ID": "your-user-id",
        "ROCKETCHAT_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

## Available Tools

### `get-channel-info`

Resolve a channel name to its room ID. Use this first to get the `roomId` needed by other tools.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `channelName` | string | yes | Channel name without leading `#` |

### `get-messages`

Get message history from a channel.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Room ID |
| `count` | number | no | Number of messages to return (default: 20) |
| `offset` | number | no | Number of messages to skip (pagination) |
| `oldest` | string | no | ISO 8601 timestamp — only return messages after this date |
| `latest` | string | no | ISO 8601 timestamp — only return messages before this date |

### `search-messages`

Full-text search for messages in a channel.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Room ID |
| `searchText` | string | yes | Text to search for |
| `count` | number | no | Maximum number of results |
| `offset` | number | no | Number of results to skip (pagination) |

### `get-thread-messages`

Get all replies in a message thread.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tmid` | string | yes | Parent message ID (thread ID) |
| `count` | number | no | Number of messages to return (default: 20) |
| `offset` | number | no | Number of messages to skip (pagination) |

### `send-message`

Send a message to a channel or reply in a thread.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Room ID |
| `message` | string | yes | Message text |
| `tmid` | string | no | Parent message ID to reply in a thread |
| `tshow` | boolean | no | If `true`, thread reply is also shown in the main channel |

### `get-group-info`

Resolve a private group name to its room ID and metadata.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupName` | string | yes | Private group name |

### `get-group-messages`

Get message history from a private group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Private group room ID |
| `count` | number | no | Number of messages to return (default: 20) |
| `offset` | number | no | Number of messages to skip (pagination) |
| `oldest` | string | no | ISO 8601 timestamp — only return messages after this date |
| `latest` | string | no | ISO 8601 timestamp — only return messages before this date |

### `get-group-members`

List members of a private group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Private group room ID |
| `count` | number | no | Number of members to return (default: 20) |
| `offset` | number | no | Number of members to skip (pagination) |

### `get-channel-members`

List members of a public channel.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `roomId` | string | yes | Public channel room ID |
| `count` | number | no | Number of members to return (default: 20) |
| `offset` | number | no | Number of members to skip (pagination) |

### `list-rooms`

List all joined rooms (public channels, private groups, and DMs) of the authenticated user.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `updatedSince` | string | no | ISO 8601 date to only return rooms updated since that date |

### `search-directory`

Search the Rocket.Chat workspace directory for users or channels.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | The search term to filter results |
| `type` | `"users"` \| `"channels"` | yes | Type of directory entries to search for |
| `count` | number | no | Number of results to return |
| `offset` | number | no | Number of results to skip (pagination) |
| `workspace` | `"local"` \| `"all"` | no | Workspace scope: `local` (default) or `all` (requires federation) |

## Typical LLM Workflow

1. **`get-channel-info`** or **`get-group-info`** — resolve a channel/group name → `roomId`
2. **`list-rooms`** — discover all joined rooms (channels, groups, DMs)
3. **`search-directory`** — find users or channels by name across the workspace
4. **`get-messages`** or **`get-group-messages`** — read recent messages
5. **`search-messages`** — find specific content
6. **`get-thread-messages`** — read a thread conversation
7. **`get-group-members`** or **`get-channel-members`** — see who is in a room
8. **`send-message`** — reply (optionally in a thread via `tmid`)

## Docker

```bash
# Build image
docker build -t rocket-chat-mcp .

# Run
docker run -p 3000:3000 \
  -e ROCKETCHAT_URL=https://chat.example.com \
  -e ROCKETCHAT_USER_ID=your-user-id \
  -e ROCKETCHAT_AUTH_TOKEN=your-auth-token \
  rocket-chat-mcp
```

The Dockerfile uses a multi-stage build (build in `node:22`, run in `node:22-slim`).

## Development

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript → build/
npm run watch            # Compile in watch mode
npx tsx src/index.ts     # Run without building (dev)
npm test                 # Run tests (vitest)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
```
