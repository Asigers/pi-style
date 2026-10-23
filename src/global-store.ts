/** Optional opt-in cross-session metrics index. No prompt text is ever stored. */
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { addUsage, emptyUsage, type ExchangeRecord, type Usage } from "./metrics.ts";

const DATA_DIR = join(homedir(), ".pi", "agent", "pi-style");
const DATA_PATH = join(DATA_DIR, "usage.jsonl");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");
export type IndexedExchange = ExchangeRecord & { id: string; project: string; sessionId: string };

export async function globalEnabled(): Promise<boolean> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf8")).global === true;
  } catch { return false; }
}
export async function setGlobalEnabled(enabled: boolean): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await writeFile(SETTINGS_PATH, JSON.stringify({ global: enabled }, null, 2) + "\n", { mode: 0o600 });
}
export async function appendIndexedExchange(record: IndexedExchange): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await appendFile(DATA_PATH, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
}
export async function readIndexedExchanges(): Promise<IndexedExchange[]> {
  let text: string;
  try { text = await readFile(DATA_PATH, "utf8"); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const indexed = new Map<string, IndexedExchange>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as IndexedExchange;
      if (item.version !== 1 || typeof item.id !== "string" || typeof item.project !== "string" ||
        typeof item.sessionId !== "string" || typeof item.elapsedMs !== "number" ||
        typeof item.startedAt !== "string" || !item.usage) continue;
      // Skip duplicates after restoring a backed-up index.
      indexed.set(item.id, item);
    } catch { /* tolerate one truncated last line */ }
  }
  return [...indexed.values()];
}
export function projectTotals(items: IndexedExchange[]): Array<{project:string; count:number; elapsedMs:number; usage:Usage}> {
  const index = new Map<string,{count:number;elapsedMs:number;usage:Usage}>();
  for(const item of items) {
    const current = index.get(item.project) ?? { count:0, elapsedMs:0, usage:emptyUsage() };
    current.count++;
    current.elapsedMs += item.elapsedMs;
    current.usage = addUsage(current.usage,item.usage);
    index.set(item.project,current);
  }
  return [...index.entries()].map(([project,value])=>({project,...value})).sort((a,b)=>b.elapsedMs-a.elapsedMs);
}
export async function exportMetricsJson(items: IndexedExchange[]): Promise<string> {
  await mkdir(DATA_DIR, {recursive:true, mode:0o700});
  const now = new Date().toISOString().replace(/[:.]/g,"-");
  const file = join(DATA_DIR, `export-${now}.json`);
  await writeFile(file, JSON.stringify({exportedAt:new Date().toISOString(),exchanges:items},null,2)+"\n",{mode:0o600});
  return file;
}
