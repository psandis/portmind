/**
 * Heuristic redaction of secret/token-shaped substrings in a command line,
 * per the spec's "strip anything that looks like a secret/token pattern
 * before sending" requirement. This is best-effort, not a guarantee - it
 * catches common flag/env patterns, not every possible way a secret could
 * appear in a command line.
 */
const SECRET_FLAG_PATTERN =
  /(--?(?:password|passwd|pwd|token|secret|api[-_]?key|apikey|auth|access[-_]?key)[=\s]+)(\S+)/gi;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY)[A-Z0-9_]*)=(\S+)/g;

export function sanitizeCmdline(cmdline: string): string {
  return cmdline
    .replace(SECRET_FLAG_PATTERN, "$1[REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ENV_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
}
