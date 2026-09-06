export type { PortEntry, RiskFlag } from "./types.js";
export type { PortmindConfig, SshHostConfig, AiField } from "./config.js";
export { DEFAULT_CONFIG } from "./config.js";
export { scanPorts, type ScanOptions } from "./scan/index.js";
export {
  loadConfig,
  resolveConfigPaths,
  USER_CONFIG_PATH,
  projectConfigPath,
  ConfigError,
  type LoadedConfigPaths,
} from "./configLoader.js";
export type { KnownPortsConfig, KnownPortsIndex } from "./knownPorts/lookup.js";
export { explainPort, type ExplainDeps } from "./ai/explain.js";
export { AiProviderError } from "./ai/provider.js";
export { sanitizeCmdline } from "./ai/sanitize.js";
export { buildExplainPayload } from "./ai/allowlist.js";
