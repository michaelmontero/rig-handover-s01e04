import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { RunStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  // Per night: jobs by their last status. null = night unreadable.
  counts: Record<string, Record<RunStatus, number> | null>;
};

export function nightCounts(runsDir: string, night: string): Record<RunStatus, number> | null {
  const n = readNight(runsDir, night);
  if (!n.found) return null;
  const c: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  for (const row of n.rows) c[row.lastStatus]++;
  return c;
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    counts: Object.fromEntries(nights.map((n) => [n, nightCounts(config.runsDir, n)])),
  };
}
