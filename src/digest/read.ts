import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { at, job, status, owner, error } = v as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status: status as RunStatus, owner, error };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return { found: false, night };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return { found: false, night };
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const run = parseLine(raw);
    if (!run) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (!row) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    if (run.error !== undefined) row.lastError = run.error;
    row.owner = run.owner;
    row.lastAt = run.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { found: true, night, rows, badLines } satisfies Night;
};
