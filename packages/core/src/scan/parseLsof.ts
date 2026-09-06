/**
 * Parses `lsof -F pcn` field output into raw listening-socket records.
 *
 * Field format (one token per line, no separators):
 *   p<pid>          start of a new process block
 *   c<command>      command name for the current pid
 *   f<fd>           start of a new file/socket for the current pid
 *   n<address>      address for the current file, e.g. "*:3000", "127.0.0.1:5432", "[::1]:5432"
 *
 * A "p" line always precedes its "c" line; a "f" line always precedes its "n" line.
 * Verified against real `lsof -iTCP -sTCP:LISTEN -P -n -F pcn` output on macOS.
 */
export interface RawListeningSocket {
  pid: number;
  processName: string;
  bindAddress: string;
  port: number;
}

export function parseLsofFieldOutput(output: string): RawListeningSocket[] {
  const sockets: RawListeningSocket[] = [];
  let currentPid: number | null = null;
  let currentCommand: string | null = null;

  for (const line of output.split("\n")) {
    if (line.length === 0) continue;
    const tag = line[0];
    const value = line.slice(1);

    if (tag === "p") {
      currentPid = Number.parseInt(value, 10);
    } else if (tag === "c") {
      currentCommand = value;
    } else if (tag === "n" && currentPid !== null && currentCommand !== null) {
      const parsed = parseAddress(value);
      if (parsed) {
        sockets.push({
          pid: currentPid,
          processName: currentCommand,
          bindAddress: parsed.bindAddress,
          port: parsed.port,
        });
      }
    }
  }

  return sockets;
}

/**
 * Splits an lsof address into bind address + port.
 * Handles "*:3000" (all interfaces v4), "127.0.0.1:5432", "[::1]:5432" (IPv6),
 * and "*:*" / bare "*" (unbound UDP socket, no real port - returns null).
 */
function parseAddress(raw: string): { bindAddress: string; port: number } | null {
  const lastColon = raw.lastIndexOf(":");
  if (lastColon === -1) return null;

  const portStr = raw.slice(lastColon + 1);
  if (portStr === "*" || portStr === "") return null;

  const port = Number.parseInt(portStr, 10);
  if (Number.isNaN(port)) return null;

  let bindAddress = raw.slice(0, lastColon);
  if (bindAddress.startsWith("[") && bindAddress.endsWith("]")) {
    bindAddress = bindAddress.slice(1, -1);
  }
  if (bindAddress === "*") {
    bindAddress = "0.0.0.0";
  }

  return { bindAddress, port };
}
