import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ENTRY_TYPE, addUsage, branchExchanges, branchUsage, emptyUsage,
  fmtDuration, fmtTokens, messageUsage,
} from "../src/metrics.ts";

test("empty and malformed assistant usage is safe", () => {
  assert.deepEqual(messageUsage(null), emptyUsage());
  assert.deepEqual(messageUsage({role:"user",usage:{input:12}}), emptyUsage());
  assert.deepEqual(messageUsage({role:"assistant",usage:{input:-1,output:2,cacheRead:NaN,cost:{total:Infinity}}}),
    {input:0,output:2,cacheRead:0,cacheWrite:0,cost:0});
});

test("model usage separates cache from direct input/output", () => {
  const one = messageUsage({role:"assistant",usage:{input:5,output:3,cacheRead:100,cacheWrite:2,cost:{total:0.03}}});
  const two = messageUsage({role:"assistant",usage:{input:2,output:4,cacheRead:40,cacheWrite:0,cost:{total:0.02}}});
  assert.deepEqual(addUsage(one,two), {input:7,output:7,cacheRead:140,cacheWrite:2,cost:0.05});
});

test("branch metrics exclude other roles and abandoned tree entries", () => {
  const entries = [
    {type:"message",message:{role:"user",usage:{input:999}}},
    {type:"message",message:{role:"assistant",usage:{input:4,output:3,cost:{total:0.01}}}},
    {type:"custom",customType:ENTRY_TYPE,data:{}},
  ];
  assert.equal(branchUsage(entries).input,4);
  assert.equal(branchUsage(entries).output,3);
});

test("only valid persisted exchange records are displayed", () => {
  const data = {version:1,startedAt:"2026-10-23T00:00:00.000Z",endedAt:"2026-10-23T00:00:10.000Z",elapsedMs:10000,model:"test",usage:emptyUsage(),assistantMessages:2,toolCalls:3,aborted:false};
  assert.deepEqual(branchExchanges([
    {type:"custom",customType:ENTRY_TYPE,data},
    {type:"custom",customType:ENTRY_TYPE,data:{...data,elapsedMs:-100}},
    {type:"custom",customType:"some-other-extension",data},
  ]),[data]);
});

test("duration and token formatting", () => {
  assert.equal(fmtDuration(999), "0s");
  assert.equal(fmtDuration(69000), "1m 9s");
  assert.equal(fmtDuration(3_661_000), "1h 1m");
  assert.equal(fmtTokens(1000), "1.0k");
  assert.equal(fmtTokens(1_200_000), "1.20m");
});
