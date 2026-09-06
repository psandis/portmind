/**
 * Config schema and built-in defaults. Resolution order (lowest to highest
 * precedence): these defaults -> ~/.portmind/config.yaml -> ./.portmind.yaml.
 * Loader/merge logic lands in a later phase; this module only defines the
 * shape so every other module can depend on a stable, typed config.
 */
export interface PortmindConfig {
  scan: {
    intervalSeconds: number;
    includeUdp: boolean;
    docker: boolean;
    sshHosts: SshHostConfig[];
  };
  knownPorts: {
    source: "iana" | "custom" | "both";
    customDbPath: string | null;
    refreshDays: number;
  };
  history: {
    enabled: boolean;
    dbPath: string;
    retentionDays: number;
  };
  riskRules: {
    flagBoundAllInterfaces: boolean;
    flagUnsignedBinary: boolean;
    flagNoKnownService: boolean;
  };
  ai: {
    enabled: boolean;
    provider: "anthropic" | "openai" | "none";
    model: string;
    trigger: "manual";
    fieldsSent: AiField[];
    cmdlineSanitization: boolean;
  };
  output: {
    defaultFormat: "table" | "json";
    color: "auto" | "always" | "never";
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    auditLog: boolean;
  };
}

export interface SshHostConfig {
  name: string;
  host: string;
  user: string;
}

export type AiField = "process_name" | "cmdline" | "port" | "protocol" | "docker_image";

export const DEFAULT_CONFIG: PortmindConfig = {
  scan: {
    intervalSeconds: 5,
    includeUdp: true,
    docker: true,
    sshHosts: [],
  },
  knownPorts: {
    source: "iana",
    customDbPath: null,
    refreshDays: 30,
  },
  history: {
    enabled: true,
    dbPath: "~/.portmind/portmind.db",
    retentionDays: 180,
  },
  riskRules: {
    flagBoundAllInterfaces: true,
    flagUnsignedBinary: true,
    flagNoKnownService: true,
  },
  ai: {
    enabled: false,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    trigger: "manual",
    fieldsSent: ["process_name", "cmdline", "port", "protocol", "docker_image"],
    cmdlineSanitization: true,
  },
  output: {
    defaultFormat: "table",
    color: "auto",
  },
  logging: {
    level: "info",
    auditLog: false,
  },
};
