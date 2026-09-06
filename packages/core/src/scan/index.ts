import { scanLocalPorts, type ScanOptions } from "./scanner.js";
import { enrichProcesses, applyEnrichment } from "./enrichProcess.js";
import type { PortEntry } from "../types.js";

export type { ScanOptions } from "./scanner.js";

/** Full local scan: raw listening sockets + process enrichment (cmdline/cwd/startedAt). */
export async function scanPorts(options: ScanOptions): Promise<PortEntry[]> {
  const bare = await scanLocalPorts(options);
  const pids = bare.map((entry) => entry.pid).filter((pid): pid is number => pid !== null);
  const { details, cwds } = await enrichProcesses(pids);
  return applyEnrichment(bare, details, cwds);
}
