/**
 * Parses the official IANA Service Name and Port Number Registry CSV
 * (https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv).
 *
 * Verified columns (as fetched 2026-09-06):
 * Service Name,Port Number,Transport Protocol,Description,Assignee,Contact,
 * Registration Date,Modification Date,Reference,Service Code,
 * Unauthorized Use Reported,Assignment Notes
 *
 * Only Service Name, Port Number, Transport Protocol, and Description are used.
 * Rows with no service name, or a Reserved/Unassigned description, are skipped.
 */
export interface KnownPortEntry {
  port: number;
  protocol: "tcp" | "udp";
  name: string;
  description: string;
}

export function parseIanaCsv(csv: string): KnownPortEntry[] {
  const lines = csv.split("\n");
  const entries: KnownPortEntry[] = [];

  // Skip the header row.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length === 0) continue;

    const fields = parseCsvLine(line);
    const [serviceName, portStr, transport, description] = fields;
    if (!serviceName || !portStr || !transport) continue;
    if (transport !== "tcp" && transport !== "udp") continue;

    const port = Number.parseInt(portStr, 10);
    if (Number.isNaN(port)) continue;

    const desc = description && description.length > 0 ? description : serviceName;
    if (desc === "Reserved" || desc === "Unassigned") continue;

    entries.push({ port, protocol: transport, name: serviceName, description: desc });
  }

  return entries;
}

/** Minimal CSV line parser handling quoted fields (IANA's CSV quotes fields containing commas). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}
