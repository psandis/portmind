#!/usr/bin/env node
import { Command } from "commander";
import { execFile } from "node:child_process";
import {
  ConfigError,
  explainPort,
  loadConfig,
  resolveConfigPaths,
  scanPorts,
  type PortEntry,
} from "portmind-core";
import { createWebServer } from "portmind-web";
import { renderTable } from "./renderTable.js";

const program = new Command();

program.name("portmind").description("Local-first port scanning, enrichment and history tool").version("0.3.2");

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
      const config = await loadConfig();
      let entries = await scanPorts({ includeUdp: config.scan.includeUdp }, config.knownPorts);

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
      if (error instanceof ConfigError) {
        console.error(`portmind list: config error - ${error.message}`);
        process.exitCode = 2;
      } else {
        console.error(`portmind list: scan failed - ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
  });

interface WebOptions {
  port: string;
  open: boolean;
}

program
  .command("web")
  .description("Start the local web dashboard")
  .option("--port <port>", "port for the dashboard itself", "4400")
  .option("--no-open", "don't open the browser automatically")
  .action((options: WebOptions) => {
    const port = Number.parseInt(options.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`portmind web: invalid --port "${options.port}"`);
      process.exitCode = 2;
      return;
    }

    createWebServer({ port });
    const url = `http://127.0.0.1:${port}`;
    console.log(`portmind web: dashboard running at ${url}`);

    if (options.open) {
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      execFile(opener, [url], (error) => {
        if (error) {
          console.error(`portmind web: could not open browser automatically (${error.message})`);
        }
      });
    }
  });

program
  .command("explain")
  .description("Run AI deep-search for a specific port (opt-in, requires ai.enabled: true)")
  .argument("<port>", "port number to explain")
  .action(async (portArg: string) => {
    const port = Number.parseInt(portArg, 10);
    if (Number.isNaN(port)) {
      console.error(`portmind explain: invalid port "${portArg}"`);
      process.exitCode = 2;
      return;
    }

    try {
      const resolvedConfig = await loadConfig();
      const entries = await scanPorts({ includeUdp: resolvedConfig.scan.includeUdp }, resolvedConfig.knownPorts);
      const entry = entries.find((e) => e.port === port);
      if (!entry) {
        console.error(`portmind explain: nothing is currently listening on port ${port}`);
        process.exitCode = 1;
        return;
      }

      const explanation = await explainPort(entry, resolvedConfig);
      console.log(explanation);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(`portmind explain: ${error.message}`);
        process.exitCode = 2;
      } else {
        console.error(`portmind explain: failed - ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
  });

const config = program.command("config").description("Inspect resolved portmind configuration");

config
  .command("show")
  .description("Print the resolved config (defaults + user + project merged)")
  .action(async () => {
    try {
      const resolved = await loadConfig();
      console.log(JSON.stringify(resolved, null, 2));
    } catch (error) {
      console.error(`portmind config show: ${(error as Error).message}`);
      process.exitCode = 2;
    }
  });

config
  .command("path")
  .description("Print the path(s) to the active config file(s) and whether they exist")
  .action(async () => {
    try {
      const paths = await resolveConfigPaths();
      console.log(`user:    ${paths.user}${paths.userExists ? "" : " (not found)"}`);
      console.log(`project: ${paths.project}${paths.projectExists ? "" : " (not found)"}`);
    } catch (error) {
      console.error(`portmind config path: ${(error as Error).message}`);
      process.exitCode = 2;
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
