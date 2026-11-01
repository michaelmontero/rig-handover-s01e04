import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const GOOD = '2026-10-28';
const EMPTY = '2026-10-29';
const BAD = '2026-10-30';
const MISSING = '2026-10-31';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// alpha: 3 retries then ok, owned. beta: one fail, null owner.
const goodNight = [
  line({ at: '2026-10-28T02:00:00+01:00', job: 'beta', status: 'fail', owner: null, error: 'boom' }),
  line({ at: '2026-10-28T02:01:00+01:00', job: 'alpha', status: 'retry', owner: 'ops' }),
  line({ at: '2026-10-28T02:02:00+01:00', job: 'alpha', status: 'retry', owner: 'ops' }),
  line({ at: '2026-10-28T02:03:00+01:00', job: 'alpha', status: 'retry', owner: 'ops' }),
  line({ at: '2026-10-28T02:04:00+01:00', job: 'alpha', status: 'ok', owner: 'ops' }),
].join('\n');

const badNight = [
  line({ at: '2026-10-30T02:00:00+01:00', job: 'alpha', status: 'ok', owner: 'ops' }),
  'this is not json',
  line({ at: '2026-10-30T02:05:00+01:00', job: 'beta', status: 'ok', owner: null }),
].join('\n');

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${GOOD}.jsonl`), goodNight + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badNight + '\n');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job rows from the rendered table: each row as its list of cell texts.
function pageRows(html: string): string[][] {
  const tbody = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]),
  );
}

describe('digest page /digest/:night', () => {
  it('200 with the job table for a good night', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`digest · ${GOOD}`);
    expect(pageRows(html).length).toBe(2);
  });

  it('renders a null owner as the dash', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const beta = pageRows(html).find((r) => r[0] === 'beta');
    expect(beta?.[1]).toBe('—');
    const alpha = pageRows(html).find((r) => r[0] === 'alpha');
    expect(alpha?.[1]).toBe('ops');
  });

  it('404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for this night');
  });

  it('empty night is 200 and says nothing ran', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('bad-line night is 200 and mentions the unreadable line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 line could not be read');
    expect(pageRows(html).length).toBe(2);
  });
});

describe('digest JSON /api/digest/:night', () => {
  it('200 with rows for a good night', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.find((r: { job: string }) => r.job === 'alpha')).toMatchObject({
      owner: 'ops',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
    });
    expect(body.rows.find((r: { job: string }) => r.job === 'beta')).toMatchObject({
      owner: null,
      lastStatus: 'fail',
      lastError: 'boom',
    });
  });

  it('lists the same jobs in the same order as the page', async () => {
    const json = await (await app.request(`/api/digest/${GOOD}`)).json();
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    expect(pageRows(html).map((r) => r[0])).toEqual(json.rows.map((r: { job: string }) => r.job));
  });

  it('404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: MISSING });
  });

  it('empty night is 200 with rows []', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, badLines: 0, rows: [] });
  });

  it('bad-line night is 200 with badLines 1 and the good rows kept', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['alpha', 'beta']);
  });
});
