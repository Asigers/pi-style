import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { SessionStatsCache } from "../src/session-cache.ts";
import {
  ENTRY_TYPE, addUsage, emptyUsage, subtractUsage,
  fmtDuration, fmtTokens, messageUsage,
  type ExchangeRecord, type Usage,
} from "../src/metrics.ts";
import {
  dashboardLines, filteredHistory, footerText, headerLines,
  type Appearance, type DashboardState, type DashboardTab,
  type HistoryFilter, type HistorySort,
} from "../src/ui-layout.ts";

type Panel = "none" | "usage" | "history";
interface ActiveExchange {
  startedAtMs: number;
  startedMonoMs: number;
  firstOutputMs?: number;
  model: string;
  usage: Usage;
  assistantMessages: number;
  toolCalls: number;
  modelStart?: number;
  modelMs: number;
  toolMs: number;
  label?: string;
  /** The usage ledger at the beginning of this continuous run. */
  baseline: Usage;
  userMessages: number;
  segmentStartedAtMs: number;
  segmentStartedMonoMs: number;
  segmentBaseline: Usage;
  segmentLabel?: string;
  segmentFirstOutputMs?: number;
  segmentAssistantMessages: number;
  segmentToolCalls: number;
  segmentModelMs: number;
  segmentToolMs: number;
  completedSegments: ExchangeRecord[];
}

const KEY = "pi-style";
const THEME = "pi-style-blush";
const money = (cost: number) => `~$${cost.toFixed(4)}`;

