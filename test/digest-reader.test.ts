import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28');
  if (!night.found) throw new Error('runs/2026-10-28.jsonl not found');

  it('reads 5 jobs sorted by job and counts the bad line', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('folds a job into one row, times keep their offset', () => {
    expect(night.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a null owner and a fail', () => {
    expect(night.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
    const backup = night.rows.find((r) => r.job === 'notes/backup');
    expect(backup?.lastStatus).toBe('fail');
    expect(backup?.lastError).toBe('quota exceeded');
  });

  describe('temp runs dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('an empty file is found with no rows', () => {
      writeFileSync(join(dir, '2026-10-30.jsonl'), '');
      expect(readNight(dir, '2026-10-30')).toEqual({ found: true, night: '2026-10-30', rows: [], badLines: 0 });
    });

    it('no file is not found', () => {
      expect(readNight(dir, '2026-10-31')).toEqual({ found: false, night: '2026-10-31' });
    });

    it('a night that is not a date is not found', () => {
      expect(readNight(dir, '../etc')).toEqual({ found: false, night: '../etc' });
    });
  });
});
