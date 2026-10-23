import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  ENTRY_TYPE,
  addUsage,
  branchExchanges,
  branchUsage,
  emptyUsage,
  fmtDuration,
  fmtTokens,
  messageUsage,
  type ExchangeRecord,
  type Usage,
} from "../src/metrics.ts";

type Appearance = "cute" | "compact" | "off";
type Panel = "none" | "usage" | "history";

interface ActiveExchange {
  startedAtMs: number;
  startedMonoMs: number;
  firstOutputMs?: number;
  model: string;
  usage: Usage;
  assistantMessages: number;
  toolCalls: number;
}

const KEY = "pi-style";
const money = (cost: number) => `~$${cost.toFixed(4)}`;

export default function (pi: ExtensionAPI) {
  let appearance: Appearance = "cute";
  let panel: Panel = "none";
  let active: ActiveExchange | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let totals: Usage = emptyUsage();
  let exchanges: ExchangeRecord[] = [];

  function scan(ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    totals = branchUsage(branch);
    exchanges = branchExchanges(branch);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function render(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    if (appearance === "off") {
      ctx.ui.setStatus(KEY, undefined);
      ctx.ui.setWidget(KEY, undefined);
      return;
    }

    const usage = active ? addUsage(totals, active.usage) : totals;
    const latest = exchanges.at(-1);
    const duration = active
      ? fmtDuration(performance.now() - active.startedMonoMs)
      : latest
        ? fmtDuration(latest.elapsedMs)
        : "—";
    const shortModel = (ctx.model?.id ?? active?.model ?? "no-model").slice(0, 25);
    const prefix = appearance === "cute" ? "♡ pi-style" : "pi-style";
    const clock = active ? (appearance === "cute" ? "⏳" : "running") : "last";
    const cache = `${fmtTokens(usage.cacheRead)}/${fmtTokens(usage.cacheWrite)}`;

    ctx.ui.setStatus(
      KEY,
      `${prefix} · ${shortModel} · ↑${fmtTokens(usage.input)} ↓${fmtTokens(usage.output)} · cache ${cache} · ${money(usage.cost)} · ${clock} ${duration}`,
    );

    if (panel === "none") {
      ctx.ui.setWidget(KEY, undefined);
      return;
    }

    const bar = appearance === "cute" ? "✦" : "-";
    if (panel === "usage") {
      const context = ctx.getContextUsage();
      const pct = typeof context?.percent === "number" ? `${context.percent.toFixed(1)}%` : "N/A";
      ctx.ui.setWidget(KEY, [
        `${bar} pi-style / current branch ${bar}`,
        `  Input      ${usage.input.toLocaleString()}   Output      ${usage.output.toLocaleString()}`,
        `  Cache read ${usage.cacheRead.toLocaleString()}   Cache write ${usage.cacheWrite.toLocaleString()}`,
        `  Est. cost  ${money(usage.cost)}   Context ${pct}`,
        `  Exchanges  ${exchanges.length}   ${active ? "Running " : "Last    "}${duration}`,
        `  /pi-usage hides this panel `,
      ]);
    } else {
      const recent = exchanges.slice(-5).reverse();
      ctx.ui.setWidget(KEY, [
        `${bar} pi-style / last ${recent.length} exchanges ${bar}`,
        ...recent.map((e) => {
          const when = e.startedAt.replace("T", " ").slice(5, 16);
          const model = e.model.slice(0, 19);
          const badge = e.aborted ? "!" : "✓";
          return `  ${badge} ${when}  ${fmtDuration(e.elapsedMs).padEnd(8)}  ${model}  ↓${fmtTokens(e.usage.output)}`;
        }),
        recent.length === 0 ? "  No finished exchanges yet" : "  Times include tool calls & retries",
        "  /pi-history hides this panel",
      ]);
    }
  }

  function beginTimer(ctx: ExtensionContext) {
    stopTimer();
    if (ctx.hasUI) timer = setInterval(() => render(ctx), 1000);
  }

  pi.on("session_start", (_event, ctx) => {
    stopTimer();
    active = undefined;
    scan(ctx);
    render(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    scan(ctx);
    render(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopTimer();
    if (ctx.hasUI) {
      ctx.ui.setStatus(KEY, undefined);
      ctx.ui.setWidget(KEY, undefined);
    }
    active = undefined;
  });

  pi.on("before_agent_start", (event, ctx) => {
    // Pi's normal user prompt; not a custom extension-initiated turn.
    if (event.messageType === "custom" || active) return;
    active = {
      startedAtMs: Date.now(),
      startedMonoMs: performance.now(),
      model: ctx.model?.id ?? "unknown",
      usage: emptyUsage(),
      assistantMessages: 0,
      toolCalls: 0,
    };
    beginTimer(ctx);
    render(ctx);
  });

  pi.on("message_update", (event, _ctx) => {
    if (!active || active.firstOutputMs !== undefined) return;
    const kind = event.assistantMessageEvent.type;
    if (kind === "text_delta" || kind === "thinking_delta" || kind === "toolcall_start") {
      active.firstOutputMs = Math.max(0, performance.now() - active.startedMonoMs);
    }
  });

  pi.on("message_end", (event, ctx) => {
    if (!active || event.message.role !== "assistant") return;
    active.assistantMessages++;
    active.usage = addUsage(active.usage, messageUsage(event.message));
    render(ctx);
  });

  pi.on("tool_execution_start", (_event, ctx) => {
    if (!active) return;
    active.toolCalls++;
    render(ctx);
  });

  pi.on("agent_settled", (event, ctx) => {
    if (!active) return;
    stopTimer();
    const current = active;
    active = undefined;
    const elapsedMs = Math.max(0, performance.now() - current.startedMonoMs);
    const record: ExchangeRecord = {
      version: 1,
      startedAt: new Date(current.startedAtMs).toISOString(),
      endedAt: new Date().toISOString(),
      elapsedMs: Math.round(elapsedMs),
      model: current.model,
      usage: current.usage,
      assistantMessages: current.assistantMessages,
      toolCalls: current.toolCalls,
      aborted: event.aborted === true,
      ...(current.firstOutputMs === undefined ? {} : { firstOutputMs: Math.round(current.firstOutputMs) }),
    };
    pi.appendEntry(ENTRY_TYPE, record);
    scan(ctx);
    render(ctx);
  });

  pi.registerCommand("pi-style", {
    description: "Set appearance: cute | compact | off",
    handler: async (args, ctx) => {
      const next = args.trim().toLowerCase();
      if (next === "cute" || next === "compact" || next === "off") {
        appearance = next;
        render(ctx);
        ctx.ui.notify(`pi-style appearance: ${next}`, "info");
      } else {
        ctx.ui.notify("Usage: /pi-style cute | compact | off", "info");
      }
    },
  });

  pi.registerCommand("pi-usage", {
    description: "Toggle current branch token usage panel",
    handler: async (_args, ctx) => {
      panel = panel === "usage" ? "none" : "usage";
      scan(ctx);
      render(ctx);
      if (appearance === "off") ctx.ui.notify("Enable /pi-style cute or compact to show the panel", "info");
    },
  });

  pi.registerCommand("pi-history", {
    description: "Toggle latest five completed exchange timings",
    handler: async (_args, ctx) => {
      panel = panel === "history" ? "none" : "history";
      scan(ctx);
      render(ctx);
      if (appearance === "off") ctx.ui.notify("Enable /pi-style cute or compact to show the panel", "info");
    },
  });
}
