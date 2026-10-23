import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SessionStatsCache } from "../src/session-cache.ts";
import { branchUsage, entryUsage, subtractUsage, type Usage } from "../src/metrics.ts";
import createExtension from "../extensions/pi-style.ts";

const usage = (input:number, cost:number) => ({
  input, output:input*2, cacheRead:input*3, cacheWrite:input*4,
  cost:{total:cost},
});

test("matches upstream ledger for tool results, compactions, summaries and usage entries", () => {
  const entries = [
    {type:"message", message:{role:"assistant",usage:usage(1,0.1)}},
    {type:"message", message:{role:"toolResult",usage:usage(2,0.2)}},
    {type:"compaction",usage:usage(3,0.3)},
    {type:"branch_summary",usage:usage(4,0.4)},
    {type:"usage",usage:usage(5,0.5)},
    {type:"message",message:{role:"user",usage:usage(800,100)}},
    {type:"custom",customType:"pi-style.exchange",data:{usage:usage(400,30)}},
  ];
  const total = branchUsage(entries);
  assert.deepEqual(total, {input:15,output:30,cacheRead:45,cacheWrite:60,cost:1.5});
  assert.equal(entryUsage(entries.at(-1)).input,0);
  assert.deepEqual(subtractUsage(total,{input:12,output:24,cacheRead:36,cacheWrite:48,cost:1.2}),
    {input:3,output:6,cacheRead:9,cacheWrite:12,cost:0.30000000000000004});
});

test("cache uses leaf and session identity; no repeated history walk on redraw", () => {
  const history=[{type:"message",message:{role:"assistant",usage:usage(7,0.7)}}];
  let leaf="a",session="one",walks=0;
  const mock={getSessionId:()=>session,getLeafId:()=>leaf,getBranch:()=>{walks++;return history;}};
  const cache=new SessionStatsCache();
  for(let i=0;i<500;i++) assert.equal(cache.get(mock).usage.input,7);
  assert.equal(walks,1);
  leaf="b";cache.get(mock);assert.equal(walks,2);
  session="two";cache.get(mock);assert.equal(walks,3);
  cache.invalidate();cache.get(mock);assert.equal(walks,4);
});

