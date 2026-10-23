// Simulates the Pi event contract without loading the host application.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import createExtension from "../extensions/pi-style.ts";

test("records one settled exchange including usage and timing, and restores history", async () => {
  const events = new Map<string, Function>();
  const commands = new Map<string, { handler: Function }>();
  const entries: unknown[] = [];
  const statuses: Array<string | undefined> = [];
  const widgets: unknown[] = [];

  let getBranchCalls = 0;
  const ctx = {
    hasUI: true,
    mode: "rpc",
    model: { id: "test-model" },
    sessionManager: {
      getSessionId: () => "test-session",
      getSessionName: () => "性能排查",
      getLeafId: () => String(entries.length),
      getEntryCount: () => entries.length,
      getBranch: () => { getBranchCalls++; return entries; },
    },
    getContextUsage: () => ({ percent: 25 }),
    ui: {
      setStatus: (_key: string, value?: string) => statuses.push(value),
      setWidget: (_key: string, lines?: unknown) => widgets.push(lines),
      notify: () => {},
    },
  };

  const pi = {
    on: (name: string, cb: Function) => events.set(name, cb),
    registerCommand: (name: string, def: { handler: Function }) => commands.set(name, def),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
  };

  createExtension(pi as never);
  const send = async (name: string, event: unknown = {}) => {
    const handler = events.get(name);
    assert.ok(handler, `handler: ${name}`);
    await handler(event, ctx);
  };
  await send("session_start");
  await send("before_agent_start", { messageType: "user" });
  await send("message_update", { assistantMessageEvent: { type: "text_delta", delta: "ok" } });
  await send("tool_execution_start");
  const msg = {
    role: "assistant",
    usage: { input: 12, output: 7, cacheRead: 30, cacheWrite: 5, cost: { total: 0.04 } },
  };
  entries.push({ type: "message", message: msg });
  await send("message_end", { message: msg });
  await send("agent_settled", { aborted: false });

  const saved = entries.find((e: any) => e.type === "custom") as any;
  assert.ok(saved, "record was persisted in session");
  assert.equal(saved.customType, "pi-style.exchange");
  assert.equal(saved.data.usage.input, 12);
  assert.equal(saved.data.usage.cacheRead, 30);
  assert.equal(saved.data.usage.cost, 0.04);
  assert.equal(saved.data.assistantMessages, 1);
  assert.equal(saved.data.toolCalls, 1);
  assert.ok(saved.data.elapsedMs >= 0);
  assert.ok(saved.data.firstOutputMs >= 0);
  assert.ok(statuses.at(-1)?.includes("test-model"));
  assert.equal(saved.data.timingBasis, "agent-start");

  await commands.get("pi-history")!.handler("", ctx);
  assert.ok(Array.isArray(widgets.at(-1)));
  assert.ok((widgets.at(-1) as string[]).some((line) => line.includes("test-model")));

  await send("session_start", { reason: "resume" });
  await commands.get("pi-usage")!.handler("", ctx);
  assert.ok(statuses.at(-1)?.includes("↑12"));

  const callsBefore = getBranchCalls;
  await commands.get("pi-usage")!.handler("", ctx);
  await commands.get("pi-usage")!.handler("", ctx);
  assert.equal(getBranchCalls, callsBefore, "unchanged session cache should avoid getBranch rescans");

  await commands.get("pi-style")!.handler("off", ctx);
  assert.equal(statuses.at(-1), undefined);
  await send("session_shutdown");
});

test("custom extension-initiated runs are not counted as user requests", async () => {
  const handlers = new Map<string, Function>();
  const records: unknown[] = [];
  const pi = {
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerCommand: () => {},
    appendEntry: (...args: unknown[]) => records.push(args),
  };
  createExtension(pi as never);
  const ctx = {
    hasUI: false,
    model: { id: "test" },
    sessionManager: {getSessionId: () => "x", getSessionName: () => undefined, getLeafId: () => null, getEntryCount: () => 0, getBranch: () => []},
  };
  await handlers.get("session_start")!({}, ctx);
  await handlers.get("before_agent_start")!({ messageType: "custom" }, ctx);
  await handlers.get("agent_settled")!({ aborted: false }, ctx);
  assert.equal(records.length, 0);
});
