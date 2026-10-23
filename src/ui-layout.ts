import { fmtDuration, fmtTokens, type ExchangeRecord, type Usage } from "./metrics.ts";

export type Appearance = "cute" | "compact" | "off";
export type DashboardTab = "overview" | "history" | "daily" | "projects";
export type HistorySort = "recent" | "slowest" | "tokens";
export type HistoryFilter = "all" | "success" | "aborted";

export interface FooterState {
  appearance: Appearance;
  provider: string;
  model: string;
  /** Estimated current context use from Pi. Null/undefined means unknown. */
  contextPercent?: number | null;
  contextTokens?: number | null;
  contextWindow?: number | null;
  usage: Usage;
  elapsedMs?: number;
  running: boolean;
}

/** Rendered screen width, not JavaScript string length (CJK, Unicode and ANSI-safe). */
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

const sep = " │ ";
const fits = (text: string, width: number) => visibleWidth(text) <= width;
const safe = (text: string, width: number) => truncateToWidth(text, Math.max(1, width), "…");
const shortTokens = (n: number) => fmtTokens(n).replace(/\.0(?=[km]$)/, "");

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor(seconds / 60) % 60;
  const ss = seconds % 60;
  return hh ? [hh, mm, ss].map((n, i) => i ? String(n).padStart(2, "0") : String(n)).join(":")
    : String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

export function footerLines(width: number, state: FooterState): string[] {
  if (width < 1 || state.appearance === "off") return [];
  const known = typeof state.contextPercent === "number" && Number.isFinite(state.contextPercent)
    && state.contextPercent >= 0;
  const percent = known ? Math.round(state.contextPercent!) + "%" : "--%";
  const ctx = "CTX " + percent;
  const hasTokens = typeof state.contextTokens === "number" && Number.isFinite(state.contextTokens)
    && state.contextTokens >= 0;
  const hasWindow = typeof state.contextWindow === "number" && Number.isFinite(state.contextWindow)
    && state.contextWindow > 0;
  const ctxFull = hasTokens && hasWindow
    ? ctx + " " + shortTokens(state.contextTokens!) + "/" + shortTokens(state.contextWindow!)
    : ctx;
  const provider = state.provider.trim() || "unknown-provider";
  const model = state.model.trim() || "unknown-model";
  const identity = provider + "/" + model;
  const tokens = "↑" + shortTokens(state.usage.input) + " ↓" + shortTokens(state.usage.output);
  const duration = state.elapsedMs === undefined ? undefined : clock(state.elapsedMs);
  const cost = "~$" + state.usage.cost.toFixed(3);
  const extras = [tokens, duration, cost].filter((v): v is string => !!v);

  // Keep all data on one line whenever it fits. When it does not, progressively
  // drop *optional* items (cost first, then clock, then token tally).
  const make = (context: string, optional: string[]) => [context, identity, ...optional].join(sep);
  // In narrow terminals the core is intentionally split across two lines,
  // even if removing every optional field could squeeze it into one.
  if (width >= 50) {
    if (fits(make(ctxFull, extras), width)) return [make(ctxFull, extras)];
    if (fits(make(ctx, extras), width)) return [make(ctx, extras)];
    for (let count = extras.length - 1; count >= 0; count--) {
      if (fits(make(ctx, extras.slice(0, count)), width)) return [make(ctx, extras.slice(0, count))];
    }
  }

  // Core data cannot fit together: use at most two lines, retaining the full
  // provider and model where physically possible. Never drop CTX or identity.
  if (fits(identity, width)) {
    const firstParts = [ctxFull, ...extras];
    while (firstParts.length > 1 && !fits(firstParts.join(sep), width)) firstParts.pop();
    if (!fits(firstParts[0]!, width)) firstParts[0] = ctx;
    return [safe(firstParts.join(sep), width), identity];
  }

  // Long identity: move the provider alongside context and give the model the
  // second line. This avoids cutting long model IDs at 40-60 columns.
  const providerLine = ctx + sep + provider;
  if (fits(providerLine, width)) {
    const line2 = [model];
    for (const item of extras) {
      if (fits([...line2, item].join(sep), width)) line2.push(item);
      else break;
    }
    return [providerLine, safe(line2.join(sep), width)];
  }

  // Extremely narrow terminals / very long provider names cannot display
  // all of three mandatory values in two lines. Truncate as a last resort.
  return [safe(ctx, width), safe(identity, width)];
}

/** Compatibility for RPC status, which accepts a single line only. */
export function footerText(width: number, state: FooterState): string {
  return footerLines(width, state)[0] ?? "";
}

export function headerLines(width: number): string[] {
  if (width < 32) return [];
  if (width < 58) return ["  BC / PI", "  Border Collie"];
  // A one-floppy-ear Border Collie, black eye patches and a white blaze.
  return [
    "       /\\       __",
    "      /  \\_____/  \\__",
    "     / ██  /\\  ██   \\_",
    "    |   ● /  \\ ●    |  BC / PI",
    "    |      ▽        |  Border Collie",
    "     \\   \\____/    /",
    "      \\____________/",
    "",
  ];
}

