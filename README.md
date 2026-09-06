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

**Not implemented yet** (see [Next steps](#next-steps)): Docker cross-reference, IANA known-port descriptions, local history/"usual" detection, risk flags, `watch`/`free`/`explain`/`history`/`ssh`/`tui`/`config` commands, and the YAML config loader. Until those land, every `PortEntry.docker`, `.knownService`, and `.riskFlags` will be empty, and `.history.usual` is always `true` — so the web dashboard's Docker/unusual filters currently have nothing to filter.

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
5432   tcp    postgres      1758    -       yes    /opt/homebrew/var/postgresql@14
```

**Exit codes:** `0` success, `1` scan error, `2` config error.

### Web dashboard

```bash
portmind web                   # starts on http://127.0.0.1:4400 and opens your browser
portmind web --port 4401       # use a different port for the dashboard itself
portmind web --no-open         # don't open the browser automatically
```

Why a plain server + vanilla JS instead of a framework: the dashboard is two routes (the page, and `/api/ports`), it never leaves your machine, and there's no build pipeline to maintain — consistent with the "local-first, no telemetry" design of the rest of the tool. The page polls `/api/ports` on load and on manual refresh (or a 5-second auto-refresh you opt into); clicking a row expands full detail including an "Explain with AI" button that's currently a disabled placeholder, since AI `explain` (Phase 9) isn't built yet.

Planned commands not yet implemented: `watch`, `free`, `explain`, `history`, `ssh <host> list|check`, `tui`, `config show|path`.

## Storage

History will be stored locally in a SQLite database at `~/.portmind/portmind.db` (configurable) once the history feature (Phase 4) lands. Nothing leaves the machine unless you explicitly run `portmind explain <port>` with AI enabled in config, and even then only an explicit allowlist of fields is sent — never full environment variables or file contents.

## Configuration

Not implemented yet — there is no config loader, and `~/.portmind/config.yaml` / `.portmind.yaml` are not read. The schema below is the target design (resolution order: built-in defaults → `~/.portmind/config.yaml` → `.portmind.yaml` in the current directory, each layer overriding the previous):

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

The equivalent TypeScript shape (`PortmindConfig`) and its defaults already exist in [packages/core/src/config.ts](./packages/core/src/config.ts) — only the file-loading/merge logic is missing.

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

1. **IANA enrichment** — fetch/cache the official IANA Service Name and Port Number Registry, populate `PortEntry.knownService`
2. **History and "usual" detection** — SQLite `observations`/`port_fingerprints` tables, `history <port>` command
3. **Docker cross-reference** — match `docker ps` output against scanned ports, populate `PortEntry.docker`
4. **Risk flags** — `bound_all_interfaces`, `unsigned_binary`, `no_known_service`, each independently configurable
5. **TUI** (`ink` or `blessed` — undecided) — live table with inline `explain`/`free`
6. **AI `explain`** (opt-in) — provider abstraction, explicit field allowlist, response caching (the web dashboard's "Explain with AI" button is wired up but disabled until this exists)
7. **SSH remote support** — `ssh_hosts` config, same `PortEntry` shape with `host` set to the remote name
8. **Config system** — YAML loader/merge (defaults → user → project), `config show`/`config path`, audit logging for `free`/`explain`
9. **Polish** — full `--help` text, packaging for `npm install -g @portmind/cli`

Web dashboard (was phase 6) is done — see [Status](#status).

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
