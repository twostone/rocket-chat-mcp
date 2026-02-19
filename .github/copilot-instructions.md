# Project Guidelines — rocket-chat-mcp

MCP (Model Context Protocol) server in TypeScript that exposes Rocket.Chat messaging capabilities as tools for LLM agents.

## Architecture

- **Transport**: Two modes selected at startup:
  - **Streamable HTTP** (default) — `StreamableHTTPServerTransport`; server runs as a long-lived HTTP process; clients use a single `/mcp` endpoint
  - **stdio** (`--stdio` flag) — `StdioServerTransport`; client spawns the process and communicates over stdin/stdout
- **SDK**: `@modelcontextprotocol/sdk` (v1.x) with `McpServer` high-level API
- **Input validation**: Zod schemas passed to `server.tool()` / `server.registerTool()`
- **API client**: Thin typed wrapper around Rocket.Chat REST API v1, using `fetch`

```
src/
├── index.ts              # Entry point — creates McpServer, registers tools, connects StreamableHTTPServerTransport
├── tools/                # One file per tool or related group
│   ├── send-message.ts
│   ├── get-messages.ts
│   ├── get-thread-messages.ts
│   ├── search-messages.ts
│   ├── get-channel-info.ts
│   ├── get-group-info.ts
│   ├── get-group-messages.ts
│   ├── get-group-members.ts
│   ├── get-channel-members.ts
│   ├── list-rooms.ts
│   └── search-directory.ts
├── client/
│   └── rocketchat.ts     # Typed Rocket.Chat HTTP client (auth, error handling)
└── types.ts              # Shared Zod schemas and TS types
tests/                    # Mirrors src/ structure
├── tools/
│   ├── send-message.test.ts
│   ├── get-messages.test.ts
│   ├── get-thread-messages.test.ts
│   ├── search-messages.test.ts
│   ├── get-channel-info.test.ts
│   ├── get-group-info.test.ts
│   ├── get-group-messages.test.ts
│   ├── get-group-members.test.ts
│   ├── get-channel-members.test.ts
│   ├── list-rooms.test.ts
│   └── search-directory.test.ts
└── client/
    └── rocketchat.test.ts
```

## Code Style

- ESM (`"type": "module"` in package.json, `"module": "Node16"` in tsconfig)
- Strict TypeScript (`"strict": true`)
- `src/index.ts` starts with `#!/usr/bin/env node` shebang
- Zod schemas live next to where they're used (tool input schemas inline in tool files, shared types in `types.ts`)
- Tool handlers always return `{ content: [{ type: 'text', text: string }] }`; use `isError: true` for tool-level errors

## Build, Test, and Lint

```bash
npm install              # Install dependencies
npm run build            # tsc → build/
npm run watch            # tsc --watch for development
npm start                # node build/index.js (HTTP mode)
npm start -- --stdio     # stdio mode
npx tsx src/index.ts     # Run directly without build (dev)
npm test                 # vitest run (single pass)
npm run test:watch       # vitest (watch mode)
npm run test:coverage    # vitest run --coverage
npm run lint             # eslint check
npm run lint:fix         # eslint auto-fix
```

### Testing

- **Framework**: vitest — ESM-native, no extra config needed for `"type": "module"` projects
- **Tests are required** for every tool, the API client, and shared utilities — PRs without tests should not be merged
- **Test files** live in `tests/` mirroring `src/` structure, named `*.test.ts`
- **Mock the Rocket.Chat API** — use `vi.fn()` / `vi.spyOn()` to mock `fetch` calls; never hit a real Rocket.Chat instance in unit tests
- **Each tool test** must cover: successful execution, API error handling (`isError: true` response), and input validation edge cases
- **API client tests** must verify correct headers (`X-Auth-Token`, `X-User-Id`), URL construction, and error mapping

### Linting

- **Framework**: ESLint with `typescript-eslint` — flat config (`eslint.config.mjs`)
- **Rule set**: `eslint.configs.recommended` + `tseslint.configs.strict`
- **Type-aware**: Uses `tsconfig.eslint.json` (extends main tsconfig, includes `src/` and `tests/`)
- **All code must pass `npm run lint`** before merging — no warnings or errors allowed

### Docker

```bash
docker build -t rocket-chat-mcp .
docker run -p 3000:3000 \
  -e ROCKETCHAT_URL=https://chat.example.com \
  -e ROCKETCHAT_USER_ID=... \
  -e ROCKETCHAT_AUTH_TOKEN=... \
  rocket-chat-mcp
```

The `Dockerfile` uses a multi-stage build (install + build in `node:22`, copy into `node:22-slim` for runtime). The server listens on port `3000` by default (`PORT` env var).

## Project Conventions

- **Config via env vars** — `ROCKETCHAT_URL`, `ROCKETCHAT_USER_ID`, `ROCKETCHAT_AUTH_TOKEN` (no dotenv; MCP clients pass env)
- **One tool = one file** in `src/tools/` exporting a registration function that takes the `McpServer` instance
- **Rocket.Chat auth** uses token headers (`X-Auth-Token` + `X-User-Id`), not login flow
- **Tool naming**: kebab-case (`send-message`, `search-messages`)
- **Error handling**: Rocket.Chat API errors are caught and returned as `{ content: [...], isError: true }`, never thrown
- **Testing**: All functionality must have corresponding tests — tools, client, and utilities

## Integration Points

- **Rocket.Chat REST API v1** — base URL from `ROCKETCHAT_URL` env var
  - `POST /api/v1/chat.sendMessage` — send messages (requires `rid` + `msg`; optional `tmid` for thread replies)
  - `GET /api/v1/channels.history` — read channel history (`roomId`, pagination, `oldest`/`latest` date filters)
  - `GET /api/v1/channels.info` — resolve channel name to room ID (`roomName`)
  - `GET /api/v1/chat.search` — full-text search (`roomId` + `searchText`, pagination with `count`/`offset`)
  - `GET /api/v1/chat.getThreadMessages` — get all replies in a thread (`tmid`, pagination)
  - `GET /api/v1/groups.info` — resolve private group name to room ID (`roomName`)
  - `GET /api/v1/groups.history` — read private group message history (`roomId`, pagination, date filters)
  - `GET /api/v1/groups.members` — list members of a private group (`roomId`, pagination)
  - `GET /api/v1/channels.members` — list members of a public channel (`roomId`, pagination)
  - `GET /api/v1/rooms.get` — list all joined rooms (public channels, private groups, DMs)
  - `GET /api/v1/directory` — search workspace directory for users or channels (`query` JSON with `text`/`type`)
- **MCP clients** connect via Streamable HTTP at `http://<host>:3000/mcp` or stdio (`--stdio` flag)

## Security

- Auth tokens come from environment variables — never hardcode or log them
- Validate all user-supplied room IDs and message content through Zod schemas before hitting the API
- The server runs as an HTTP service (Docker or direct); no `bin` field needed for Streamable HTTP transport
