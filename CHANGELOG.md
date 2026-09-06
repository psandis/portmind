# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Monorepo scaffold (`packages/core`, `packages/cli`) with pnpm workspaces, shared TypeScript config, and Biome for lint/format.
- `@portmind/core`: `PortEntry` data shape and `PortmindConfig` schema with built-in defaults, matching the spec exactly (AI opt-in and off by default, explicit AI field allowlist).
- `@portmind/core`: real port scanner (Phase 1) - `lsof`-based TCP/UDP listening socket discovery with process enrichment (cmdline, cwd, start time via `ps` and `lsof -d cwd`), deduplicated across dual-stack/duplicate file descriptors.
- `@portmind/cli`: `portmind list` now runs a real scan and renders a table or `--json`, with working `--range`, `--docker-only`, and `--unusual` filters.
- Vitest test suite: `DEFAULT_CONFIG` invariants, `lsof` field-output parsing (mocked, no real sockets required), socket deduplication, table rendering, and an end-to-end CLI smoke test.
- README and this CHANGELOG.
- MIT `LICENSE`, and publish-ready `package.json` metadata (description, keywords, repository, author, `publishConfig.access: public` for both scoped packages) for an eventual `pnpm publish` of `@portmind/core` and `@portmind/cli`.

### Changed
- Upgraded all dependencies to latest major versions: `typescript` 7.0.2, `vitest` 5.0.0, `commander` 15.0.0, `better-sqlite3` 13.0.3, `@types/node` 26.4.1, `@types/better-sqlite3` 9.6.0. Added explicit `vite`/`esbuild` devDependencies to satisfy vitest 5's peer requirements. Required adding `"types": ["node"]` to the base tsconfig since TypeScript 7 no longer auto-includes `@types/node`.

### Known limitations
- Docker cross-reference, IANA known-port lookup, local history/"usual" detection, and risk flags are not implemented yet (Phases 3-6 of the build plan) - those fields on `PortEntry` are currently always `null`/empty/`true`.
