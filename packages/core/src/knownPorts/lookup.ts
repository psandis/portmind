import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { KnownPortEntry } from "./parseIana.js";
import type { PortmindConfig } from "../config.js";
import type { PortEntry } from "../types.js";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundledCachePath = path.join(packageRoot, "data", "iana-cache.json");

export type KnownPortsConfig = PortmindConfig["knownPorts"];

interface CacheFile {
  source: string;
  fetchedAt: string;
  entries: KnownPortEntry[];
}

/** key: "tcp:5432" -> entry. Built once per scan, not per port. */
export type KnownPortsIndex = Map<string, { name: string; description: string; source: "iana" | "custom" }>;

/**
 * Builds a lookup index per `knownPorts.source`:
 *  - "iana": bundled IANA cache only
 *  - "custom": only `customDbPath`, ignoring IANA entirely
 *  - "both": IANA first, then custom entries override/add on top
 *
 * Never throws: a missing/unreadable custom file just means those entries
 * are absent, same as the spec's "works fully offline" requirement for IANA.
 */
export async function buildKnownPortsIndex(config: KnownPortsConfig): Promise<KnownPortsIndex> {
  const index: KnownPortsIndex = new Map();

  if (config.source === "iana" || config.source === "both") {
    const iana = await loadBundledIana();
    for (const entry of iana) {
      index.set(`${entry.protocol}:${entry.port}`, {
        name: entry.name,
        description: entry.description,
        source: "iana",
      });
    }
  }

  if ((config.source === "custom" || config.source === "both") && config.customDbPath) {
    const custom = await loadCustomDb(config.customDbPath);
    for (const entry of custom) {
      index.set(`${entry.protocol}:${entry.port}`, {
        name: entry.name,
        description: entry.description,
        source: "custom",
      });
    }
  }

  return index;
}

export function applyKnownPorts(entries: PortEntry[], index: KnownPortsIndex): PortEntry[] {
  return entries.map((entry) => {
    const match = index.get(`${entry.protocol}:${entry.port}`);
    if (!match) return entry;
    return {
      ...entry,
      knownService: { name: match.name, description: match.description, source: match.source },
    };
  });
}

async function loadBundledIana(): Promise<KnownPortEntry[]> {
  try {
    const raw = await readFile(bundledCachePath, "utf-8");
    const parsed = JSON.parse(raw) as CacheFile;
    return parsed.entries;
  } catch {
    return [];
  }
}

/** Expected shape: an array of {port, protocol, service_name, description}, per the spec's custom_db_path schema. */
async function loadCustomDb(customDbPath: string): Promise<KnownPortEntry[]> {
  try {
    const raw = await readFile(customDbPath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{
      port: number;
      protocol: "tcp" | "udp";
      service_name: string;
      description: string;
    }>;
    return parsed.map((item) => ({
      port: item.port,
      protocol: item.protocol,
      name: item.service_name,
      description: item.description,
    }));
  } catch {
    return [];
  }
}
