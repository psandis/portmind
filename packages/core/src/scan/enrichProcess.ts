import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PortEntry } from "../types.js";

const execFileAsync = promisify(execFile);

export interface ProcessDetail {
  cmdline: string;
  startedAt: string;
}

/**
 * Batch-enriches a set of PIDs with command line + process start time (via
 * `ps`) and working directory (via `lsof -d cwd`). Both commands are called
 * once per scan with a comma-separated PID list, not once per PID.
 *
 * Best-effort: a PID that has already exited between the scan and this call,
 * or any command failure, is simply absent from the returned maps - callers
 * must treat missing enrichment as "unknown", never as fatal.
 */
export async function enrichProcesses(
  pids: number[],
): Promise<{ details: Map<number, ProcessDetail>; cwds: Map<number, string> }> {
  const uniquePids = [...new Set(pids)].filter((pid) => pid > 0 && pid <= 4194304);
  if (uniquePids.length === 0) {
    return { details: new Map(), cwds: new Map() };
  }

  const [details, cwds] = await Promise.all([fetchProcessDetails(uniquePids), fetchCwds(uniquePids)]);
  return { details, cwds };
}

async function fetchProcessDetails(pids: number[]): Promise<Map<number, ProcessDetail>> {
  const result = new Map<number, ProcessDetail>();
  const output = await run("ps", ["-o", "pid=,lstart=,command=", "-p", pids.join(",")]);
  if (!output) return result;

  for (const line of output.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.length === 0) continue;

    // Format: "<pid> <weekday> <month> <day> <time> <year> <command...>"
    const match = trimmed.match(/^(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
    if (!match) continue;

    const [, pidStr, lstart, command] = match;
    const pid = Number.parseInt(pidStr as string, 10);
    const startedAt = parseLstart(lstart as string);
    if (startedAt) {
      result.set(pid, { cmdline: (command as string).trimEnd(), startedAt });
    }
  }

  return result;
}

async function fetchCwds(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const output = await run("lsof", ["-a", "-d", "cwd", "-p", pids.join(","), "-F", "pn"]);
  if (!output) return result;

  let currentPid: number | null = null;
  for (const line of output.split("\n")) {
    if (line.length === 0) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === "p") {
      currentPid = Number.parseInt(value, 10);
    } else if (tag === "n" && currentPid !== null) {
      result.set(currentPid, value);
    }
  }

  return result;
}

/** Parses ps's `lstart` format ("Mon Aug 31 02:20:42 2026") into an ISO string. */
function parseLstart(lstart: string): string | null {
  const date = new Date(lstart);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function run(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string };
    return err.stdout ?? null;
  }
}

export function applyEnrichment(
  entries: PortEntry[],
  details: Map<number, ProcessDetail>,
  cwds: Map<number, string>,
): PortEntry[] {
  return entries.map((entry) => {
    if (entry.pid === null) return entry;
    const detail = details.get(entry.pid);
    const cwd = cwds.get(entry.pid);
    return {
      ...entry,
      cmdline: detail?.cmdline ?? entry.cmdline,
      startedAt: detail?.startedAt ?? entry.startedAt,
      cwd: cwd ?? entry.cwd,
    };
  });
}
