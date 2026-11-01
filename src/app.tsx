import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestMissing, DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const night = readNight(config.runsDir, c.req.param('night'));
    if (!night.found) return c.json({ error: 'no such night', night: night.night }, 404);
    return c.json({ night: night.night, badLines: night.badLines, rows: night.rows });
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = readNight(config.runsDir, c.req.param('night'));
    const body = night.found ? (
      <DigestPage night={night.night} rows={night.rows} badLines={night.badLines} />
    ) : (
      <DigestMissing night={night.night} />
    );
    return c.html(<Layout title={`digest ${night.night}`} lane={lane()}>{body}</Layout>, night.found ? 200 : 404);
  });

  return app;
}