test("real TUI UI API paths restore original theme without persisting settings", async () => {
  let currentTheme={name:"system"} as {name:string};
  const originalTheme=currentTheme;
  const forest={name:"pi-style-forest"};
  const writes:unknown[]=[];
  let footer:Function|undefined;
  let header:Function|undefined;
  let editor:Function|undefined;
  let getBranchCalls=0;
  const entries:unknown[]=[];
  const commands=new Map<string, {handler:Function}>();
  const events=new Map<string, Function>();
  const shownStatuses:unknown[]=[];
  let modalRenderCount=0;
  let redraws=0;
  let activeThinking="high";
  const fakeTui={requestRender:()=>{redraws++;}};
  const theme={
    fg:(_color:string, value:string)=>value,
    bg:(_color:string,value:string)=>value,
  };
  const ui={
    get theme(){return currentTheme;},
    getTheme:(name:string)=>name==="pi-style-forest"?forest:undefined,
    setTheme:(value:string|{name:string})=>{
      if(typeof value === "string") writes.push(value);
      else currentTheme=value;
      return {success:true};
    },
    setStatus:(_key:string,value?:string)=>shownStatuses.push(value),
    setWidget:()=>{},
    setFooter:(factory?:Function)=>{footer=factory;},
    setHeader:(factory?:Function)=>{header=factory;},
    getEditorComponent:()=>editor,
    setEditorComponent:(factory?:Function)=>{editor=factory;},
    getToolsExpanded:()=>false,
    setToolsExpanded:()=>{},
    notify:()=>{},
    custom:async(factory:Function)=>{
      await new Promise<void>((done)=>{
        const component=factory(fakeTui,theme,{},done);
        const rendered=component.render(80);
        assert.ok(rendered.join("\\n").includes("USAGE / OVERVIEW"));
        modalRenderCount++;
        component.handleInput("2");
        component.render(80);
        component.handleInput("q");
      });
    },
  };
  const ctx={
    mode:"tui",hasUI:true,cwd:"/test",model:{id:"test"},
    get thinkingLevel(){return activeThinking;},
    sessionManager:{
      getSessionId:()=> "test-session",getSessionName:()=> "性能排查",
      getLeafId:()=>String(entries.length),
      getEntryCount:()=>entries.length,
      getBranch:()=>{getBranchCalls++;return entries;},
    },
    getContextUsage:()=>({percent:1}),
    ui,
  };
  const pi={
    on:(name:string,handler:Function)=>events.set(name,handler),
    registerCommand:(name:string,command:{handler:Function})=>commands.set(name,command),
    appendEntry:(customType:string,data:unknown)=>{entries.push({type:"custom",customType,data});},
  };
  createExtension(pi as never);
  await events.get("session_start")!({},ctx);
  assert.equal(currentTheme,forest);
  assert.ok(footer && header && editor);
  assert.equal(writes.length,0,"in-memory theme must never write settings.json");
  const component=footer!(fakeTui,theme,{
    getExtensionStatuses:()=>new Map(),
    getGitBranch:()=> "main",
    onBranchChange:()=>()=>{},
  });
  const previousScans=getBranchCalls;
  for(let i=0;i<100;i++) component.render(100);
  assert.equal(getBranchCalls,previousScans,"footer must not rescan session per frame");
  assert.ok(component.render(100).join("").includes("THINK high"));
  const redrawsBeforeThinkingChange=redraws;
  activeThinking="xhigh";
  await events.get("thinking_level_select")!({level:"xhigh",previousLevel:"high"},ctx);
  assert.ok(redraws>redrawsBeforeThinkingChange,"thinking change must invalidate TUI footer");
  assert.ok(component.render(100).join("").includes("THINK xhigh"),"footer must reflect effective current level");
  await commands.get("pi-tui")!.handler("",ctx);
  assert.equal(modalRenderCount,1);
  await commands.get("pi-style")!.handler("off",ctx);
  assert.equal(currentTheme,originalTheme);
  assert.equal(footer,undefined);
  assert.equal(header,undefined);
  assert.equal(editor,undefined);
  assert.equal(writes.length,0);

  await commands.get("pi-style")!.handler("cute",ctx);
  assert.equal(currentTheme,forest);
  assert.equal(writes.length,0);
  await commands.get("pi-style")!.handler("theme",ctx);
  assert.equal(writes.length,0,"explicit theme command must not persist settings");
  // Upstream rebind calls applyFromSettings() AFTER extension session_start.
  // Verify the scheduled in-memory reapply wins without touching persisted settings.
  await events.get("session_start")!({reason:"resume"},ctx);
  currentTheme=originalTheme; // simulate Pi's trailing applyFromSettings()
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(currentTheme,forest,"theme is re-applied after resume");
  await commands.get("pi-style")!.handler("off",ctx);
  assert.equal(currentTheme,originalTheme,"turning off after resume restores original");
  assert.equal(writes.length,0);
  await events.get("session_shutdown")!({},ctx);
});

test("queued user messages produce separate timing records, with shared-run attribution", async () => {
  const handlers=new Map<string,Function>();
  const records:unknown[]=[];
  const entries:unknown[]=[];
  const ctx={
    hasUI:false,mode:"print",cwd:"/test",model:{id:"test"},
    sessionManager:{
      getSessionId:()=> "s",getSessionName:()=> undefined,
      getLeafId:()=>String(entries.length),
      getEntryCount:()=>entries.length,
      getBranch:()=>entries,
    },
  };
  const pi={
    on:(name:string,handler:Function)=>handlers.set(name,handler),
    registerCommand:()=>{},
    appendEntry:(kind:string,data:unknown)=>{records.push(data);entries.push({type:"custom",customType:kind,data});},
  };
  createExtension(pi as never);
  await handlers.get("session_start")!({},ctx);
  await handlers.get("before_agent_start")!({messageType:"user"},ctx);
  await handlers.get("message_start")!({message:{role:"user"}},ctx);
  entries.push({type:"message",message:{role:"assistant",usage:usage(2,0.2)}});
  await handlers.get("message_end")!({message:{role:"assistant",usage:usage(2,0.2)}},ctx);
  await handlers.get("message_start")!({message:{role:"user"}},ctx);
  entries.push({type:"message",message:{role:"assistant",usage:usage(3,0.3)}});
  await handlers.get("message_end")!({message:{role:"assistant",usage:usage(3,0.3)}},ctx);
  await handlers.get("agent_settled")!({aborted:false},ctx);
  assert.equal(records.length,2,"two user message events should create two records");
  const first=records[0] as {sharedRun:boolean;timingBasis:string;usage:Usage};
  const second=records[1] as {sharedRun:boolean;timingBasis:string;usage:Usage};
  assert.equal(first.sharedRun,true);
  assert.equal(second.sharedRun,true);
  assert.equal(first.timingBasis,"processing");
  assert.equal(first.usage.input,2);
  assert.equal(second.usage.input,3);
  assert.ok(first.usage.cost + second.usage.cost > 0.49);
});

