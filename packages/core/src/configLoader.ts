import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { DEFAULT_CONFIG, type PortmindConfig } from "./config.js";

export const USER_CONFIG_PATH = path.join(os.homedir(), ".portmind", "config.yaml");

export function projectConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".portmind.yaml");
}

export interface LoadedConfigPaths {
  user: string;
  userExists: boolean;
  project: string;
  projectExists: boolean;
}

export class ConfigError extends Error {}

/**
 * Resolves config in the order the spec defines: built-in defaults ->
 * ~/.portmind/config.yaml (user) -> .portmind.yaml in `cwd` (project),
 * each layer deep-merging over the previous. A missing file at either layer
 * is not an error - only a file that exists but fails to parse is
 * (ConfigError, mapped to CLI exit code 2).
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<PortmindConfig> {
  let config = DEFAULT_CONFIG;

  const userYaml = await readYamlIfExists(USER_CONFIG_PATH);
  if (userYaml !== null) config = mergeConfig(config, userYaml);

  const projectYaml = await readYamlIfExists(projectConfigPath(cwd));
  if (projectYaml !== null) config = mergeConfig(config, projectYaml);

  return config;
}

export async function resolveConfigPaths(cwd: string = process.cwd()): Promise<LoadedConfigPaths> {
  const userPath = USER_CONFIG_PATH;
  const projPath = projectConfigPath(cwd);
  return {
    user: userPath,
    userExists: (await readYamlIfExists(userPath)) !== null,
    project: projPath,
    projectExists: (await readYamlIfExists(projPath)) !== null,
  };
}

async function readYamlIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw new ConfigError(`could not read ${filePath}: ${err.message}`);
  }

  try {
    const parsed = parseYaml(raw);
    return (parsed ?? {}) as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError(`invalid YAML in ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Deep-merges a raw YAML object (snake_case keys, per the documented schema)
 * onto a resolved PortmindConfig (camelCase). Only known keys are mapped -
 * unrecognized keys in the YAML are silently ignored rather than erroring,
 * since a stricter policy would break forward-compatibility with newer
 * config options added by a future version.
 */
function mergeConfig(base: PortmindConfig, raw: Record<string, unknown>): PortmindConfig {
  const scan = asRecord(raw.scan);
  const knownPorts = asRecord(raw.known_ports);
  const history = asRecord(raw.history);
  const riskRules = asRecord(raw.risk_rules);
  const ai = asRecord(raw.ai);
  const output = asRecord(raw.output);
  const logging = asRecord(raw.logging);

  return {
    scan: {
      intervalSeconds: numberOr(scan.interval_seconds, base.scan.intervalSeconds),
      includeUdp: boolOr(scan.include_udp, base.scan.includeUdp),
      docker: boolOr(scan.docker, base.scan.docker),
      sshHosts: Array.isArray(scan.ssh_hosts)
        ? (scan.ssh_hosts as PortmindConfig["scan"]["sshHosts"])
        : base.scan.sshHosts,
    },
    knownPorts: {
      source: (knownPorts.source as PortmindConfig["knownPorts"]["source"]) ?? base.knownPorts.source,
      customDbPath: (knownPorts.custom_db_path as string | null | undefined) ?? base.knownPorts.customDbPath,
      refreshDays: numberOr(knownPorts.refresh_days, base.knownPorts.refreshDays),
    },
    history: {
      enabled: boolOr(history.enabled, base.history.enabled),
      dbPath: stringOr(history.db_path, base.history.dbPath),
      retentionDays: numberOr(history.retention_days, base.history.retentionDays),
    },
    riskRules: {
      flagBoundAllInterfaces: boolOr(riskRules.flag_bound_all_interfaces, base.riskRules.flagBoundAllInterfaces),
      flagUnsignedBinary: boolOr(riskRules.flag_unsigned_binary, base.riskRules.flagUnsignedBinary),
      flagNoKnownService: boolOr(riskRules.flag_no_known_service, base.riskRules.flagNoKnownService),
    },
    ai: {
      enabled: boolOr(ai.enabled, base.ai.enabled),
      provider: (ai.provider as PortmindConfig["ai"]["provider"]) ?? base.ai.provider,
      model: stringOr(ai.model, base.ai.model),
      trigger: "manual",
      fieldsSent: Array.isArray(ai.fields_sent) ? (ai.fields_sent as PortmindConfig["ai"]["fieldsSent"]) : base.ai.fieldsSent,
      cmdlineSanitization: boolOr(ai.cmdline_sanitization, base.ai.cmdlineSanitization),
    },
    output: {
      defaultFormat: (output.default_format as PortmindConfig["output"]["defaultFormat"]) ?? base.output.defaultFormat,
      color: (output.color as PortmindConfig["output"]["color"]) ?? base.output.color,
    },
    logging: {
      level: (logging.level as PortmindConfig["logging"]["level"]) ?? base.logging.level,
      auditLog: boolOr(logging.audit_log, base.logging.auditLog),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
