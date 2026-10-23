import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  footerText, headerLines, dashboardLines, filteredHistory, dailyTotals,
  type FooterState, type DashboardState,
} from "../src/ui-layout.ts";
import { emptyUsage, type ExchangeRecord } from "../src/metrics.ts";

const base: FooterState = {
  appearance: "cute", model:"some-very-long-gpt-model-name-1234567", branch:"feature/abc",
  usage:{input:2450,output:1520,cacheRead:16000,cacheWrite:320,cost:0.145},
  running:true,elapsedMs:63000,exchanges:10,otherStatuses:["other plugin"],
};

test("responsive status progressively loses ornaments and detail", () => {
  const narrow=footerText(28,base), medium=footerText(62,base),wide=footerText(180,base);
  assert.ok(narrow.includes("↑2.5k"));
  assert.ok(!narrow.includes("pi-style"));
  assert.ok(medium.includes("pi-style") && medium.includes("~$"));
  assert.ok(!medium.includes("cache"));
  assert.ok(wide.includes("cache") && wide.includes("feature/abc"));
  assert.ok(wide.includes("other plugin"));
  assert.equal(footerText(50,{...base,appearance:"off"}),"");
  assert.deepEqual(headerLines(20),[]);
  assert.equal(headerLines(44).length,2);
  assert.ok(headerLines(80).length>=3);
  assert.ok(headerLines(80).some(line=>line.includes("Border Collie")));
  assert.ok(headerLines(80).some(line=>line.includes("██")));
  assert.ok(headerLines(44).some(line=>line.includes("Border Collie")));
  assert.ok(!headerLines(80).join("\\n").includes("o.o"));
});

function sample(date:string,elapsedMs:number,output:number,aborted=false):ExchangeRecord {
 return {
  version:1, startedAt:date,endedAt:date,elapsedMs,model:"test",
  usage:{...emptyUsage(),output},assistantMessages:1,toolCalls:0,aborted,
 };
}
const a=sample("2026-10-21T12:00:00.000Z",9000,10,false);
const b=sample("2026-10-22T12:00:00.000Z",2000,70,true);
const c=sample("2026-10-22T15:00:00.000Z",3000,25,false);

test("interactive dashboard can sort, filter and group UTC daily records", () => {
  assert.deepEqual(filteredHistory([a,b,c],"all","recent"),[c,b,a]);
  assert.deepEqual(filteredHistory([a,b,c],"all","slowest"),[a,c,b]);
  assert.deepEqual(filteredHistory([a,b,c],"aborted","recent"),[b]);
  assert.deepEqual(filteredHistory([a,b,c],"all","tokens"),[b,c,a]);
  const daily=dailyTotals([a,b,c]);
  assert.equal(daily[0]![0],"2026-10-22");
  assert.equal(daily[0]![1].count,2);
  assert.equal(daily[0]![1].elapsedMs,5000);
  const state:DashboardState={tab:"overview",sort:"recent",filter:"all",page:0,usage:emptyUsage(),exchanges:[a,b,c],model:"test",contextPercent:12};
  assert.ok(dashboardLines(80,state).some(x=>x.includes("Exchanges  3")));
  assert.ok(dashboardLines(80,{...state,tab:"history",sort:"slowest",filter:"success"}).some(x=>x.includes("10-21")));
  assert.ok(dashboardLines(80,{...state,tab:"daily"}).some(x=>x.includes("2026-10-22")));
});
