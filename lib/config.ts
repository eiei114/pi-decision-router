import { homedir } from "node:os";
import { join } from "node:path";

export interface DecisionRouterConfig {
  enabled: boolean;
  childEnabled: boolean;
  timeoutMs: number;
  auditLogPath: string;
  maxContextChars: number;
  piBin?: string;
  provider?: string;
  model?: string;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function defaultAuditLogPath(home = homedir()): string {
  return join(home, ".pi", "agent", "pi-decision-router", "audit.jsonl");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, home = homedir()): DecisionRouterConfig {
  return {
    enabled: readBoolean(env.PI_DECISION_ROUTER_ENABLED, true),
    childEnabled: readBoolean(env.PI_DECISION_ROUTER_CHILD, true),
    timeoutMs: readPositiveInteger(env.PI_DECISION_ROUTER_TIMEOUT_MS, 45_000),
    auditLogPath: env.PI_DECISION_ROUTER_AUDIT_LOG || defaultAuditLogPath(home),
    maxContextChars: readPositiveInteger(env.PI_DECISION_ROUTER_MAX_CONTEXT_CHARS, 12_000),
    piBin: env.PI_DECISION_ROUTER_PI_BIN || env.PI_BIN,
    provider: env.PI_DECISION_ROUTER_PROVIDER,
    model: env.PI_DECISION_ROUTER_MODEL,
  };
}
