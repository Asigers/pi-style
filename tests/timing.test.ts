import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TimingLedger } from "../src/timing.ts";

test("LLM and overlapping nested tools partition wall time without double counting", () => {
  const clock=new TimingLedger();
  clock.startLLM(0);
  clock.endLLM(40);
  clock.startTool("outer","bash",30);
  clock.startTool("nested","read",40);
  clock.startTool("parallel","grep",45);
  clock.endTool("nested",50);
  clock.endTool("outer",60);
  clock.endTool("parallel",70);
  clock.startLLM(70);
  clock.endLLM(90);
  const all=clock.snapshot(0,100);
  assert.equal(all.llmWallMs,50);
  assert.equal(all.toolWallMs,40);
  assert.equal(all.otherWallMs,10);
  assert.equal(all.llmCalls,2);
  assert.equal(all.toolExecutions,3);
  assert.equal(all.llmWallMs+all.toolWallMs+all.otherWallMs,100);
  assert.equal(all.slowOps[0]?.name,"LLM #1");
  const first=clock.snapshot(0,50);
  const second=clock.snapshot(50,100);
  assert.deepEqual([first.llmWallMs,first.toolWallMs,first.otherWallMs],[30,20,0]);
  assert.deepEqual([second.llmWallMs,second.toolWallMs,second.otherWallMs],[20,20,10]);
});

test("live snapshots include unfinished LLM/tool phases without mutation", () => {
  const clock=new TimingLedger();
  clock.startLLM(10);
  clock.startTool("a","bash",30);
  const one=clock.snapshot(0,50);
  assert.deepEqual([one.llmWallMs,one.toolWallMs,one.otherWallMs],[20,20,10]);
  assert.equal(clock.getRunningLabel(),"TOOL bash");
  clock.endTool("a",60);
  clock.endLLM(80);
  assert.equal(clock.getRunningLabel(),undefined);
  const final=clock.snapshot(0,100);
  assert.equal(final.llmWallMs,40);
  assert.equal(final.toolWallMs,30);
  assert.equal(final.otherWallMs,30);
  clock.reset();
  assert.deepEqual([clock.snapshot(0,100).llmWallMs,clock.snapshot(0,100).toolWallMs],[0,0]);
});

test("tool names are kept, never tool argument content", () => {
  const clock=new TimingLedger();
  clock.startTool("opaque-id","bash",10);
  clock.endTool("opaque-id",20);
  const result=clock.snapshot(0,30);
  assert.deepEqual(result.slowOps,[{phase:"tool",name:"bash",durationMs:10}]);
  assert.ok(!JSON.stringify(result).includes("opaque-id"));
});