export interface DashboardState {
  tab: DashboardTab;
  sort: HistorySort;
  filter: HistoryFilter;
  page: number;
  usage: Usage;
  exchanges: ExchangeRecord[];
  globalRecords?: Array<ExchangeRecord & {project:string}>;
  contextPercent?: number | null;
  model: string;
}

export function filteredHistory(exchanges: ExchangeRecord[], filter: HistoryFilter, sort: HistorySort): ExchangeRecord[] {
  const rows = exchanges.filter((e) =>
    filter === "all" || (filter === "aborted" ? e.aborted : !e.aborted),
  );
  if (sort === "slowest") rows.sort((a, b) => b.elapsedMs - a.elapsedMs);
  else if (sort === "tokens") rows.sort((a, b) =>
    (b.usage.input + b.usage.output + b.usage.cacheRead + b.usage.cacheWrite) -
    (a.usage.input + a.usage.output + a.usage.cacheRead + a.usage.cacheWrite),
  );
  else rows.reverse();
  return rows;
}

export function dailyTotals(exchanges: ExchangeRecord[]) {
  const map = new Map<string, { count: number; elapsedMs: number; usage: Usage }>();
  for (const exchange of exchanges) {
    const day = exchange.startedAt.slice(0, 10); // UTC
    const prev = map.get(day) ?? {
      count: 0, elapsedMs: 0,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    };
    prev.count += 1;
    prev.elapsedMs += exchange.elapsedMs;
    prev.usage = {
      input: prev.usage.input + exchange.usage.input,
      output: prev.usage.output + exchange.usage.output,
      cacheRead: prev.usage.cacheRead + exchange.usage.cacheRead,
      cacheWrite: prev.usage.cacheWrite + exchange.usage.cacheWrite,
      cost: prev.usage.cost + exchange.usage.cost,
    };
    map.set(day, prev);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export function dashboardLines(width: number, state: DashboardState): string[] {
  if (width < 1) return [];
  const title = "USAGE / " + state.tab.toUpperCase();
  const hint = "tab/1-4 view · j/k scroll · s sort · f filter · q/esc exit";
  const rows: string[] = [title, "─".repeat(Math.max(1, Math.min(48, width))), `[1] Overview   [2] History   [3] Daily UTC   [4] Projects   (${state.tab})`, ""];
  if (state.tab === "overview") {
    const totalTime = state.exchanges.reduce((sum, e) => sum + e.elapsedMs, 0);
    const avgMs = state.exchanges.length ? totalTime / state.exchanges.length : 0;
    rows.push(
      `Model      ${state.model}`,
      `Input      ${state.usage.input.toLocaleString()}     Output ${state.usage.output.toLocaleString()}`,
      `Cache read ${state.usage.cacheRead.toLocaleString()}     Cache write ${state.usage.cacheWrite.toLocaleString()}`,
      `Cost       ~$${state.usage.cost.toFixed(4)} (Pi estimate)`,
      `Context    ${typeof state.contextPercent === "number" ? state.contextPercent.toFixed(1) + "%" : "N/A"}`,
      `Exchanges  ${state.exchanges.length}`,
      `Wall time  ${fmtDuration(totalTime)}     Average ${fmtDuration(avgMs)}`,
      "Note: branch-scoped, cached tokens separate; no raw prompts stored.",
    );
  } else if (state.tab === "history") {
    const history = filteredHistory(state.exchanges, state.filter, state.sort);
    rows.push(`Sort: ${state.sort}   Filter: ${state.filter}   Rows: ${history.length}`);
    if (!history.length) rows.push("No matching completed exchanges.");
    for (const e of history.slice(state.page, state.page + 8)) {
      const label = e.label ? ` · ${e.label}` : "";
      rows.push(`${e.aborted ? "!" : "✓"} ${e.startedAt.slice(5, 16).replace("T", " ")} ${fmtDuration(e.elapsedMs)} ↓${fmtTokens(e.usage.output)} ${e.model}${label}`);
    }
  } else if(state.tab === "daily") {
    const daily = dailyTotals(state.globalRecords ?? state.exchanges);
    if (!daily.length) rows.push("No completed exchanges yet.");
    for (const [date, item] of daily.slice(state.page, state.page + 8)) {
      rows.push(`${date}  ${item.count} turns  ${fmtDuration(item.elapsedMs)}  ${fmtTokens(item.usage.output)} out  ~$${item.usage.cost.toFixed(3)}`);
    }
  } else {
    if(!state.globalRecords) rows.push("Enable /pi-global on for cross-session projects.");
    else {
      const groups = new Map<string, {count:number; elapsedMs:number; cost:number}>();
      for(const record of state.globalRecords) {
        const current = groups.get(record.project) ?? {count:0, elapsedMs:0, cost:0};
        current.count++;
        current.elapsedMs += record.elapsedMs;
        current.cost += record.usage.cost;
        groups.set(record.project, current);
      }
      const ordered = [...groups.entries()].sort((a,b)=>b[1].elapsedMs-a[1].elapsedMs);
      for(const [project, data] of ordered.slice(state.page, state.page + 8)) {
        rows.push(`${project} · ${data.count} turns · ${fmtDuration(data.elapsedMs)} · ~$${data.cost.toFixed(3)}`);
      }
      if(!ordered.length) rows.push("No indexed exchanges yet.");
    }
  }
  rows.push("", hint);
  return rows;
}
