/** Observed phase timing from Pi events. No prompts, tool args or outputs are stored. */
export type Phase = "llm" | "tool";
export interface TimedOperation {
  phase: Phase;
  name: string;
  durationMs: number;
}
interface Span { phase: Phase; name: string; start: number; end: number }
interface ActiveTool { start: number; name: string }

export interface PhaseSnapshot {
  llmWallMs: number;
  toolWallMs: number;
  otherWallMs: number;
  llmCalls: number;
  toolExecutions: number;
  slowOps: TimedOperation[];
}

/** The LLM interval begins at turn_start (including local preparation).
 * It is not a raw provider network latency measurement. Tool wall is a union
 * of active tool intervals, including nested and concurrent tools. */
export class TimingLedger {
  private spans: Span[] = [];
  private modelStart: number | undefined;
  private activeTools = new Map<string, ActiveTool>();
  private modelCounter = 0;

  startLLM(at: number) {
    this.endLLM(at);
    this.modelStart = at;
  }

  endLLM(at: number) {
    if(this.modelStart !== undefined && at >= this.modelStart) {
      this.modelCounter++;
      this.spans.push({phase:"llm",name:"LLM #" + this.modelCounter,start:this.modelStart,end:at});
    }
    this.modelStart = undefined;
  }

  startTool(id: string, name: string, at: number) {
    if(this.activeTools.has(id)) this.endTool(id,at);
    this.activeTools.set(id,{start:at,name:name || "tool"});
  }

  endTool(id: string, at: number) {
    const op=this.activeTools.get(id);
    if(!op) return;
    this.activeTools.delete(id);
    if(at>=op.start) this.spans.push({phase:"tool",name:op.name,start:op.start,end:at});
  }

  /** Snapshots do not mutate active intervals; safe during live rendering. */
  snapshot(start: number, end: number): PhaseSnapshot {
    const upper=Math.max(end,start);
    const raw=this.spans.concat(
      this.modelStart===undefined ? [] : [{phase:"llm" as const,name:"LLM (running)",start:this.modelStart,end:upper}],
      [...this.activeTools.values()].map(op=>({phase:"tool" as const,name:op.name,start:op.start,end:upper})),
    );
    const clipped=raw.map(op=>({
      ...op,start:Math.max(start,op.start),end:Math.min(upper,op.end),
    })).filter(op=>op.end>op.start);
    const events: Array<{t:number;phase:Phase;delta:number}>=[];
    for(const op of clipped) {
      events.push({t:op.start,phase:op.phase,delta:1},{t:op.end,phase:op.phase,delta:-1});
    }
    events.sort((a,b)=>a.t-b.t);
    let llmActive=0,toolActive=0,previous=start,llm=0,tool=0;
    let i=0;
    while(i<events.length) {
      const t=events[i]!.t;
      const duration=Math.max(0,t-previous);
      if(toolActive>0) tool+=duration;
      else if(llmActive>0) llm+=duration;
      while(i<events.length && events[i]!.t===t) {
        const event=events[i++]!;
        if(event.phase==="tool")toolActive+=event.delta;
        else llmActive+=event.delta;
      }
      previous=t;
    }
    const elapsed=upper-start;
    return {
      llmWallMs:Math.round(llm),toolWallMs:Math.round(tool),
      otherWallMs:Math.round(Math.max(0,elapsed-llm-tool)),
      llmCalls:clipped.filter(op=>op.phase==="llm").length,
      toolExecutions:clipped.filter(op=>op.phase==="tool").length,
      slowOps:clipped.map(op=>({phase:op.phase,name:op.name,durationMs:Math.round(op.end-op.start)}))
        .sort((a,b)=>b.durationMs-a.durationMs).slice(0,5),
    };
  }

  reset() {
    this.spans=[];
    this.activeTools.clear();
    this.modelStart=undefined;
    this.modelCounter=0;
  }

  getRunningLabel(): string | undefined {
    const last=[...this.activeTools.values()].at(-1);
    return last ? "TOOL " + last.name : this.modelStart!==undefined ? "LLM" : undefined;
  }
}
