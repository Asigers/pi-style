import { branchUsage, branchExchanges, type ExchangeRecord, type Usage } from "./metrics.ts";

export interface BranchSessionSource {
  getSessionId(): string;
  getLeafId(): string | null;
  getEntryCount(): number;
  getBranch(): unknown[];
}

export interface BranchSnapshot {
  usage: Usage;
  exchanges: ExchangeRecord[];
}

/** Per-session/leaf cache, no per-frame history walk. */
export class SessionStatsCache {
  private key: string | undefined;
  private value: BranchSnapshot | undefined;

  get(session: BranchSessionSource): BranchSnapshot {
    const key = JSON.stringify([session.getSessionId(), session.getLeafId(), session.getEntryCount()]);
    if(this.key === key && this.value) return this.value;
    const entries=session.getBranch();
    const value={usage:branchUsage(entries),exchanges:branchExchanges(entries)};
    this.key=key;
    this.value=value;
    return value;
  }

  invalidate() {
    this.key=undefined;
    this.value=undefined;
  }
}
