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
  const percent = known ? state.contextPercent!.toFixed(1) + "%" : "--%";
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
  contextTokens?: number | null;
  contextWindow?: number | null;
  provider: string;
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

/** Minimal, width-safe terminal analytics; returns no control sequences. */
export function dashboardLines(width: number, state: DashboardState): string[] {
  if(width < 1) return [];
  const narrow = width < 78;
  const rows: string[] = [];
  const add = (line = "") => rows.push(truncateToWidth(line, width, ""));
  const rule = () => add("─".repeat(Math.min(width, 60)));
  const tabs = narrow
    ? ["1 Overview   2 History", "3 Daily UTC  4 Projects"]
    : ["1 Overview   /   2 History   /   3 Daily UTC   /   4 Projects"];

  const n = (value: number) => value.toLocaleString("en-US");
  const pct = typeof state.contextPercent === "number" && Number.isFinite(state.contextPercent)
    ? state.contextPercent.toFixed(1) + "%" : "--%";
  const known = typeof state.contextTokens === "number" && Number.isFinite(state.contextTokens)
    && typeof state.contextWindow === "number" && state.contextWindow > 0;
  const contextCount = known ? shortTokens(state.contextTokens!) + "/" + shortTokens(state.contextWindow!) : "usage unknown";
  const percent = typeof state.contextPercent === "number" && Number.isFinite(state.contextPercent)
    ? Math.min(100, Math.max(0, state.contextPercent)) : 0;
  const barSize = narrow ? Math.max(3, Math.min(width - 3, 18)) : 16;
  const filled = Math.round(percent / 100 * barSize);
  const bar = "━".repeat(filled) + "─".repeat(barSize - filled);
  const providerModel = (state.provider || "unknown-provider") + " / " + (state.model || "unknown-model");

  add("USAGE / " + state.tab.toUpperCase());
  rule();
  tabs.forEach(add);
  add();

  if(state.tab === "overview") {
    const totalTime = state.exchanges.reduce((sum, e) => sum + e.elapsedMs, 0);
    const avgMs = state.exchanges.length ? totalTime / state.exchanges.length : 0;
    if(!narrow) {
      const leftWidth = Math.floor((width - 5) / 2);
      const cell = (a: string, b: string) => add(
        truncateToWidth(a, leftWidth, "").padEnd(leftWidth, " ") + " │ " + b,
      );
      cell("CONTEXT", "MODEL / PROVIDER");
      cell("  " + pct + "  " + contextCount, "  " + providerModel);
      cell("  " + bar, "");
      add();
      cell("TOKEN USAGE", "ESTIMATED COST");
      cell("  Input        " + n(state.usage.input), "  ~$" + state.usage.cost.toFixed(4));
      cell("  Output       " + n(state.usage.output), "  Pi usage metadata, not provider invoice");
      cell("  Cache read   " + n(state.usage.cacheRead), "");
      cell("  Cache write  " + n(state.usage.cacheWrite), "");
    } else {
      add("CONTEXT");
      add("  " + pct + "  " + contextCount);
      add("  " + bar);
      add();
      add("MODEL / PROVIDER");
      add("  " + providerModel);
      add();
      add("TOKEN USAGE");
      add("  Input        " + n(state.usage.input));
      add("  Output       " + n(state.usage.output));
      add("  Cache read   " + n(state.usage.cacheRead));
      add("  Cache write  " + n(state.usage.cacheWrite));
      add();
      add("ESTIMATED COST");
      add("  ~$" + state.usage.cost.toFixed(4) + " (Pi estimate)");
    }
    add();
    add("SESSION TIMING");
    if(state.exchanges.length === 0) {
      add("  No timing records for this branch.");
      add("  New completed requests will be tracked.");
      add("  Historical Token usage cannot recover past duration.");
    } else {
      add("  Exchanges " + n(state.exchanges.length) + "   Total " + fmtDuration(totalTime)
        + "   Average " + fmtDuration(avgMs));
    }
  } else if(state.tab === "history") {
    const history = filteredHistory(state.exchanges, state.filter, state.sort);
    add("RECENT EXCHANGES   " + history.length + " recorded");
    add("Sort " + state.sort + "  /  Filter " + state.filter);
    add();
    if(!history.length) {
      add("No timing records match this filter.");
      add("Pi only records durations for requests completed");
      add("after installing this extension.");
    } else {
      for(const e of history.slice(state.page, state.page + (narrow ? 6 : 8))) {
        const label = e.label ? "  " + e.label : "";
        add((e.aborted ? "!" : "✓") + " " + e.startedAt.slice(5,16).replace("T", " ")
          + "   " + fmtDuration(e.elapsedMs) + "   ↓" + fmtTokens(e.usage.output)
          + "   " + e.model + label);
      }
    }
  } else if(state.tab === "daily") {
    const daily = dailyTotals(state.globalRecords ?? state.exchanges);
    add("DAILY USAGE   UTC");
    add();
    if(!daily.length) {
      add("No completed exchanges yet.");
      add("Use /pi-global on to index future sessions.");
    } else {
      for(const [date, item] of daily.slice(state.page, state.page + 8)) {
        add(date + "   " + item.count + " turns  " + fmtDuration(item.elapsedMs)
          + "  ↓" + fmtTokens(item.usage.output) + "  ~$" + item.usage.cost.toFixed(3));
      }
    }
  } else {
    add("PROJECTS");
    add();
    if(!state.globalRecords) {
      add("Cross-session metrics are disabled.");
      add("Run /pi-global on to start local indexing.");
    } else {
      const groups = new Map<string,{count:number;elapsedMs:number;cost:number}>();
      for(const record of state.globalRecords) {
        const prev = groups.get(record.project) ?? {count:0,elapsedMs:0,cost:0};
        prev.count++;
        prev.elapsedMs += record.elapsedMs;
        prev.cost += record.usage.cost;
        groups.set(record.project,prev);
      }
      const items=[...groups.entries()].sort((a,b)=>b[1].elapsedMs-a[1].elapsedMs);
      if(!items.length) add("No indexed exchanges yet.");
      for(const [project,data] of items.slice(state.page,state.page+8)) {
        add(project + "   " + data.count + " turns   " + fmtDuration(data.elapsedMs)
          + "   ~$" + data.cost.toFixed(3));
      }
    }
  }
  add();
  add(narrow ? "1-4 tabs   j/k scroll   q exit" : "1-4 / Tab tabs   j/k scroll   s sort   f filter   q / Esc exit");
  return rows;
}

/** Semantic color for the terminal dashboard: section headings, dividers, and notices. */
export function dashboardLineColor(line: string, index: number): "accent" | "border" | "muted" | "warning" | "text" {
  if(index === 0) return "accent";
  if(line.startsWith("─")) return "border";
  if(/^(CONTEXT|MODEL \/ PROVIDER|TOKEN USAGE|ESTIMATED COST|SESSION TIMING|RECENT EXCHANGES|DAILY USAGE|PROJECTS)$/.test(line.trim())) return "accent";
  if(line.includes("No timing records") || line.includes("Historical Token usage")) return "warning";
  if(line.includes("tabs") || line.startsWith("1 Overview") || line.startsWith("3 Daily")) return "muted";
  return "text";
}
