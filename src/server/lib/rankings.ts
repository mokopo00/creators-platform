import { addDays } from '../../shared/delay';
import { FIELDS } from '../../shared/constants';
import { all, run } from './db';

const PERIODS = { weekly: 7, monthly: 30 } as const;
const TOP_N = 50;

/**
 * Daily Cron job: aggregates views and saves per post over the last 7/30 days
 * into the `rankings` table for scopes `all`, `field:<field>` and `tag:<tag>`.
 */
export async function computeRankings(db: D1Database, today: string) {
  const computedAt = new Date().toISOString();
  let rows = 0;
  for (const [period, days] of Object.entries(PERIODS) as [keyof typeof PERIODS, number][]) {
    const from = addDays(today, -(days - 1));
    await run(db, 'DELETE FROM rankings WHERE period = ?', period);
    const scored = `
      SELECT s.post_id, SUM(s.views) + SUM(s.saves) * 3 AS score
      FROM post_daily_stats s JOIN posts p ON p.id = s.post_id
      JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL
      WHERE s.day BETWEEN ? AND ?`;
    const insert = async (scope: string, extraWhere: string, ...params: unknown[]) => {
      const top = await all<{ post_id: string; score: number }>(
        db,
        `${scored} ${extraWhere} GROUP BY s.post_id HAVING score > 0 ORDER BY score DESC, s.post_id LIMIT ${TOP_N}`,
        from,
        today,
        ...params,
      );
      let rank = 0;
      for (const t of top) {
        await run(
          db,
          'INSERT INTO rankings (period, scope, post_id, score, rank, computed_at) VALUES (?, ?, ?, ?, ?, ?)',
          period,
          scope,
          t.post_id,
          t.score,
          ++rank,
          computedAt,
        );
        rows++;
      }
    };
    await insert('all', '');
    for (const f of FIELDS) await insert(`field:${f}`, 'AND p.field = ?', f);
    const tags = await all<{ tag: string }>(
      db,
      `SELECT h.tag FROM post_daily_stats s JOIN post_hashtags h ON h.post_id = s.post_id
       WHERE s.day BETWEEN ? AND ? GROUP BY h.tag ORDER BY SUM(s.views) + SUM(s.saves) * 3 DESC LIMIT 100`,
      from,
      today,
    );
    for (const { tag } of tags) {
      await insert(
        `tag:${tag}`,
        'AND EXISTS (SELECT 1 FROM post_hashtags h WHERE h.post_id = s.post_id AND h.tag = ?)',
        tag,
      );
    }
  }
  return { rows };
}
