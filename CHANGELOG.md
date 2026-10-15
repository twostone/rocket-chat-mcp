# [0.5.0](https://github.com/twostone/rocket-chat-mcp/compare/v0.4.1...v0.5.0) (2026-10-15)


### Bug Fixes

* **ui:** adapt serializer and mappers to message-parser 0.32 ([6256227](https://github.com/twostone/rocket-chat-mcp/commit/6256227b9d53591fe9f7abf19694418ad1dedbdf))
* **ui:** tighten AST mapper and serializer typings against the parser ([e9957e9](https://github.com/twostone/rocket-chat-mcp/commit/e9957e913647bd3f39cc394acf128c3e319dfb91))


### Features

* **ui:** add ProseMirror composer editor with keyboard, paste, drop contracts ([a6c97c3](https://github.com/twostone/rocket-chat-mcp/commit/a6c97c31c278adc991e161774896b5557d8a757d))
* **ui:** add WYSIWYG editor React component with formatting toolbar ([bd307d7](https://github.com/twostone/rocket-chat-mcp/commit/bd307d7f06d2991c92f2124782ad6ac496307a91))
* **ui:** wire the WYSIWYG editor into the composer with close-on-success ([640e34e](https://github.com/twostone/rocket-chat-mcp/commit/640e34e040cee56e09dc3df4bc646dfbe38cec50))

## [0.4.1](https://github.com/twostone/rocket-chat-mcp/compare/v0.4.0...v0.4.1) (2026-10-14)


### Bug Fixes

* **deps:** update dependency [@rocket](https://github.com/rocket).chat/message-parser to ^0.32.0 ([2e7c6ed](https://github.com/twostone/rocket-chat-mcp/commit/2e7c6edd79f445cc308bbd7655b313f32ccd6176))

# [0.4.0](https://github.com/twostone/rocket-chat-mcp/compare/v0.3.0...v0.4.0) (2026-10-14)


### Bug Fixes

* **list-rooms:** account for DM rooms lacking a name ([f16cc0b](https://github.com/twostone/rocket-chat-mcp/commit/f16cc0b9070df550c4d5a3477c5dba891d123e74))


### Features

* **client:** add getMe and getMessage for drafts ([cd86e90](https://github.com/twostone/rocket-chat-mcp/commit/cd86e90a0374049f897e7c7065313b88f8a1cd86))
* **tools:** add draft-message tool with composer MCP app resource ([d53088e](https://github.com/twostone/rocket-chat-mcp/commit/d53088e11c9626dbe3ab29b309ba2b9dac16b4b7))
* **tools:** add output schemas, structured results, titles, annotations ([ffebe86](https://github.com/twostone/rocket-chat-mcp/commit/ffebe8694604766f50f7aa72cdcfc03f6bf85205))
* **ui:** add React composer app with live Rocket.Chat-style preview ([dc6384a](https://github.com/twostone/rocket-chat-mcp/commit/dc6384a2e15ad23973d41681372e7270c8ba382d))

# [0.3.0](https://github.com/twostone/rocket-chat-mcp/compare/v0.2.1...v0.3.0) (2026-10-08)


### Features

* name-based room tools (combined read tools + send/search by name) ([#26](https://github.com/twostone/rocket-chat-mcp/issues/26)) ([6aa4a37](https://github.com/twostone/rocket-chat-mcp/commit/6aa4a376ad49aa2b57162e24fe78e8a2ec9e6b31))

## [0.2.1](https://github.com/twostone/rocket-chat-mcp/compare/v0.2.0...v0.2.1) (2026-10-08)


### Bug Fixes

* **renovate:** use packageRules instead of invalid groups option ([#29](https://github.com/twostone/rocket-chat-mcp/issues/29)) ([bc65580](https://github.com/twostone/rocket-chat-mcp/commit/bc65580dab4c3e7d8c9e95fbb4b43bd620153293))

# [0.2.0](https://github.com/TwoStone/rocket-chat-mcp/compare/v0.1.0...v0.2.0) (2026-04-08)


### Features

* add integration tests with testcontainers and CI workflow ([070b69b](https://github.com/TwoStone/rocket-chat-mcp/commit/070b69b9b3e10041da63fb1c241d57dd1d0aeec3))

# [0.1.0](https://github.com/TwoStone/rocket-chat-mcp/compare/v0.0.1...v0.1.0) (2026-02-19)


### Features

* automate releases with semantic-release\n\n- Add semantic-release with changelog and git plugins\n- Add release job to CI that runs on main, builds versioned Docker image\n- Remove old tag-triggered release workflow\n- CHANGELOG.md will be auto-generated on first release ([d4f42b3](https://github.com/TwoStone/rocket-chat-mcp/commit/d4f42b353c73286542fd597e777a50ca007876e4))
