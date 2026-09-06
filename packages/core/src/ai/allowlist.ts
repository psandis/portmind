import type { PortEntry } from "../types.js";
import type { AiField } from "../config.js";
import { sanitizeCmdline } from "./sanitize.js";

/**
 * Builds the exact payload sent to an AI provider - only fields named in
 * `fieldsSent` are included, nothing else on PortEntry is ever touched.
 * This is the sole place field selection happens, so it's the one function
 * that needs auditing to know what leaves the machine.
 */
export function buildExplainPayload(
  entry: PortEntry,
  fieldsSent: AiField[],
): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = {};

  for (const field of fieldsSent) {
    switch (field) {
      case "process_name":
        payload.process_name = entry.processName;
        break;
      case "cmdline":
        payload.cmdline = entry.cmdline ? sanitizeCmdline(entry.cmdline) : null;
        break;
      case "port":
        payload.port = entry.port;
        break;
      case "protocol":
        payload.protocol = entry.protocol;
        break;
      case "docker_image":
        payload.docker_image = entry.docker?.image ?? null;
        break;
    }
  }

  return payload;
}
