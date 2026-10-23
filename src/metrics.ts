/** Pure helpers: no Pi runtime dependency, safe to unit test. */

export const ENTRY_TYPE = "pi-style.exchange";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface ExchangeRecord {
  version: 1;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  model: string;
  usage: Usage;
  assistantMessages: number;
  toolCalls: number;
  aborted: boolean;
  firstOutputMs?: number;
  /** Optional, explicitly provided by /pi-label. */
  label?: string;
  /** Assistant message event span time, excludes wait before first event. */
  modelMs?: number;
  /** Sum of tool execution durations; may exceed wall time for concurrent tools. */
  toolMs?: number;
  llmWallMs?: number;
  toolWallMs?: number;
  otherWallMs?: number;
  llmCalls?: number;
  toolExecutions?: number;
  slowOps?: Array<{phase:"llm"|"tool";name:string;durationMs:number}>;
  /** Time begins when Pi processes a queued user message, not when it was typed. */
  timingBasis?: "agent-start" | "processing";
  /** Shared-run attribution may be imprecise when Pi batches queued messages. */
  sharedRun?: boolean;
}

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function messageUsage(message: unknown): Usage {
  if (!message || typeof message !== "object") return emptyUsage();
  const m = message as { role?: unknown; usage?: Record<string, unknown> };
  if (m.role !== "assistant" || !m.usage) return emptyUsage();
  const u = m.usage;
  const cost = (u.cost && typeof u.cost === "object" ? u.cost : {}) as Record<string, unknown>;
  return {
    input: numeric(u.input),
    output: numeric(u.output),
    cacheRead: numeric(u.cacheRead),
    cacheWrite: numeric(u.cacheWrite),
    cost: numeric(cost.total),
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cost: a.cost + b.cost,
  };
}

/** Usage extraction consistent with Pi's session statistics accounting.
 * One ledger entry contributes at most once; custom pi-style records have no cost. */
export function entryUsage(entry: unknown): Usage {
  if (!entry || typeof entry !== "object") return emptyUsage();
  const e = entry as { type?: string; usage?: unknown; message?: unknown };
  if (e.type === "message") {
    if (!e.message || typeof e.message !== "object") return emptyUsage();
    const message = e.message as {role?: unknown;usage?: unknown};
    if (message.role !== "assistant" && message.role !== "toolResult") return emptyUsage();
    return rawUsage(message.usage);
  }
  if (e.type === "usage" || e.type === "branch_summary" || e.type === "compaction") {
    return rawUsage(e.usage);
  }
  return emptyUsage();
}

export function rawUsage(value: unknown): Usage {
  if(!value || typeof value !== "object") return emptyUsage();
  const u=value as Record<string,unknown>;
  const costs=u.cost && typeof u.cost === "object" ? u.cost as Record<string, unknown> : undefined;
  return {
    input:numeric(u.input), output:numeric(u.output), cacheRead:numeric(u.cacheRead),
    cacheWrite:numeric(u.cacheWrite), cost:numeric(costs?.total),
  };
}

export function subtractUsage(after: Usage, before: Usage): Usage {
  return {
    input: Math.max(0, after.input - before.input),
    output: Math.max(0, after.output - before.output),
    cacheRead: Math.max(0, after.cacheRead - before.cacheRead),
    cacheWrite: Math.max(0, after.cacheWrite - before.cacheWrite),
    cost: Math.max(0, after.cost - before.cost),
  };
}

export function branchUsage(entries: readonly unknown[]): Usage {
  let usage = emptyUsage();
  for (const entry of entries) usage = addUsage(usage, entryUsage(entry));
  return usage;
}

function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return ["input", "output", "cacheRead", "cacheWrite", "cost"].every(
    (key) => typeof u[key] === "number" && Number.isFinite(u[key]) && (u[key] as number) >= 0,
  );
}

export function branchExchanges(entries: readonly unknown[]): ExchangeRecord[] {
  const result: ExchangeRecord[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { type?: unknown; customType?: unknown; data?: unknown };
    if (e.type !== "custom" || e.customType !== ENTRY_TYPE || !e.data || typeof e.data !== "object") continue;
    const d = e.data as Partial<ExchangeRecord>;
    if (
      d.version !== 1 ||
      typeof d.startedAt !== "string" ||
      typeof d.endedAt !== "string" ||
      typeof d.model !== "string" ||
      typeof d.elapsedMs !== "number" ||
      !Number.isFinite(d.elapsedMs) ||
      d.elapsedMs < 0 ||
      !isUsage(d.usage) ||
      typeof d.assistantMessages !== "number" ||
      typeof d.toolCalls !== "number" ||
      typeof d.aborted !== "boolean"
    ) continue;
    result.push(d as ExchangeRecord);
  }
  return result;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}

export function fmtDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