test("reload does not warn while theme registry is unavailable, then restores Forest", async () => {
  const handlers = new Map<string, Function>();
  const commands = new Map<string, {handler:Function}>();
  const warnings:string[]=[];
  const original={name:"system"};
  const forest={name:"pi-style-forest"};
  let current=original;
  let themeReady=false;
  const data:unknown[]=[];
  const ui={
    get theme(){return current;},
    getTheme:(name:string)=>themeReady && name==="pi-style-forest" ? forest : undefined,
    setTheme:(value: {name:string}|string)=>{
      assert.equal(typeof value, "object","theme change must not persist user selection");
      current = value as {name:string};
      return {success:true};
    },
    setStatus:()=>{},setWidget:()=>{},setFooter:()=>{},setHeader:()=>{},
    getEditorComponent:()=>undefined,setEditorComponent:()=>{},
    getToolsExpanded:()=>true,setToolsExpanded:()=>{},
    notify:(msg:string)=>warnings.push(msg),
  };
  const ctx={
    hasUI:true,mode:"tui",cwd:"/test",model:{id:"test",provider:"canway"},
    sessionManager:{getSessionId:()=>"test",getSessionName:()=> undefined,getLeafId:()=>null,getBranch:()=>data},
    getContextUsage:()=>({percent:23.7,tokens:121500,contextWindow:512000}),
    ui,
  };
  const pi={
    on:(name:string,fn:Function)=>handlers.set(name,fn),
    registerCommand:(name:string,cmd:{handler:Function})=>commands.set(name,cmd),
    appendEntry:()=>{},
  };
  createExtension(pi as never);
  // Pi has not yet called setRegisteredThemes when extension session_start runs.
  await handlers.get("session_start")!({reason:"reload"},ctx);
  assert.equal(current,original);
  assert.equal(warnings.length,0,"must not warn before registration");

  // Simulate theme availability after one retry, plus a late applyFromSettings.
  await new Promise(resolve=>setTimeout(resolve,25));
  themeReady=true;
  current=original;
  await new Promise(resolve=>setTimeout(resolve,110));
  assert.equal(current,forest);
  assert.ok(!warnings.some(x=>x.includes("theme unavailable")));
  await commands.get("pi-style")!.handler("off",ctx);
  assert.equal(current,original,"off must restore original theme");
  await handlers.get("session_shutdown")!({},ctx);
});

test("tool result decoration preserves native content, duration and fallback", () => {
  let resolver: Function | undefined;
  const pi={
    on:()=>{},
    registerCommand:()=>{},
    registerToolRenderer:(fn:Function)=>{resolver=fn;},
  };
  createExtension(pi as never);
  assert.ok(resolver);
  const native={
    renderResult:()=>({
      invalidate:()=>{},
      render:(_width:number)=>["NATIVE OUTPUT", "original expansion controls"],
    }),
  };
  const wrapped=resolver!("bash",()=>native);
  assert.notEqual(wrapped,native);
  const comp=wrapped.renderResult({}, {expanded:true,isPartial:false},
    {fg:(_color:string,text:string)=>text},
    {durationMs:1200,isError:false});
  const lines=comp.render(100);
  assert.ok(lines[0].includes("BASH"));
  assert.ok(lines[0].includes("1.2s"));
  assert.ok(lines.includes("NATIVE OUTPUT"));
  assert.ok(lines.includes("original expansion controls"));
  assert.equal(resolver!("custom-tool",()=>native),native,"non-built-in renderers untouched");
});
