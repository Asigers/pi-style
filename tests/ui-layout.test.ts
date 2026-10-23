import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  footerText, footerLines, headerLines, dashboardLines, dashboardLineColor, filteredHistory, dailyTotals,
  type FooterState, type DashboardState,
} from "../src/ui-layout.ts";
import { emptyUsage, type ExchangeRecord } from "../src/metrics.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

const base: FooterState = {
  appearance:"cute", provider:"newapi", model:"gpt-6-long-context",thinkingLevel:"high", 
  contextPercent:42, contextTokens:84000, contextWindow:200000,
  usage:{input:128000,output:18600,cacheRead:16000,cacheWrite:320,cost:0.145},
  running:true,elapsedMs:84000,
};

test("width-aware context-first footer keeps provider and model, removing low-priority data", () => {
  for(const width of [120,100,80,60,45,40,32,28,18]) {
    const lines=footerLines(width,base);
    assert.ok(lines.length>=1 && lines.length<=2);
    assert.ok(lines.some(x=>x.includes("CTX")),"mandatory context missing at "+width);
    assert.ok(lines.some(x=>x.includes("newapi")),"provider missing at "+width);
    if(width>=18) assert.ok(lines.some(x=>x.includes("gpt-6")),"model missing at "+width);
    for(const line of lines) assert.ok(visibleWidth(line)<=width, `overflow at ${width}: ${line}`);
    assert.ok(!lines.join("").includes("pi-style"));
    assert.ok(!/[♡♥]/.test(lines.join("")));
  }
  assert.equal(footerLines(120,base).length,1);
  assert.ok(footerLines(120,base)[0]?.includes("42.0% 84k/200k"));
  assert.ok(footerLines(120,base)[0]?.includes("THINK high"));
  assert.ok(!footerLines(120,base).join("").includes("↑"));
  assert.ok(!footerLines(120,base).join("").includes("↓"));
  assert.ok(footerLines(120,base)[0]?.includes("01:24"));
  assert.ok(footerLines(120,base)[0]?.includes("~$0.145"));
  assert.equal(footerLines(40,base).length,2);
  assert.ok(!footerLines(40,base).join("").includes("~$"));
  assert.equal(footerText(120,{...base,appearance:"off"}),"");
  assert.deepEqual(footerLines(120,{...base,appearance:"off"}),[]);
});

test("unknown or post-compaction context never claims 0%", () => {
  const lines=footerLines(120,{...base,contextPercent:null,contextTokens:null});
  assert.ok(lines[0]?.includes("CTX --%"));
  assert.ok(!lines.join("").includes("CTX 0.0%"));
  assert.ok(lines.join(" ").includes("newapi/gpt-6-long-context"));
});

test("long provider/model and CJK names safely fit into at most two lines", () => {
  const state={...base,provider:"custom-newapi-provider",model:"gpt-6-long-context-experimental-with-very-extended-id"};
  for(const width of [40,60,80]) {
    const lines=footerLines(width,state);
    assert.ok(lines.length<=2);
    for(const line of lines) assert.ok(visibleWidth(line)<=width);
    assert.ok(lines.join("").includes("CTX"));
    assert.ok(lines.join("").includes("custom-newapi-provider"));
    assert.ok(lines.join("").includes("gpt-6"));
  }
  const cjk=footerLines(40,{...base,provider:"自建网关",model:"模型-六-长上下文"});
  assert.ok(cjk.every(x=>visibleWidth(x)<=40));
  assert.ok(cjk.join("").includes("自建网关"));
  assert.ok(cjk.join("").includes("模型-六"));
});

