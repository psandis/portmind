# portmind — Project Specification

**Version:** 1.0
**Purpose of this document:** hand-off spec for implementation via Claude Code. Written to be actionable — architecture, data model, CLI surface, config schema, and a phased build plan. No ambiguity left for guessing; where a decision is genuinely open, it's marked `[DECISION NEEDED]`.

---

## 1. Problem statement

Developers running local dev servers (Node, Python, Docker containers) constantly hit port conflicts (`EADDRINUSE`, "port already in use", "port is already allocated") on ports like 3000, 8000, 8080, and common service ports (5432, 6379, 27017, 9200). Existing tools (`lsof`, `netstat`, `ss`, and third-party tools like `portctl`, `portndock`, `Portpourri`) can tell you **what is on a port right now**, but none of them:

- Remember what **normally** runs on a given port on a given machine, so they can distinguish "this is expected" from "this is new/unusual"
- Enrich the raw process info with a canonical, sourced description of what the port/service is (IANA registry lookup)
- Offer an optional AI-assisted deep dive when the above two aren't enough to explain what's going on
- Present the same enriched dataset consistently across CLI, terminal UI, and a local web view
- Work identically against remote hosts over SSH, not just localhost

**portmind** solves this: a local-first, no-telemetry tool that scans, enriches, remembers, and displays port usage — CLI-first, with TUI and web views on top of the same core engine.

---

## 2. Non-goals (explicitly out of scope for v1)

- No cloud sync, no telemetry, no external accounts. Everything is local (SQLite on disk).
- No menu bar / native macOS app (that lane is already served by other tools — see competitive note below). CLI + terminal + local web UI only.
- No automatic/background AI calls. AI is opt-in and manually triggered per port, never silent.
- No security/vulnerability scanning of the services themselves (that's a different tool's job). portmind flags *anomalies relative to your own history*, not CVEs.
- No Windows support in v1 (macOS + Linux only). Windows can be a v2 addition (`netstat` equivalent already scoped in config but not implemented).

---

## 3. Competitive context (why this shape, not another shape)

Already exist and solve adjacent problems — don't duplicate their exact approach:

| Tool | What it does | Why portmind differs |
|---|---|---|
| `portctl` (Rust) | Port conflict CLI, kill/free, `.portctl.toml` project config | No history/memory, no IANA enrichment, no AI |
| `portndock` (Python) | Docker-aware interactive TUI, color-coded safety levels | TUI-first, no CLI table/JSON mode, no history, no web view |
| `Portpourri` (Swift) | macOS menu bar app, project-aware (maps to package.json/git root) | Menu bar only, no CLI, no cross-platform, no history persistence beyond session |
| `berth_check` (MCP tool) | Scans project config files vs. live ports before `docker compose up` | Pre-flight check only, not a live dashboard |
| `ptrm` / `free-port` | One-shot "kill whatever's on this port" | No enrichment, no listing, single-purpose |

portmind's actual differentiator: **local historical memory + IANA-sourced descriptions + one consistent data model surfaced through CLI/TUI/web + opt-in AI**. Nothing above does all four.

---

## 4. Architecture

```
portmind/
├── packages/
│   ├── core/            # scanning, enrichment, data model, config, history — no UI code
│   ├── cli/              # table/JSON output, `list`, `watch`, `free`, `explain`
│   ├── tui/               # live terminal dashboard (ink)
│   ├── web/              # local HTML dashboard server
│   └── ai/                # optional plugin: AI deep-search, disabled by default
├── data/
│   └── iana-cache.json    # cached, parsed IANA registry (refreshed on schedule)
├── portmind.config.example.yaml
└── README.md
```

**Principle:** `core` has zero UI dependencies and zero AI dependencies. `cli`, `tui`, and `web` are thin renderers over `core`'s output shape (defined in section 6). `ai` is a separate optional package that `core` calls through an interface, never a hard dependency — if `ai` isn't installed/enabled, `core` works identically minus the `explain` enrichment field.

---

## 5. Data pipeline (per scan cycle)

For every listening socket found on the host:

