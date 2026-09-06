#!/usr/bin/env node
import { Command } from "commander";
import { DEFAULT_CONFIG, scanPorts, type PortEntry } from "@portmind/core";
import { renderTable } from "./renderTable.js";

const program = new Command();

program.name("portmind").description("Local-first port scanning, enrichment and history tool").version("0.1.0");

interface ListOptions {
  range?: string;
  dockerOnly?: boolean;
  unusual?: boolean;
  json?: boolean;
}

program
  .command("list")
  .description("List all listening ports on localhost")
  .option("--range <range>", "filter by port range, e.g. 3000-9000")
  .option("--docker-only", "only show Docker-backed ports")
  .option("--unusual", "only show ports flagged unusual or risky")
  .option("--json", "output machine-readable JSON")
  .action(async (options: ListOptions) => {
    try {
      const range = parseRange(options.range);
      let entries = await scanPorts({ includeUdp: DEFAULT_CONFIG.scan.includeUdp });

      if (range) {
        entries = entries.filter((e) => e.port >= range.min && e.port <= range.max);
      }
      if (options.dockerOnly) {
        entries = entries.filter((e) => e.docker !== null);
      }
      if (options.unusual) {
        entries = entries.filter((e) => !e.history.usual || e.riskFlags.length > 0);
      }

      entries.sort((a, b) => a.port - b.port);

      if (options.json) {
        console.log(JSON.stringify(entries satisfies PortEntry[], null, 2));
      } else {
        console.log(renderTable(entries));
      }
    } catch (error) {
      console.error(`portmind list: scan failed - ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

function parseRange(range: string | undefined): { min: number; max: number } | null {
  if (!range) return null;
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`invalid --range "${range}", expected format like 3000-9000`);
  }
  const min = Number.parseInt(match[1] as string, 10);
  const max = Number.parseInt(match[2] as string, 10);
  if (min > max) {
    throw new Error(`invalid --range "${range}", min must be <= max`);
  }
  return { min, max };
}

program.parseAsync(process.argv);