test("border collie header has no heart symbols", () => {
  assert.deepEqual(headerLines(20),[]);
  assert.equal(headerLines(44).length,2);
  assert.ok(headerLines(80).some(line=>line.includes("Border Collie")));
  assert.ok(headerLines(80).some(line=>line.includes("██")));
  assert.ok(!/[♡♥]/.test(headerLines(80).join("")));
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
  const state:DashboardState={tab:"overview",sort:"recent",filter:"all",page:0,usage:emptyUsage(),exchanges:[a,b,c],provider:"canway",model:"test",contextPercent:12.37,contextTokens:63000,contextWindow:512000};
  assert.ok(dashboardLines(80,state).some(x=>x.includes("Exchanges 3")));
  assert.ok(dashboardLines(80,{...state,tab:"history",sort:"slowest",filter:"success"}).some(x=>x.includes("10-21")));
  assert.ok(dashboardLines(80,{...state,tab:"daily"}).some(x=>x.includes("2026-10-22")));
});

test("overview groups key data and renders accurate context and provider at terminal widths", () => {
  const st: DashboardState = {
    tab:"overview", sort:"recent", filter:"all", page:0,
    usage:{input:2586758,output:48601,cacheRead:1567488,cacheWrite:0,cost:2.5905},
    exchanges:[], contextPercent:23.7,contextTokens:121500,contextWindow:512000,
    provider:"canway", model:"gpt-6.1-sol",
  };
  for(const width of [120, 90, 78, 70, 55, 40, 24]){
    const lines=dashboardLines(width,st);
    assert.ok(lines.some(x=>x.includes("23.7%")),`context missing at ${width}`);
    assert.ok(lines.some(x=>x.includes("canway")),`provider missing at ${width}`);
    assert.ok(lines.some(x=>x.includes("2,586,758")) || width<29,
      `input missing at ${width}`);
    assert.ok(lines.some(x=>x.includes("No timing records")) || width < 19);
    assert.ok(lines.every(line=>visibleWidth(line)<=width),
      `overflow at ${width}`);
    assert.ok(!lines.some(line=>line.includes("Wall time  0s")));
    assert.equal(lines[0],"USAGE / OVERVIEW");
  }
  assert.ok(dashboardLines(120,st).some(x=>x.includes("MODEL / PROVIDER")));
  assert.ok(dashboardLines(40,st).some(x=>x==="MODEL / PROVIDER"));
  assert.equal(dashboardLineColor("SESSION TIMING", 5),"accent");
  assert.equal(dashboardLineColor("No timing records for this branch.", 5),"warning");
});

test("missing post-compaction context is explicitly unknown", () => {
 const state:DashboardState={
   tab:"overview",sort:"recent",filter:"all",page:0,
   usage:emptyUsage(),exchanges:[],contextPercent:null,
   contextTokens:null,contextWindow:512000,provider:"canway",model:"gpt-6",
 };
 assert.ok(dashboardLines(100,state).some(x=>x.includes("--%")));
 assert.ok(!dashboardLines(100,state).some(x=>x.includes("0.0%")));
});

test("session title replaces token counters without hiding required context and identity", () => {
  const named={...base,sessionTitle:"修复 Django 慢查询"};
  for (const width of [120,100,80,65,55,45,40,28]) {
    const lines=footerLines(width,named);
    assert.ok(lines.length<=2 && lines.length>=1);
    assert.ok(lines.some(line=>line.includes("CTX")));
    assert.ok(lines.some(line=>line.includes("newapi")));
    assert.ok(lines.some(line=>line.includes("gpt-6")));
    assert.ok(lines.every(line=>visibleWidth(line)<=width));
    assert.ok(!lines.some(line=>/[↑↓]/.test(line)), "no cumulative token arrows in footer");
  }
  assert.ok(footerLines(120,named).join("").includes("修复 Django 慢查询"));
  assert.ok(footerLines(65,named).join("").includes("修复 Django 慢查询"));
  assert.ok(footerLines(80,named).length<=2);
  assert.ok(footerLines(120,{...base,sessionTitle:undefined})
    .join("").includes("newapi/gpt-6-long-context"));
  assert.ok(!footerLines(120,{...base,sessionTitle:undefined}).join("").includes("SESSION"));
});

