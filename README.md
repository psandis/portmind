# portmind

[![npm version](https://img.shields.io/npm/v/portmind-monorepo.svg)](https://www.npmjs.com/package/portmind-monorepo)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Local-first CLI + web dashboard that scans listening ports on your machine, enriches them with process/Docker/IANA detail, remembers what *normally* runs on each port, and flags what's unusual — no cloud, no telemetry, no background AI calls.

> `portmind-monorepo` is published on npm (see the badge above), but it has no `bin` field — installing it does not give you a `portmind` command. `@portmind/cli`, the package that actually would, is not published yet.

## Status

**Working today:**
- `portmind list` runs a real scan (`lsof`-based) of TCP and UDP listening sockets on macOS/Linux
- Each result is enriched with process command line, working directory, and start time (`ps` + `lsof -d cwd`)
- `--range <min-max>`, `--docker-only`, `--unusual`, and `--json` filters/output modes
- Table and JSON output share one `PortEntry` type, defined once in `@portmind/core`
- `portmind web` starts a local-only dashboard (`127.0.0.1`, plain HTML/JS, no framework, no build step) serving the same data as `portmind list --json` over `GET /api/ports`, with a sortable/filterable table and a row-click detail panel
- Real known-port descriptions via the official IANA Service Name and Port Number Registry (11,394 entries bundled, fetched and verified from `iana.org` — e.g. port 5432 shows "PostgreSQL Database", not a placeholder)
- A real, working config file loader — `~/.portmind/config.yaml` (user) and `.portmind.yaml` (project) are both read and merged over the defaults; `portmind config show`/`config path` expose the resolved result and file locations
- `known_ports.source: custom` or `both` in config lets you point at your own JSON file to override or add service descriptions IANA doesn't have (internal services, dev conventions like Redis/MongoDB that aren't officially IANA-registered)
- AI `explain` (opt-in, off by default) — `portmind explain <port>` and the web dashboard's "Explain with AI" button both make a real call to Anthropic or OpenAI (your choice, via `ai.provider`), sending only the explicit field allowlist (never full env vars or file contents), with cmdline secrets/tokens redacted first and results cached in SQLite so repeat queries don't re-call the API. **Not tested against a live API key** — the request-construction logic (allowlist, sanitization, exact payload shape) is unit-tested with a mocked HTTP layer, but no real call to Anthropic/OpenAI has been made to confirm end-to-end correctness.

**Not implemented yet** (see [Next steps](#next-steps)): Docker cross-reference, local history/"usual" detection, risk flags, `watch`/`free`/`history`/`ssh`/`tui` commands. Until those land, every `PortEntry.docker` and `.riskFlags` will be empty, and `.history.usual` is always `true` — so the web dashboard's Docker/unusual filters currently have nothing to filter.

See [CHANGELOG.md](./CHANGELOG.md) for a dated record of what shipped when.

## Requirements

- Node.js 22+
- pnpm 9+
- macOS or Linux — `lsof` must be on `$PATH` (this is the only scan backend implemented so far; Linux's `ss` is not wired up yet despite being mentioned in the original design)
- Docker CLI (`docker`) optional — not yet used, but scans are designed to degrade gracefully once Docker cross-referencing is added

## Install (development)

```bash
pnpm install
pnpm build
```

There's no published package yet, so there's nothing to `npm install -g`. Run the CLI directly from this repo:

```bash
node packages/cli/dist/index.js list
```

## Usage

```bash
portmind list                    # full table, all listening ports on localhost
portmind list --range 3000-9000  # filter by port range
portmind list --docker-only      # only Docker-backed ports (no-op until Docker cross-reference ships)
portmind list --unusual          # only ports flagged unusual or risky (no-op until history/risk flags ship)
portmind list --json             # machine-readable output for scripting/CI
```

Example output:

```
PORT   PROTO  PROCESS       PID     DOCKER  USUAL  NOTE
3000   tcp    node          41822   -       yes    /Users/you/Projects/react-dashboard
5432   tcp    postgres      1758    -       yes    PostgreSQL Database
```

**Exit codes:** `0` success, `1` scan error, `2` config error.

### Web dashboard

```bash
portmind web                   # starts on http://127.0.0.1:4400 and opens your browser
portmind web --port 4401       # use a different port for the dashboard itself
portmind web --no-open         # don't open the browser automatically
```

Why a plain server + vanilla JS instead of a framework: the dashboard is three routes (the page, `/api/ports`, `/api/explain`), it never leaves your machine except for the explicit opt-in AI call, and there's no build pipeline to maintain — consistent with the "local-first, no telemetry" design of the rest of the tool. The page polls `/api/ports` on load and on manual refresh (or a 5-second auto-refresh you opt into). Clicking a row opens a fixed panel from the right edge of the screen (with a dimmed overlay behind it) showing full detail — no scrolling required regardless of where in the table you clicked. Its "Explain with AI" button only fires `/api/explain` when clicked, never automatically.

### AI explain

```bash
portmind explain 5432   # runs AI deep-search for whatever is currently on port 5432
```

Requires `ai.enabled: true` in config and an API key in the matching environment variable (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` depending on `ai.provider` — never put the key in the config file itself). Disabled by default; both the CLI command and the web button fail with a clear config error (exit code `2` for the CLI) rather than silently doing nothing if it's not configured. Results are cached in SQLite keyed by `(process_name, port)`, so asking about the same shape of thing twice doesn't re-call the API.

### Config

```bash
portmind config show   # print the fully resolved config (defaults + user + project merged), as JSON
portmind config path   # print ~/.portmind/config.yaml and ./.portmind.yaml, and whether each exists
```

Copy [portmind.config.example.yaml](./portmind.config.example.yaml) to `~/.portmind/config.yaml` or `./.portmind.yaml` to change behavior — only the keys you include override the defaults, anything omitted falls back. Malformed YAML in a config file that exists is a hard error (exit code `2`), not silently ignored.

Planned commands not yet implemented: `watch`, `free`, `history`, `ssh <host> list|check`, `tui`.

## Storage

History will be stored locally in a SQLite database at `~/.portmind/portmind.db` (configurable) once the history feature (Phase 4) lands - the same db file already holds the `ai_explanations` cache table today. Nothing leaves the machine unless you explicitly run `portmind explain <port>` (or click "Explain with AI") with AI enabled in config, and even then only an explicit allowlist of fields is sent — never full environment variables or file contents, and cmdline values are scanned for secret/token-shaped substrings and redacted before sending.

## Configuration

Real and working. Resolution order (later overrides earlier, and only the keys you actually set are overridden - everything else falls back): built-in defaults → `~/.portmind/config.yaml` (user) → `.portmind.yaml` in the current directory (project). See [portmind.config.example.yaml](./portmind.config.example.yaml) for a copy-and-edit starting point.

```yaml
scan:
  interval_seconds: 5
  include_udp: true
  docker: true
  ssh_hosts: []

known_ports:
  source: iana              # iana | custom | both
  custom_db_path: null
  refresh_days: 30

history:
  enabled: true
  db_path: ~/.portmind/portmind.db
  retention_days: 180

risk_rules:
  flag_bound_all_interfaces: true
  flag_unsigned_binary: true     # macOS only, no-op elsewhere
  flag_no_known_service: true

ai:
  enabled: false                  # opt-in, off by default
  provider: anthropic             # anthropic | openai | none
  model: claude-sonnet-4-6
  trigger: manual
  fields_sent:                    # explicit allowlist - nothing outside this list is ever sent
    - process_name
    - cmdline
    - port
    - protocol
    - docker_image
  cmdline_sanitization: true

output:
  default_format: table           # table | json
  color: auto                     # auto | always | never

logging:
  level: info                     # debug | info | warn | error
  audit_log: false
```

The TypeScript shape (`PortmindConfig`), its defaults, and the loader/merge logic live in [packages/core/src/config.ts](./packages/core/src/config.ts) and [packages/core/src/configLoader.ts](./packages/core/src/configLoader.ts). Not yet wired to config: `history.retention_days` (history isn't implemented), `risk_rules.*` (risk flags aren't implemented), `known_ports.refresh_days` (the bundled IANA cache doesn't auto-refresh yet - refreshing it means re-fetching the CSV and regenerating `packages/core/data/iana-cache.json`, which isn't automated).

## Architecture

```
packages/
├── core/   # scanning, enrichment, data model, config — no UI, no AI dependency
├── cli/    # table/JSON output over @portmind/core (implemented)
├── tui/    # live terminal dashboard — not started
├── web/    # local HTML dashboard (implemented: /api/ports + static page)
└── ai/     # optional AI deep-search plugin — not started
```

`core` has zero UI and zero AI dependencies. `cli`, `tui`, and `web` are meant to be thin renderers over the same `PortEntry[]` shape — no duplicated scanning logic between them.

## Next steps

Remaining phases, in build order:

1. **History and "usual" detection** — SQLite `observations`/`port_fingerprints` tables, `history <port>` command
2. **Docker cross-reference** — match `docker ps` output against scanned ports, populate `PortEntry.docker`
3. **Risk flags** — `bound_all_interfaces`, `unsigned_binary`, `no_known_service`, each independently configurable
4. **TUI** (`ink` or `blessed` — undecided) — live table with inline `explain`/`free`
5. **SSH remote support** — `ssh_hosts` config, same `PortEntry` shape with `host` set to the remote name
6. **Audit logging** — log every `free`/`explain` action per `logging.audit_log`
7. **IANA cache auto-refresh** — automate re-fetching the CSV on `known_ports.refresh_days`, rather than the current bundled-once snapshot
8. **Polish** — full `--help` text, packaging for `npm install -g @portmind/cli`
9. **AI explain: real end-to-end verification** — the feature is built and unit-tested with a mocked HTTP layer, but has never actually been called against Anthropic or OpenAI with a real API key. Verifying that happens whenever a key becomes available to test with.

Web dashboard, IANA enrichment, the config file loader, and AI `explain` (untested end-to-end - see above) are done — see [Status](#status).

Two decisions still open: TUI library (`ink` vs `blessed`), and whether `free` on a Docker-backed port needs anything beyond the interactive stop/kill/cancel prompt already agreed on.

## Development

```bash
pnpm test     # run all package test suites (Vitest)
pnpm lint     # Biome check
pnpm format   # Biome format --write
```

Tests live in each package's `tests/` directory, not alongside source.

## License

[MIT](./LICENSE)
