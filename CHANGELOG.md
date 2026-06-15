# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `./mcp` entry — expose Convex functions as MCP tools (`createMCPServer` + `query`/`mutation`/`action`/`resource`), default-deny auth, lifecycle hooks, validator→zod conversion, and optional HMAC-signed cursor pagination. Absorbed from `@vllnt/convex-mcp` (see ROADMAP `absorb-convex-mcp`). `@modelcontextprotocol/sdk` and `zod` are optional peer deps — the `./mcp` entry is tree-shakeable, so backend-only consumers pull neither. 100% test coverage retained (161 tests).

## [0.1.0] - 2026-06-13

### Added

- Scaffolded to fleet Universal standard (type-B helpers library)
- Seed root utilities: `asyncMap`, `pruneNull`, `nullThrows`, `NullDocumentError`
- 100% test coverage gate via vitest thresholds
- CI workflow, publish workflow, email-guard workflow
- Full docs set: README, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- `llms.txt` and `llms-full.txt` for AI agent discovery
