import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { dateSchema, idSchema } from '../../shared/schemas';
import { isDevLike, type AppBindings } from '../env';
import { all, newId, run } from '../lib/db';
import { forbidden, notFound } from '../lib/errors';
import { requireUser } from '../lib/session';
import { parseJson, parseParam } from '../lib/validate';
import { runDailyJobs } from '../jobs';

/** Operator accounts are configured by handle in ADMIN_HANDLES (comma separated). */
function requireOperator(c: Context<AppBindings>) {
  const user = requireUser(c);
  const admins = (c.env.ADMIN_HANDLES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!admins.includes(user.handle)) throw forbidden();
  return user;
}

export const adminRoutes = new Hono<AppBindings>();

adminRoutes.get('/pauses', async (c) => {
  requireOperator(c);
  const rows = await all(
    c.env.DB,
    `SELECT p.id, p.request_id AS requestId, p.reason, p.start_date AS startDate, p.end_date AS endDate, p.note, p.status
     FROM delay_pauses p WHERE p.status = 'pending' ORDER BY p.created_at LIMIT 200`,
  );
  return c.json({ pauses: rows });
});

/** 運営確認: approve or reject a creator force-majeure declaration. */
adminRoutes.post('/pauses/:id/review', async (c) => {
  requireOperator(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const { decision } = await parseJson(c, z.object({ decision: z.enum(['approved', 'rejected']) }));
  const n = await run(
    c.env.DB,
    "UPDATE delay_pauses SET status = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'",
    decision,
    id,
  );
  if (n === 0) throw notFound();
  return c.json({ ok: true });
});

/** Platform outage: stops reductions for every in-progress request over the period. */
adminRoutes.post('/outages', async (c) => {
  requireOperator(c);
  const b = await parseJson(
    c,
    z.object({
      startDate: dateSchema,
      endDate: dateSchema,
      note: z.string().max(1000).default(''),
    }),
  );
  const reqs = await all<{ id: string }>(
    c.env.DB,
    "SELECT id FROM requests WHERE status IN ('paid', 'delivered')",
  );
  for (const r of reqs) {
    await run(
      c.env.DB,
      "INSERT INTO delay_pauses (id, request_id, reason, start_date, end_date, note, status, reviewed_at) VALUES (?, ?, 'platform_outage', ?, ?, ?, 'approved', datetime('now'))",
      newId(),
      r.id,
      b.startDate,
      b.endDate,
      b.note,
    );
  }
  return c.json({ affected: reqs.length });
});

adminRoutes.get('/reports', async (c) => {
  requireOperator(c);
  const rows = await all(
    c.env.DB,
    "SELECT id, target_type AS targetType, target_id AS targetId, kind, details, status, created_at AS createdAt FROM reports WHERE status IN ('open','reviewing') ORDER BY created_at LIMIT 200",
  );
  return c.json({ reports: rows });
});

/** Development/test helper to run the daily Cron job for a given date. */
adminRoutes.post('/dev/run-daily', async (c) => {
  if (!isDevLike(c.env)) throw notFound();
  const { today } = await parseJson(c, z.object({ today: dateSchema }));
  return c.json(await runDailyJobs(c.env, today));
});

/** Development/test helper: moves a request's due date (simulates the passage of time in E2E). */
adminRoutes.post('/dev/due-date', async (c) => {
  if (!isDevLike(c.env)) throw notFound();
  const b = await parseJson(c, z.object({ requestId: idSchema, dueDate: dateSchema }));
  const n = await run(
    c.env.DB,
    'UPDATE requests SET due_date = ? WHERE id = ?',
    b.dueDate,
    b.requestId,
  );
  if (n === 0) throw notFound();
  return c.json({ ok: true });
});
