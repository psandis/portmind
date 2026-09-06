/**
 * Core data shape shared by every UI (CLI, TUI, web). Defined once here;
 * cli/tui/web packages must render this type, never define their own shape.
 */
export interface PortEntry {
  host: string;
  port: number;
  protocol: "tcp" | "udp";
  bindAddress: string;
  pid: number | null;
  processName: string | null;
  cmdline: string | null;
  cwd: string | null;
  startedAt: string | null;
  docker: {
    containerId: string;
    containerName: string;
    image: string;
  } | null;
  knownService: {
    name: string;
    description: string;
    source: "iana" | "custom";
  } | null;
  history: {
    usual: boolean;
    observationCount: number;
    firstSeen: string | null;
    usualOccupant: string | null;
  };
  riskFlags: RiskFlag[];
  aiExplanation: string | null;
}

export type RiskFlag = "bound_all_interfaces" | "unsigned_binary" | "no_known_service";