export default function(pi: ExtensionAPI) {
  let appearance: Appearance = "cute";
  let panel: Panel = "none";
  let active: ActiveExchange | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let totals: Usage = emptyUsage();
  let exchanges: ExchangeRecord[] = [];
  let footerRerender: (() => void) | undefined;
  let footerInstalled = false;
  let headerInstalled = false;
  let editorInstalled = false;
  let savedEditor: ReturnType<ExtensionContext["ui"]["getEditorComponent"]> | undefined;
  let editorCaptured = false;
  let originalTheme: Theme | undefined;
  const statsCache = new SessionStatsCache();
  let motion = false; // reduced motion by default
  let showHeader = true;
  let showEditor = true;
  let quiet = false;
  let originalToolsExpanded: boolean | undefined;
  let frame = 0;
  let nextLabel: string | undefined;
  let globalTracking = false;
  const toolStarted = new Map<string, number>();

  function scan(ctx: ExtensionContext) {
    const snapshot = statsCache.get(ctx.sessionManager);
    totals = snapshot.usage;
    exchanges = snapshot.exchanges;
  }
  function stopTimer() {
    if(timer) clearInterval(timer);
    timer = undefined;
  }
  function durationMs() {
    const latest = exchanges.at(-1);
    return active ? Math.max(0, performance.now() - active.startedMonoMs) : latest?.elapsedMs;
  }
  function effectiveUsage() {
    return active ? addUsage(totals, active.usage) : totals;
  }
  function render(ctx: ExtensionContext) {
    if(!ctx.hasUI) return;
    if(appearance === "off") {
      ctx.ui.setStatus(KEY, undefined);
      ctx.ui.setWidget(KEY, undefined);
      footerRerender?.();
      return;
    }
    const usage = effectiveUsage();
    if(!footerInstalled) {
      ctx.ui.setStatus(KEY, footerText(100, {
        appearance, model: ctx.model?.id ?? active?.model ?? "unknown", usage,
        elapsedMs: durationMs(), running: !!active, exchanges: exchanges.length,
        motionFrame: motion ? frame % 2 : 0,
      }));
    } else {
      ctx.ui.setStatus(KEY, undefined);
      footerRerender?.();
    }

    if(panel === "none") {
      ctx.ui.setWidget(KEY, undefined);
      return;
    }
    if(panel === "usage") {
      const context = ctx.getContextUsage();
      const pct = typeof context?.percent === "number" ? `${context.percent.toFixed(1)}%` : "N/A";
      ctx.ui.setWidget(KEY, [
        "✦ pi-style / current branch ✦",
        `  Input      ${usage.input.toLocaleString()}   Output      ${usage.output.toLocaleString()}`,
        `  Cache read ${usage.cacheRead.toLocaleString()}   Cache write ${usage.cacheWrite.toLocaleString()}`,
        `  Est. cost  ${money(usage.cost)}   Context ${pct}`,
        `  Exchanges  ${exchanges.length}   ${active ? "Running" : "Last"} ${fmtDuration(durationMs() ?? 0)}`,
        "  /pi-usage hides this panel · /pi-tui opens dashboard",
      ]);
    } else {
      const recent = exchanges.slice(-5).reverse();
      ctx.ui.setWidget(KEY, [
        "✿ pi-style / recent exchanges",
        ...recent.map(e => `  ${e.aborted ? "!" : "✓"} ${e.startedAt.slice(5,16).replace("T", " ")} ${fmtDuration(e.elapsedMs)} ↓${fmtTokens(e.usage.output)} ${e.model.slice(0,22)}`),
        recent.length ? "  Wall time includes tool calls and retries" : "  No completed exchanges",
        "  /pi-history hides this panel",
      ]);
    }
  }

  async function applySkin(ctx: ExtensionContext) {
    if(!ctx.hasUI || ctx.mode !== "tui") return;
    if(appearance === "off") {
      if(footerInstalled) { ctx.ui.setFooter(undefined); footerInstalled = false; footerRerender = undefined; }
      if(headerInstalled) { ctx.ui.setHeader(undefined); headerInstalled = false; }
      if(editorInstalled) { ctx.ui.setEditorComponent(editorCaptured ? savedEditor : undefined); editorInstalled = false; }
      if(ctx.ui.theme.name === THEME && originalTheme) ctx.ui.setTheme(originalTheme);
      originalTheme = undefined;
      if(originalToolsExpanded !== undefined) {
        ctx.ui.setToolsExpanded(originalToolsExpanded);
        originalToolsExpanded = undefined;
      }
      ctx.ui.setStatus(KEY, undefined);
      ctx.ui.setWidget(KEY, undefined);
      return;
    }
    // Apply theme instances, not names: setTheme("name") persists into settings.json.
    // The in-memory path keeps the user's configured theme intact across restarts.
    if(ctx.ui.theme.name !== THEME) {
      const blush = ctx.ui.getTheme(THEME);
      if(blush) {
        originalTheme ??= ctx.ui.theme;
        const result = ctx.ui.setTheme(blush);
        if(!result.success) ctx.ui.notify(`pi-style theme unavailable: ${result.error || THEME}`, "warning");
      } else {
        ctx.ui.notify(`pi-style theme unavailable: ${THEME}`, "warning");
      }
    }

    if(typeof ctx.ui.setFooter === "function" && !footerInstalled) {
      const { truncateToWidth, visibleWidth } = await import("@earendil-works/pi-tui");
      ctx.ui.setFooter((tui, theme, data) => {
        const update = () => tui.requestRender();
        footerRerender = update;
        const unsubscribe = data.onBranchChange(update);
        return {
          dispose() {
            unsubscribe();
            if(footerRerender === update) footerRerender = undefined;
          },
          invalidate() {},
          render(width: number): string[] {
            const otherStatuses = [...data.getExtensionStatuses().entries()]
              .filter(([key]) => key !== KEY).map(([, value]) => value);
            const line = footerText(width, {
              appearance, model: ctx.model?.id ?? active?.model ?? "unknown",
              branch: data.getGitBranch(), usage: effectiveUsage(), elapsedMs: durationMs(),
              running: !!active, exchanges: exchanges.length,
              motionFrame: motion ? frame % 2 : 0, otherStatuses,
            });
            const colored = theme.fg("accent", line.slice(0, appearance === "cute" ? 1 : 0)) +
              theme.fg("muted", line.slice(appearance === "cute" ? 1 : 0));
            const statusWidth = visibleWidth(colored);
            const safe = truncateToWidth(colored, Math.max(1,width), "");
            // One line only, never overflow narrow SSH/tmux terminals
            return [statusWidth > width ? safe : colored];
          },
        };
      });
      footerInstalled = true;
    }

    if(appearance === "cute" && showHeader && !headerInstalled && typeof ctx.ui.setHeader === "function") {
      const { truncateToWidth } = await import("@earendil-works/pi-tui");
      ctx.ui.setHeader((_tui, theme) => ({
        invalidate() {},
        render(width: number): string[] {
          return headerLines(width).map((line, i) =>
            truncateToWidth(theme.fg(i === 0 ? "accent" : "muted", line), Math.max(1, width), ""),
          );
        },
      }));
      headerInstalled = true;
    } else if((appearance !== "cute" || !showHeader) && headerInstalled) {
      ctx.ui.setHeader(undefined);
      headerInstalled = false;
    }

    if(appearance === "cute" && showEditor && !editorInstalled && typeof ctx.ui.setEditorComponent === "function") {
      if(!editorCaptured) {
        savedEditor = ctx.ui.getEditorComponent();
        editorCaptured = true;
      }
      const { CuteEditor } = await import("../src/cute-editor.ts");
      ctx.ui.setEditorComponent((tui, theme, kb) => new CuteEditor(tui, theme, kb));
      editorInstalled = true;
    } else if((appearance !== "cute" || !showEditor) && editorInstalled) {
      ctx.ui.setEditorComponent(editorCaptured ? savedEditor : undefined);
      editorInstalled = false;
    }
    if(quiet) {
      if(originalToolsExpanded === undefined) originalToolsExpanded = ctx.ui.getToolsExpanded();
      ctx.ui.setToolsExpanded(false);
    } else if(originalToolsExpanded !== undefined) {
      ctx.ui.setToolsExpanded(originalToolsExpanded);
      originalToolsExpanded = undefined;
    }
    render(ctx);
  }

  function startTimer(ctx: ExtensionContext) {
    stopTimer();
    if(ctx.hasUI) timer = setInterval(() => { frame++; render(ctx); }, 1000);
  }
  function reset(ctx: ExtensionContext) {
    stopTimer();
    toolStarted.clear();
    active = undefined;
    scan(ctx);
    render(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    statsCache.invalidate();
    originalTheme = undefined;
    const { globalEnabled } = await import("../src/global-store.ts");
    globalTracking = await globalEnabled();
    // Component factories may be reset by a Pi session reload.
    footerInstalled = false; headerInstalled = false; editorInstalled = false;
    editorCaptured = false; savedEditor = undefined; footerRerender = undefined;
    reset(ctx);
    await applySkin(ctx);
  });
  pi.on("session_tree", (_event, ctx) => { scan(ctx); render(ctx); });
  pi.on("session_shutdown", async (_event, ctx) => {
    stopTimer(); toolStarted.clear(); active = undefined;
    // Do not change the user's theme/other extensions on shutdown.
    if(ctx.hasUI) {
      ctx.ui.setStatus(KEY, undefined);
      ctx.ui.setWidget(KEY, undefined);
    }
  });
  pi.on("model_select", (_event, ctx) => render(ctx));

  function finishSegment(run: ActiveExchange, ctx: ExtensionContext, endedAtMs: number, endedMonoMs: number, aborted: boolean) {
    statsCache.invalidate();
    const currentUsage = statsCache.get(ctx.sessionManager).usage;
    const isShared = run.userMessages > 1;
    const record: ExchangeRecord = {
      version: 1,
      startedAt: new Date(run.segmentStartedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      elapsedMs: Math.round(Math.max(0, endedMonoMs - run.segmentStartedMonoMs)),
      model: run.model,
      usage: subtractUsage(currentUsage, run.segmentBaseline),
      assistantMessages: run.assistantMessages - run.segmentAssistantMessages,
      toolCalls: run.toolCalls - run.segmentToolCalls,
      aborted,
      ...(run.segmentLabel ? { label: run.segmentLabel } : {}),
      ...(run.segmentFirstOutputMs === undefined ? {} : { firstOutputMs: Math.round(run.segmentFirstOutputMs) }),
      modelMs: Math.round(run.modelMs - run.segmentModelMs),
      toolMs: Math.round(run.toolMs - run.segmentToolMs),
      // For queued inputs we measure processing from message_start, not queue wait.
      timingBasis: isShared ? "processing" : "agent-start",
      sharedRun: isShared,
    };
    run.completedSegments.push(record);
    run.segmentBaseline = currentUsage;
  }

  pi.on("before_agent_start", (event, ctx) => {
    if(event.messageType !== "user" || active) return;
    scan(ctx);
    const now=Date.now(), mono=performance.now(), baseline={...totals};
    active = {
      startedAtMs: now, startedMonoMs: mono,
      model: ctx.model?.id ?? "unknown", usage: emptyUsage(),
      assistantMessages: 0, toolCalls: 0, modelMs: 0, toolMs: 0,
      baseline, userMessages: 0, segmentStartedAtMs: now, segmentStartedMonoMs: mono,
      segmentBaseline: baseline, segmentAssistantMessages: 0, segmentToolCalls: 0,
      segmentModelMs: 0, segmentToolMs: 0, segmentLabel: nextLabel, completedSegments: [],
    };
    nextLabel = undefined;
    startTimer(ctx);
    render(ctx);
  });

  pi.on("message_start", (event, ctx) => {
    if(!active) return;
    if(event.message.role === "user") {
      active.userMessages += 1;
      if(active.userMessages > 1) {
        const now=Date.now(), mono=performance.now();
        finishSegment(active, ctx, now, mono, false);
        active.segmentStartedAtMs=now;
        active.segmentStartedMonoMs=mono;
        active.segmentFirstOutputMs=undefined;
        active.segmentAssistantMessages=active.assistantMessages;
        active.segmentToolCalls=active.toolCalls;
        active.segmentModelMs=active.modelMs;
        active.segmentToolMs=active.toolMs;
        active.segmentLabel=undefined;
      }
    } else if(event.message.role === "assistant" && active.modelStart === undefined) {
      active.modelStart = performance.now();
    }
  });

  pi.on("message_update", (event, _ctx) => {
    if(!active) return;
    const kind = event.assistantMessageEvent.type;
    if(kind === "text_delta" || kind === "thinking_delta" || kind === "toolcall_start") {
      const now=performance.now();
      if(active.firstOutputMs === undefined) {
        active.firstOutputMs = Math.max(0, now - active.startedMonoMs);
      }
      if(active.segmentFirstOutputMs === undefined) {
        active.segmentFirstOutputMs = Math.max(0, now - active.segmentStartedMonoMs);
      }
    }
  });
  pi.on("message_end", (event, ctx) => {
    if(!active || event.message.role !== "assistant") return;
    if(active.modelStart !== undefined) {
      active.modelMs += Math.max(0, performance.now() - active.modelStart);
      active.modelStart = undefined;
    }
    active.assistantMessages++;
    active.usage = addUsage(active.usage, messageUsage(event.message));
    render(ctx);
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if(!active) return;
    active.toolCalls++;
    toolStarted.set(event.toolCallId, performance.now());
    render(ctx);
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if(!active) return;
    const started = toolStarted.get(event.toolCallId);
    if(started !== undefined) {
      active.toolMs += typeof event.durationMs === "number"
        ? Math.max(0, event.durationMs)
        : Math.max(0, performance.now() - started);
      toolStarted.delete(event.toolCallId);
    }
    render(ctx);
  });

  pi.on("agent_settled", async (event, ctx) => {
    if(!active) return;
    stopTimer();
    const run=active;
    active=undefined;
    toolStarted.clear();
    const endedAtMs=Date.now(), endedMonoMs=performance.now();
    // If a retried/custom sequence did not re-emit the user message, keep the
    // initial user request rather than inventing an extra prompt.
    finishSegment(run, ctx, endedAtMs, endedMonoMs, event.aborted === true);
    const shared=run.userMessages > 1;
    for(const record of run.completedSegments) {
      if(shared) {
        record.sharedRun=true;
        record.timingBasis="processing";
      }
      pi.appendEntry(ENTRY_TYPE, record);
      if(globalTracking) {
        try {
          const { appendIndexedExchange } = await import("../src/global-store.ts");
          const sessionId=ctx.sessionManager.getSessionId();
          await appendIndexedExchange({
            ...record,
            id: sessionId + ":" + randomUUID(),
            sessionId,
            project: ctx.cwd,
          });
        } catch(error) {
          ctx.ui.notify(`pi-style index write failed: ${String(error)}`, "warning");
        }
      }
    }
    statsCache.invalidate();
    scan(ctx);
    render(ctx);
  });

  pi.registerCommand("pi-style", {
    description: "Appearance: cute | compact | off | theme | motion on/off | header on/off | editor on/off | quiet on/off",
    handler: async (args, ctx) => {
      const [first = "", second = ""] = args.trim().toLowerCase().split(/\s+/);
      if(first === "cute" || first === "compact" || first === "off") {
        appearance = first;
        await applySkin(ctx);
        render(ctx);
        ctx.ui.notify(`pi-style: ${first}`, "info");
      } else if(first === "theme") {
        const theme = ctx.ui.getTheme(THEME);
        if(theme) {
          originalTheme ??= ctx.ui.theme;
          const result = ctx.ui.setTheme(theme);
          ctx.ui.notify(result.success ? `Theme: ${THEME}` : `Theme unavailable: ${result.error}`, result.success ? "info" : "warning");
        } else ctx.ui.notify(`Theme not loaded: ${THEME}`, "warning");
      } else if(first === "motion" && ["on","off"].includes(second)) {
        motion = second === "on"; render(ctx);
        ctx.ui.notify(`Motion: ${motion ? "enabled" : "reduced"}`, "info");
      } else if(["header","editor","quiet"].includes(first) && ["on","off"].includes(second)) {
        if(first === "header") showHeader = second === "on";
        if(first === "editor") showEditor = second === "on";
        if(first === "quiet") quiet = second === "on";
        await applySkin(ctx);
        ctx.ui.notify(`${first}: ${second}`, "info");
      } else {
        ctx.ui.notify("Usage: /pi-style cute|compact|off|theme|motion on/off|header on/off|editor on/off|quiet on/off", "info");
      }
    },
  });

  pi.registerCommand("pi-global", {
    description: "Opt-in cross-session metrics: on | off | status",
    handler: async(args, ctx) => {
      const { globalEnabled, setGlobalEnabled } = await import("../src/global-store.ts");
      const option = args.trim().toLowerCase();
      if(option === "on" || option === "off") {
        globalTracking = option === "on";
        await setGlobalEnabled(globalTracking);
      } else if(option === "status") {
        globalTracking = await globalEnabled();
      }
      ctx.ui.notify(`Cross-session tracking ${globalTracking ? "ON" : "OFF"} (no prompt content)`, "info");
    },
  });
  pi.registerCommand("pi-export", {
    description: "Export opt-in cross-session metrics as JSON into ~/.pi/agent/pi-style/",
    handler: async(_args, ctx) => {
      if(!globalTracking) { ctx.ui.notify("First enable /pi-global on", "warning"); return; }
      try {
        const { readIndexedExchanges, exportMetricsJson } = await import("../src/global-store.ts");
        const path = await exportMetricsJson(await readIndexedExchanges());
        ctx.ui.notify(`pi-style exported: ${path}`, "info");
      } catch(error) { ctx.ui.notify(`Export failed: ${String(error)}`, "error"); }
    },
  });
  pi.registerCommand("pi-label", {
    description: "Opt-in label for the next exchange; never stores prompt text",
    handler: async(args, ctx) => {
      nextLabel = args.trim().slice(0, 64).replace(/[\r\n\t]/g, " ") || undefined;
      ctx.ui.notify(nextLabel ? `Next exchange label: ${nextLabel}` : "Next exchange label cleared", "info");
    },
  });

  pi.registerCommand("pi-usage", {
    description: "Toggle quick branch usage panel",
    handler: async(_args, ctx) => {
      panel = panel === "usage" ? "none" : "usage";
      scan(ctx); render(ctx);
    },
  });
  pi.registerCommand("pi-history", {
    description: "Toggle last five exchange timings",
    handler: async(_args, ctx) => {
      panel = panel === "history" ? "none" : "history";
      scan(ctx); render(ctx);
    },
  });

  pi.registerCommand("pi-tui", {
    description: "Interactive cute dashboard (TUI only)",
    handler: async(_args, ctx) => {
      if(ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") {
        ctx.ui.notify("Interactive dashboard requires Pi terminal mode", "warning");
        return;
      }
      scan(ctx);
      const currentSnapshot = statsCache.get(ctx.sessionManager);
      const globalRecords = globalTracking
        ? await (await import("../src/global-store.ts")).readIndexedExchanges()
        : undefined;
      const { matchesKey, truncateToWidth } = await import("@earendil-works/pi-tui");
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let tab: DashboardTab = "overview";
        let sort: HistorySort = "recent";
        let filter: HistoryFilter = "all";
        let page = 0;
        const tabs: DashboardTab[] = ["overview","history","daily","projects"];
        const sorts: HistorySort[] = ["recent","slowest","tokens"];
        const filters: HistoryFilter[] = ["all","success","aborted"];
        const component = {
          invalidate() {},
          render(width: number): string[] {
            const state: DashboardState = {
              tab, sort, filter, page, usage: currentSnapshot.usage,
              exchanges: currentSnapshot.exchanges,
              globalRecords,
              contextPercent: ctx.getContextUsage()?.percent,
              model: ctx.model?.id ?? "unknown",
            };
            return dashboardLines(width, state).map((line, i) =>
              truncateToWidth(theme.fg(i === 0 ? "accent" : (i === 1 ? "border" : "text"), line), Math.max(1,width), ""),
            );
          },
          handleInput(data: string) {
            if(data === "q" || matchesKey(data, "escape")) { done(); return; }
            if(data === "1" || data === "2" || data === "3" || data === "4") {
              tab = tabs[Number(data)-1]!; page = 0;
            } else if(matchesKey(data, "tab") || matchesKey(data, "right")) {
              tab = tabs[(tabs.indexOf(tab)+1)%tabs.length]!; page = 0;
            } else if(matchesKey(data, "left")) {
              tab = tabs[(tabs.indexOf(tab)+tabs.length-1)%tabs.length]!; page = 0;
            } else if(data === "s") {
              sort = sorts[(sorts.indexOf(sort)+1)%sorts.length]!; page = 0;
            } else if(data === "f") {
              filter = filters[(filters.indexOf(filter)+1)%filters.length]!; page = 0;
            } else if(data === "j" || matchesKey(data, "down")) {
              const len = tab === "history"
                ? filteredHistory(currentSnapshot.exchanges, filter, sort).length
                : tab === "daily" ? new Set((globalRecords ?? currentSnapshot.exchanges).map(e => e.startedAt.slice(0,10))).size
                : tab === "projects" ? new Set((globalRecords ?? []).map(e => e.project)).size : 0;
              page = Math.min(Math.max(0, len-1), page+1);
            } else if(data === "k" || matchesKey(data, "up")) {
              page = Math.max(0, page-1);
            }
            tui.requestRender();
          },
        };
        return component;
      });
    },
  });
}
