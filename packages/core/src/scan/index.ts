import { scanLocalPorts, type ScanOptions } from "./scanner.js";
import { enrichProcesses, applyEnrichment } from "./enrichProcess.js";
import { buildKnownPortsIndex, applyKnownPorts, type KnownPortsConfig } from "../knownPorts/lookup.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { PortEntry } from "../types.js";

export type { ScanOptions } from "./scanner.js";

/**
 * Full local scan: raw listening sockets + process enrichment (cmdline/cwd/
 * startedAt) + known-port lookup. `knownPorts` defaults to the built-in
 * config so callers that don't load a config file get today's behavior
 * (bundled IANA registry); callers that resolved a real config (see
 * `loadConfig` in configLoader.ts) pass its `knownPorts` slice through
 * unchanged - this is the only place scan behavior actually branches on it.
 */
export async function scanPorts(
  options: ScanOptions,
  knownPorts: KnownPortsConfig = DEFAULT_CONFIG.knownPorts,
): Promise<PortEntry[]> {
  const bare = await scanLocalPorts(options);
  const pids = bare.map((entry) => entry.pid).filter((pid): pid is number => pid !== null);
  const { details, cwds } = await enrichProcesses(pids);
  const enriched = applyEnrichment(bare, details, cwds);

  const knownPortsIndex = await buildKnownPortsIndex(knownPorts);
  return applyKnownPorts(enriched, knownPortsIndex);
}
