import { fmtDuration, fmtTokens, type ExchangeRecord, type Usage } from "./metrics.ts";

export type Appearance = "cute" | "compact" | "off";
export type DashboardTab = "overview" | "history" | "daily" | "projects";
export type HistorySort = "recent" | "slowest" | "tokens";
export type HistoryFilter = "all" | "success" | "aborted";

export interface FooterState {
  appearance: Appearance;
  model: string;
  branch?: string | null;
  usage: Usage;
  elapsedMs?: number;
  running: boolean;
  exchanges: number;
  otherStatuses?: string[];
  motionFrame?: number;
}

export function footerText(width: number, state: FooterState): string {
  if (width < 1 || state.appearance === "off") return "";
  const cute = state.appearance === "cute";
  const heart = cute ? (state.motionFrame === 1 ? "♥" : "♡") : "";
  const arrow = cute ? "✦" : "*";
  const elapsed = state.elapsedMs === undefined ? "—" : fmtDuration(state.elapsedMs);
  const tokens = `↑${fmtTokens(state.usage.input)} ↓${fmtTokens(state.usage.output)}`;
  const cost = `~$${state.usage.cost.toFixed(3)}`;
  const clock = `${state.running ? arrow : "✓"} ${elapsed}`;
  const model = state.model || "no-model";
  const brand = cute ? `${heart} pi-style` : "pi-style";
  let sections: string[];
  if (width < 32) sections = [tokens, clock];
  else if (width < 55) sections = [cute ? heart : "pi", tokens, clock];
  else if (width < 85) sections = [brand, model, tokens, cost, clock];
  else sections = [brand, model, tokens, `cache ${fmtTokens(state.usage.cacheRead)}/${fmtTokens(state.usage.cacheWrite)}`, cost, clock];
  if (width >= 105 && state.branch) sections.splice(2, 0, `⑂ ${state.branch}`);
  if (width >= 130) sections.push(`n=${state.exchanges}`);
  const other = state.otherStatuses?.filter(Boolean).join(" · ");
  if (width >= 150 && other) sections.push(other);
  return sections.join(" · ");
}

export function headerLines(width: number): string[] {
  if (width < 32) return [];
  if (width < 58) return ["  ♡ pi-style", "  ✦ small steps, big ideas"];
  return [
    "     /\\_/\\",
    "    ( o.o )   ♡ pi-style",
    "     > ^ <    ✦ small steps, big ideas",
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
  const title = "♡ pi-style · usage atelier";
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
        rows.push(`${project} · ${data.count} turns · ${fmtDuration(data.elapsedMs)} · ~$\${data.cost.toFixed(3)}`);
      }
      if(!ordered.length) rows.push("No indexed exchanges yet.");
    }
  }
  rows.push("", hint);
  return rows;
}
