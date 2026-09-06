import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseLsofFieldOutput, type RawListeningSocket } from "./parseLsof.js";
import type { PortEntry } from "../types.js";

const execFileAsync = promisify(execFile);

export interface ScanOptions {
  includeUdp: boolean;
}

/**
 * Runs `lsof` for TCP (and optionally UDP) listening sockets and returns
 * bare PortEntry objects: only host/port/protocol/bindAddress/pid/processName
 * are populated here. Process enrichment (cmdline/cwd/startedAt) is a
 * separate step (see enrichProcess.ts) so scanning still returns partial
 * results if enrichment for one PID fails.
 *
 * Never throws if `lsof` is missing or errors - returns an empty list and
 * lets the caller decide how to report that (CLI exit code 1 per spec).
 */
export async function scanLocalPorts(options: ScanOptions): Promise<PortEntry[]> {
  const sockets: (RawListeningSocket & { protocol: "tcp" | "udp" })[] = [];

  const tcp = await runLsof(["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcn"]);
  if (tcp) sockets.push(...parseLsofFieldOutput(tcp).map((s) => ({ ...s, protocol: "tcp" as const })));

  if (options.includeUdp) {
    const udp = await runLsof(["-iUDP", "-P", "-n", "-F", "pcn"]);
    if (udp) sockets.push(...parseLsofFieldOutput(udp).map((s) => ({ ...s, protocol: "udp" as const })));
  }

  return dedupeSockets(sockets).map((socket) => toPortEntry(socket));
}

/**
 * lsof reports one line per file descriptor, so the same logical listener
 * (e.g. bound on both IPv4 and IPv6, or via multiple duplicated fds) shows up
 * as several identical-looking rows. Collapse by the fields that actually
 * distinguish one listener from another.
 */
export function dedupeSockets(
  sockets: (RawListeningSocket & { protocol: "tcp" | "udp" })[],
): (RawListeningSocket & { protocol: "tcp" | "udp" })[] {
  const seen = new Map<string, RawListeningSocket & { protocol: "tcp" | "udp" }>();
  for (const socket of sockets) {
    const key = `${socket.protocol}:${socket.bindAddress}:${socket.port}:${socket.pid}`;
    if (!seen.has(key)) seen.set(key, socket);
  }
  return [...seen.values()];
}

async function runLsof(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("lsof", args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    // lsof exits non-zero when there are simply no matching sockets - that's
    // not a failure. Only treat "binary not found" as a hard miss.
    const err = error as NodeJS.ErrnoException & { stdout?: string };
    if (err.code === "ENOENT") return null;
    return err.stdout ?? null;
  }
}

function toPortEntry(socket: RawListeningSocket & { protocol: "tcp" | "udp" }): PortEntry {
  return {
    host: "localhost",
    port: socket.port,
    protocol: socket.protocol,
    bindAddress: socket.bindAddress,
    pid: socket.pid,
    processName: socket.processName,
    cmdline: null,
    cwd: null,
    startedAt: null,
    docker: null,
    knownService: null,
    history: {
      usual: true,
      observationCount: 0,
      firstSeen: null,
      usualOccupant: null,
    },
    riskFlags: [],
    aiExplanation: null,
  };
}
