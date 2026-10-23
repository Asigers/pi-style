import { strict as assert } from "node:assert";
import { test } from "node:test";
import { projectTotals, type IndexedExchange } from "../src/global-store.ts";
import { emptyUsage } from "../src/metrics.ts";

test("cross-session indexed records aggregate by project without prompts", () => {
  const rows: IndexedExchange[] = [
    { id:"a",project:"/app/a",sessionId:"1",version:1,startedAt:"2026-10-21T00:00:00Z",
      endedAt:"2026-10-21T00:00:10Z",elapsedMs:10000,model:"test",
      usage:{...emptyUsage(),output:100,cost:0.3},assistantMessages:1,toolCalls:0,aborted:false },
    { id:"b",project:"/app/a",sessionId:"2",version:1,startedAt:"2026-10-22T00:00:00Z",
      endedAt:"2026-10-22T00:00:05Z",elapsedMs:5000,model:"test",
      usage:{...emptyUsage(),output:200,cost:0.2},assistantMessages:1,toolCalls:0,aborted:false },
    { id:"c",project:"/app/b",sessionId:"3",version:1,startedAt:"2026-10-22T00:00:00Z",
      endedAt:"2026-10-22T00:00:03Z",elapsedMs:3000,model:"test",
      usage:{...emptyUsage(),output:10,cost:0.1},assistantMessages:1,toolCalls:0,aborted:false },
  ];
  const totals=projectTotals(rows);
  assert.equal(totals.length,2);
  assert.equal(totals[0]!.project,"/app/a");
  assert.equal(totals[0]!.count,2);
  assert.equal(totals[0]!.elapsedMs,15000);
  assert.equal(totals[0]!.usage.output,300);
  assert.equal(totals[0]!.usage.cost,0.5);
});