1. **Raw scan**
   - macOS/Linux: `lsof -iTCP -sTCP:LISTEN -P -n` and `lsof -iUDP -P -n` (or `ss -tulnp` on Linux where available, faster)
   - Output: local port, protocol (tcp/udp), bind address, PID

2. **Process enrichment**
   - From PID: command line (`ps -o command= -p <pid>` or `/proc/<pid>/cmdline` on Linux), working directory (`lsof -p <pid> | grep cwd` or `/proc/<pid>/cwd`), process start time, parent PID
   - macOS only: code signature check via `codesign -dv` on the binary path (best-effort, not fatal if unavailable)

3. **Docker cross-reference**
   - Run `docker ps --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Ports}}'` (skip entirely if Docker isn't running — must not error/hang if Docker absent)
   - Parse the `Ports` field, match host-side port numbers against the raw scan results
   - If matched: replace/augment the process-level detail with `docker_container_name`, `docker_image`, `docker_container_id`

4. **Known-port lookup (IANA)**
   - Local cached copy of the IANA Service Name and Port Number Registry (official source: `https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv`)
   - Cache refreshed on a configurable interval (default 30 days); works fully offline once cached
   - Lookup by (port, protocol) → `{ service_name, description }` or `null` if unassigned/dynamic range

5. **Local history match**
   - SQLite table `observations`, one row appended per scan per active port: `(host, port, protocol, process_name, cmdline_hash, cwd, docker_image, seen_at)`
   - Derived table `port_fingerprints`: for each `(host, port)`, the most frequent `(process_name, cwd or docker_image)` pair and its observation count
   - On each scan, compare current occupant against the fingerprint: `usual: true/false`, plus `first_seen` if this is genuinely new

6. **Risk flags** (rule-based, each independently toggleable in config — never hardcoded on)
   - `bound_all_interfaces`: bind address is `0.0.0.0` or `::` rather than `127.0.0.1`/`::1`
   - `unsigned_binary`: macOS code signature check failed or absent (best-effort; never blocks output if the check itself errors)
   - `no_known_service`: no IANA entry AND no local history AND not in the ephemeral/dynamic range (49152–65535, which is expected to be unassigned)

7. **AI deep-search (opt-in, manual trigger only)**
   - Only runs on explicit command: `portmind explain <port>`
   - Payload sent to the configured provider is built from an **explicit allowlist** (see config section) — never full environment variables, never file contents, never arbitrary cwd contents
   - Default allowlist: `process_name`, `cmdline` (sanitized — strip anything that looks like a secret/token pattern before sending), `port`, `protocol`, `docker_image` if present
   - Returns a plain-English explanation, cached in `ai_explanations` table keyed by `(process_name, port)` so repeat queries for the same shape don't re-call the API

---

## 6. Core data shape

This is the single object type all three UIs (CLI/TUI/web) render. Defined once in `core`, exported as a TypeScript type.

```typescript
interface PortEntry {
  host: string;                 // "localhost" or the named SSH target
  port: number;
  protocol: "tcp" | "udp";
  bindAddress: string;          // e.g. "0.0.0.0", "127.0.0.1"
  pid: number | null;
  processName: string | null;
  cmdline: string | null;
  cwd: string | null;
  startedAt: string | null;     // ISO timestamp
  docker: {
    containerId: string;
    containerName: string;
    image: string;
  } | null;
  knownService: {
    name: string;
    description: string;
    source: "iana" | "custom";
  } | null;
  history: {
    usual: boolean;
    observationCount: number;
    firstSeen: string | null;
    usualOccupant: string | null;  // description of what normally runs here, when usual === false
  };
  riskFlags: string[];            // e.g. ["bound_all_interfaces"]
  aiExplanation: string | null;   // populated only after `explain` is run
}
```

---

## 7. CLI surface

```
portmind list                          # full table, all listening ports on localhost
portmind list --range 3000-9000        # filter by port range
portmind list --docker-only            # only Docker-backed ports
portmind list --unusual                # only ports flagged usual=false or with risk flags
portmind list --json                   # machine-readable output, for scripting/CI
portmind watch                         # live-refreshing table (interval from config)

portmind free <port>                   # docker-aware: stops container if docker-backed, else kills PID
portmind free <port> --force           # skip confirmation prompt

portmind explain <port>                # runs AI deep-search for this specific port (opt-in, requires ai.enabled: true)

portmind history <port>                # shows the historical fingerprint for a port: what's usually there, over what time range

portmind ssh <host> list               # same `list` semantics, executed against a configured remote host
portmind ssh <host> check <port>

portmind web                           # starts local web dashboard, opens browser
portmind web --port 4400 --no-open     # custom dashboard port, don't auto-open browser

portmind tui                           # launches the terminal dashboard

portmind config show                   # prints resolved config (defaults + user + project merged)
portmind config path                   # prints path to the active config file(s)
```

**Table output example (`portmind list`):**

```
PORT   PROTO  PROCESS       PID     DOCKER              USUAL   NOTE
3000   tcp    node          41822   -                    yes    react-dashboard (~/Projects/react-dashboard)
5432   tcp    postgres      2210    pg-container          yes    PostgreSQL (IANA: postgresql)
8080   tcp    python3       9931    -                    NO     unexpected — normally node here
9200   tcp    java          551     elastic-container     yes    Elasticsearch
```

**Exit codes:** `0` success, `1` scan error, `2` config error — scriptable/CI-friendly.

---

## 8. TUI

- Library: `ink` (React-for-CLI, fits the TypeScript stack) or `blessed` — `[DECISION NEEDED: pick one before scaffolding]`
- Live-updating table, same `PortEntry[]` data as CLI, same columns
- Keybindings: arrow keys to select row, `e` to run `explain` on selected row inline, `k` to `free` selected port (with confirmation), `d` toggle Docker-only filter, `u` toggle unusual-only filter, `q` quit
- Deliberately minimal — not competing with `portndock`'s TUI feature-for-feature. The value-add here is inline access to IANA description + history + AI explain, not a richer TUI shell.

---

## 9. Web UI

- Local-only HTTP server (no external network exposure by default — binds to `127.0.0.1` unless explicitly configured otherwise)
- Single static HTML page + vanilla JS (no framework, no build step, no external CDN dependency at runtime — matches the "local-first, no telemetry" pattern of your other tools)
- Data fetched from a local `/api/ports` endpoint that returns the same `PortEntry[]` JSON as `portmind list --json`
- Table view: sortable columns, filter by unusual/Docker/range
- Row click → expand panel with full detail + an "Explain with AI" button that fires the AI call only on click (never automatically)
- No polling by default; manual refresh button, optional auto-refresh toggle (interval from config)

---

## 10. Configuration

Resolution order: built-in defaults → `~/.portmind/config.yaml` (user) → `.portmind.yaml` in current directory (project), each layer overriding the previous.

```yaml
scan:
  interval_seconds: 5
  include_udp: true
  docker: true
  ssh_hosts: []
    # example:
    # ssh_hosts:
    #   - name: prod-api
    #     host: prod-api.example.com
    #     user: deploy

known_ports:
  source: iana              # iana | custom | both
  custom_db_path: null      # path to a JSON/CSV file with the same {port, protocol, service_name, description} schema
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
  enabled: false                  # opt-in, off by default — must be explicitly turned on
  provider: anthropic             # anthropic | openai | none
  model: claude-sonnet-4-6
  trigger: manual                 # manual only in v1 — "on_unusual" reserved for v2, not implemented yet
  fields_sent:                    # explicit allowlist — nothing outside this list is ever sent
    - process_name
    - cmdline
    - port
    - protocol
    - docker_image
  cmdline_sanitization: true       # strip token/secret-shaped substrings from cmdline before sending

output:
  default_format: table           # table | json
  color: auto                     # auto | always | never

logging:
  level: info                     # debug | info | warn | error
  audit_log: false                # when true, logs every `free` and `explain` action with timestamp to ~/.portmind/audit.log
```

**Enterprise-relevant details baked in from the start:**
- `known_ports.custom_db_path` lets an org merge an internal port registry (e.g., "port 7000 = internal billing service") on top of the public IANA list
- `ai.fields_sent` is an explicit, auditable allowlist — nothing reaches a model that isn't named here
- `logging.audit_log` gives a paper trail for destructive actions (`free`) if this is ever run against a shared/team server rather than a personal laptop
- `--json` is available on every read command, so it's scriptable in CI without touching TUI/web code paths at all

---

## 11. Tech stack

- **Language:** TypeScript, Node 22+ (matches feedclaw/dietclaw/wirewatch/mymailclaw)
- **CLI framework:** `commander` or `yargs` — `[DECISION NEEDED, either is fine, pick one for consistency with your other repos]`
- **Storage:** `better-sqlite3` (matches existing repos)
- **TUI:** `ink` (preferred, React-familiar) or `blessed`
- **Web:** no framework — plain HTML/CSS/vanilla JS served by a minimal Node HTTP server (`http` module or `express` if routing gets non-trivial)
- **Docker interaction:** shell out to `docker ps`, parse text output — no Docker SDK dependency needed for v1
- **IANA data:** fetch + parse the official CSV on a schedule, cache to `data/iana-cache.json`, ship a small bundled fallback copy in the repo so first-run works offline before the first successful fetch

---

## 12. Phased build plan (for Claude Code to execute in order)

**Phase 1 — Core scanning (no UI, no history, no AI)**
- Implement raw scan (`lsof`/`ss` wrapper) for macOS + Linux
- Implement process enrichment (cmdline, cwd, start time)
- Define and export the `PortEntry` type
- Unit tests with mocked `lsof`/`ps` output (don't require root/real sockets to test)

**Phase 2 — CLI `list` and `free`**
- Table renderer + `--json` mode
- `free` command with Docker-aware stop-vs-kill logic
- Exit codes, error handling for missing `lsof`/`docker` binaries (degrade gracefully, don't crash)

**Phase 3 — IANA enrichment**
- CSV fetch + parse + cache
- Bundled offline fallback copy
- Lookup integrated into `PortEntry.knownService`

**Phase 4 — History and "usual" detection**
- SQLite schema (`observations`, `port_fingerprints`)
- Fingerprint computation logic
- `history <port>` command

**Phase 5 — Docker cross-reference**
- `docker ps` parsing, matching against raw scan, graceful no-op when Docker absent

**Phase 6 — Risk flags**
- Implement each flag as an independent, configurable rule function

**Phase 7 — TUI**
- Live table, keybindings, inline `explain`/`free` actions

**Phase 8 — Web dashboard**
- Local HTTP server, `/api/ports` endpoint, static HTML/JS frontend

**Phase 9 — AI `explain` (opt-in)**
- Provider abstraction (Anthropic/OpenAI), explicit field allowlist enforcement, cmdline sanitization, response caching in `ai_explanations` table

**Phase 10 — SSH remote support**
- `ssh_hosts` config, remote command execution wrapper, same `PortEntry` shape returned with `host` set to the remote name

**Phase 11 — Config system + audit logging**
- Merge/resolution logic for default → user → project config
- `config show` / `config path` commands
- Audit log for `free`/`explain`

**Phase 12 — Polish**
- README, `--help` text for every command, packaging for `npm install -g portmind`

---

## 13. Open decisions before/during Phase 1

- `[DECISION NEEDED]` TUI library: `ink` vs `blessed`
- `[DECISION NEEDED]` CLI framework: `commander` vs `yargs`
- `[DECISION NEEDED]` Should `portmind free` on a Docker-backed port default to `docker stop` or `docker kill`? (Recommend `stop` as the default, with `--force` mapping to `kill`.)
- `[DECISION NEEDED]` Windows support — confirmed out of scope for v1, but should the `PortEntry`/config schema leave room for a `netstat`-based scanner backend later, or is that premature? (Recommend: yes, leave the scan layer behind an interface so a Windows backend can be added without touching `core`'s public API.)

---

*End of spec.*
