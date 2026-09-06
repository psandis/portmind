import type { PortEntry } from "../types.js";
import type { PortmindConfig } from "../config.js";
import { buildExplainPayload } from "./allowlist.js";
import { createAnthropicProvider, createOpenAiProvider, type AiProvider, type FetchLike } from "./provider.js";
import { AiExplanationCache } from "./cache.js";
import { ConfigError } from "../configLoader.js";

export interface ExplainDeps {
  fetchImpl?: FetchLike;
  cache?: AiExplanationCache;
  env?: Record<string, string | undefined>;
}

/**
 * Orchestrates AI explain: disabled/misconfigured -> ConfigError (CLI exit
 * code 2, since this is a config problem, not a scan failure); cache hit ->
 * returned without any network call; cache miss -> allowlisted+sanitized
 * payload sent to the configured provider, result cached for next time.
 */
export async function explainPort(entry: PortEntry, config: PortmindConfig, deps: ExplainDeps = {}): Promise<string> {
  if (!config.ai.enabled) {
    throw new ConfigError("AI is disabled. Set ai.enabled: true in your config to use `explain`.");
  }
  if (config.ai.provider === "none") {
    throw new ConfigError('ai.provider is "none". Set it to "anthropic" or "openai" to use `explain`.');
  }

  const processKey = entry.processName ?? "unknown";
  const cache = deps.cache ?? new AiExplanationCache(config.history.dbPath);
  const cached = cache.get(processKey, entry.port);
  if (cached !== null) return cached;

  const env = deps.env ?? process.env;
  const apiKey = config.ai.provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) {
    const envVar = config.ai.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    throw new ConfigError(`${envVar} is not set. AI explain requires an API key in that environment variable.`);
  }

  const payload = buildExplainPayload(entry, config.ai.fieldsSent);
  const provider: AiProvider =
    config.ai.provider === "anthropic" ? createAnthropicProvider(deps.fetchImpl) : createOpenAiProvider(deps.fetchImpl);

  const explanation = await provider.explain(payload, apiKey, config.ai.model);
  cache.set(processKey, entry.port, explanation);
  return explanation;
}
