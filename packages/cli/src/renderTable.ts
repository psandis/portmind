import type { PortEntry } from "portmind-core";

const COLUMNS = ["PORT", "PROTO", "PROCESS", "PID", "DOCKER", "USUAL", "NOTE"] as const;

export function renderTable(entries: PortEntry[]): string {
  if (entries.length === 0) {
    return "No listening ports found.";
  }

  const rows = entries.map((entry) => [
    String(entry.port),
    entry.protocol,
    entry.processName ?? "-",
    entry.pid !== null ? String(entry.pid) : "-",
    entry.docker?.containerName ?? "-",
    entry.history.usual ? "yes" : "NO",
    noteFor(entry),
  ]);

  const widths = COLUMNS.map((col, i) =>
    Math.max(col.length, ...rows.map((row) => (row[i] ?? "").length)),
  );

  const formatRow = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd();

  return [formatRow([...COLUMNS]), ...rows.map(formatRow)].join("\n");
}

function noteFor(entry: PortEntry): string {
  if (entry.knownService) return entry.knownService.description;
  if (entry.cwd) return entry.cwd;
  return "-";
}
