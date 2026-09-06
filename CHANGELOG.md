# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.2] - 2026-09-06

### Changed
- **Renamed all packages from the `@portmind/*` npm scope to unscoped names**: `@portmind/core` -> `portmind-core`, `@portmind/cli` -> `portmind-cli`, `@portmind/web` -> `portmind-web`. The `@portmind` scope was never actually available to publish under - npm scoped names require the scope itself to be an owned npm username or organization, and no `portmind` organization existed under the publishing account. Renaming to unscoped names (same pattern already working for `portmind-monorepo`) avoids a dependency on creating and administering a separate npm organization just to publish. The CLI's `portmind` command name is unaffected - only the npm package names changed, not the `bin` entry.
- All imports (`from "@portmind/core"` etc.), `package.json` dependency references, and README mentions updated to match.
- **`portmind-core@0.3.2`, `portmind-web@0.3.2`, and `portmind-cli@0.3.2` published to npm.** `npm install -g portmind-cli` now gives a real, working `portmind` command - confirmed via a live global install (`portmind --version`, `portmind list` both verified working). README's Install section and npm badge updated to point at `portmind-cli` instead of the no-op `portmind-monorepo`, and a "Packages" section added explaining which of the four published packages to actually install.

## [0.3.1] - 2026-09-06

### Added
- `@portmind/core`: AI `explain` feature - provider abstraction for Anthropic (`/v1/messages`) and OpenAI (`/v1/chat/completions`), selected via `ai.provider` config with no code changes needed to switch; explicit field allowlist enforcement (`buildExplainPayload`, only sends fields named in `ai.fields_sent`); cmdline secret/token redaction (`sanitizeCmdline`) before anything is sent; SQLite response cache (`ai_explanations` table) keyed by `(process_name, port)` so repeat queries don't re-call the API.
- `@portmind/cli`: `portmind explain <port>` - opt-in, requires `ai.enabled: true` and an API key in `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`; fails with a clear config error (exit code `2`) rather than doing nothing if unconfigured.
- `@portmind/web`: `POST /api/explain` endpoint; the dashboard's "Explain with AI" button now makes a real request instead of showing a disabled placeholder.
- Web dashboard UX fixes: sticky header (title, filter toolbar, and column labels stay pinned while scrolling a long port list) and the detail panel is now a fixed slide-in panel from the right edge with a dimmed overlay, appearing instantly regardless of scroll position, instead of a block at the bottom of the page requiring a scroll to find. The panel now shows "Service name" and "Description" as two separate labeled fields.
- Vitest coverage: cmdline sanitization patterns, allowlist field selection, provider request-shape verification (mocked `fetch`, exact URL/headers/body per each provider's documented API), cache get/set/overwrite, and the full `explainPort` orchestration (disabled, missing key, cache hit, cache miss - all mocked).

### Known limitations
- **AI explain has not been tested against a real API key.** Every test mocks the HTTP layer; the request shapes match each provider's documented API as of this writing, but end-to-end correctness against the actual Anthropic/OpenAI services is unverified.
- The table's DESCRIPTION column and detail panel's "Description" field only populate for ports IANA has actually registered - most macOS system/app processes (e.g. rapportd, ControlCenter, Spotify) aren't registered services, so they correctly show "-" or, for genuinely coincidental port-number matches, an unrelated IANA description for that number.

## [0.3.0] - 2026-09-06

### Added
- `@portmind/core`: real IANA known-port lookup - CSV fetched and verified directly from `iana.org`, parsed into 11,394 real entries, bundled as `packages/core/data/iana-cache.json` so lookups work fully offline. `PortEntry.knownService` is now populated for any port with an official registration (e.g. `5432` -> "PostgreSQL Database", `3306` -> "MySQL").
- `@portmind/core`: real config file loader (`configLoader.ts`) - reads and deep-merges `~/.portmind/config.yaml` (user) and `.portmind.yaml` (project) over the built-in defaults. A config file that exists but fails to parse throws `ConfigError`, mapped to CLI exit code `2`. `known_ports.source: custom|both` + `custom_db_path` let a JSON file override or extend IANA (e.g. for internal services or dev-convention ports like Redis/MongoDB that IANA doesn't register).
- `@portmind/cli`: `portmind config show` (prints the fully resolved config as JSON) and `portmind config path` (prints both config file locations and whether each exists).
- `portmind.config.example.yaml` at repo root - copy-and-edit starting point for either config location.
- `scanPorts()` in `core` now takes a `knownPorts` config parameter (defaulting to `DEFAULT_CONFIG.knownPorts`), and both CLI `list` and the web server's `/api/ports` load real config via `loadConfig()` instead of using the hardcoded default - this is the actual wiring point through which config file changes take effect.
- Vitest coverage: IANA CSV parsing (quoted fields, Reserved/Unassigned filtering, non-tcp/udp transports), known-port lookup (iana/custom/both source modes, missing custom file handling), and config loading (defaults-only, project override merge, malformed-YAML error).

### Known limitations
- `known_ports.refresh_days` is not enforced - the bundled IANA cache is a one-time snapshot (fetched 2026-09-06), not auto-refreshed.
- `history.retention_days` and `risk_rules.*` are defined in config but not yet consumed - history and risk flags aren't implemented.
- `logging.audit_log` is defined but nothing writes to it yet - there's no `free`/`explain` command to audit.

## [0.2.0] - 2026-09-06

### Added
- `@portmind/web`: local-only web dashboard (Phase 8) - plain Node `http` server bound to `127.0.0.1`, `GET /api/ports` returning the same `PortEntry[]` JSON as `portmind list --json`, and a static vanilla HTML/JS page (no framework, no build step) with a sortable/filterable table and a row-click detail panel.
- `@portmind/cli`: `portmind web` command (`--port`, `--no-open`) that starts the dashboard and opens the default browser.
- Vitest coverage for the web server: page route, API route, and 404 handling.

### Fixed
- Root `package.json` (published to npm as `portmind-monorepo`) was missing `license` and `keywords` - added, along with matching metadata already present on the scoped packages.

### Known limitations
- The web dashboard's Docker-only/unusual filters have nothing to filter yet, since Docker cross-reference, history, and risk flags aren't implemented. Its "Explain with AI" button is a disabled placeholder pending Phase 9 (AI `explain`).
- `portmind-monorepo` on npm still has no `bin` field - it is not an installable CLI. The real CLI package, `@portmind/cli`, has not been published.

## [0.1.0] - 2026-09-06

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