test("long /name sessions sanitize control sequences and truncate to 36 terminal cells", () => {
  const title="修复异常-精确定位重试与用户输入法问题-继续确认Provider模型集成";
  const lines=footerLines(110,{...base,sessionTitle:title});
  assert.ok(lines.length<=2);
  assert.ok(lines.some(line=>line.includes("修复异常")));
  assert.ok(lines.every(line=>visibleWidth(line)<=110));
  assert.ok(!footerLines(120,{...base,sessionTitle:"    "}).some(line=>line.includes("SESSION")));
  const control=footerLines(120,{...base,sessionTitle:"恶意" + String.fromCharCode(27) + "[31m标题\n下一行"});
  assert.ok(!control.join("").includes(String.fromCharCode(27)));
  assert.ok(control.every(line=>visibleWidth(line)<=120));
});

test("thinking level is core status alongside context, provider and model", () => {
  for (const thinkingLevel of ["off","minimal","low","medium","high","xhigh","max"]) {
    const state={...base,thinkingLevel};
    for(const width of [120,95,75,60,45,40,32,28]) {
      const lines=footerLines(width,state);
      assert.ok(lines.some(line=>line.includes("CTX")),`no context at ${width}`);
      assert.ok(lines.some(line=>line.includes("newapi")),`no provider at ${width}`);
      assert.ok(lines.some(line=>line.includes("gpt-6")),`no model at ${width}`);
      assert.ok(lines.some(line=>line.includes("THINK "+thinkingLevel)),`no thinking at ${width} for ${thinkingLevel}`);
      assert.ok(lines.every(line=>visibleWidth(line)<=width),`overflow at ${width}`);
      assert.ok(lines.length<=2);
      assert.ok(!lines.join("").includes("↑"));
    }
  }
  assert.ok(footerLines(120,{...base,thinkingLevel:undefined}).some(x=>x.includes("THINK --")));
});
test("thinking takes priority over named-session decoration and cost on narrow widths", () => {
  const lines=footerLines(40,{...base,sessionTitle:"修复生产MySQL性能问题",thinkingLevel:"xhigh"});
  assert.equal(lines.length,2);
  assert.ok(lines.some(x=>x.includes("THINK xhigh")));
  assert.ok(lines.some(x=>x.includes("newapi/gpt-6")));
  assert.ok(lines.every(x=>visibleWidth(x)<=40));
  assert.ok(!lines.join("").includes("~$"));
});

test("Performance view partitions LLM/tool/other time and labels slow operations", () => {
 const perf={...sample("2026-10-23T08:00:00.000Z",100000,120),
   llmWallMs:56000,toolWallMs:31000,otherWallMs:13000,
   llmCalls:3,toolExecutions:4,firstOutputMs:1700,
   slowOps:[{phase:"llm" as const,name:"LLM #2",durationMs:28300},
            {phase:"tool" as const,name:"bash",durationMs:20600}]};
 const state:DashboardState={tab:"performance",sort:"recent",filter:"all",
   page:0,usage:emptyUsage(),exchanges:[perf],model:"test",provider:"canway"};
 for(const width of [120,80,70,40,24]) {
   const lines=dashboardLines(width,state);
   assert.ok(lines[0]?.includes("USAGE / PERFORMANCE"));
   assert.ok(lines.some(x=>x.includes("LLM")));
   assert.ok(lines.some(x=>x.includes("TOOLS")));
   assert.ok(lines.every(x=>visibleWidth(x)<=width));
 }
 const long=dashboardLines(100,state).join("\n");
 for(const expected of ["56.0s","31.0s","13.0s","LLM #2","bash"])
   assert.ok(long.includes(expected),expected);
});

test("historical entries do not claim phase durations", () => {
 const state:DashboardState={tab:"performance",sort:"recent",filter:"all",
   page:0,usage:emptyUsage(),exchanges:[sample("2026-10-21T11:00:00.000Z",1000,4)],
   provider:"test",model:"test"};
 assert.ok(dashboardLines(80,state).some(x=>x.includes("No phase timings")));
});
