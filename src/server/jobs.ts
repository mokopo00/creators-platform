import type { Env } from './env';
import { todayJst } from './lib/db';
import { computeRankings } from './lib/rankings';
import { evaluateDelays } from './lib/requests';
import { applyPromotions } from './routes/extras';

/** Daily Cron Trigger entry point (00:00 JST). */
export async function runDailyJobs(env: Env, today = todayJst()) {
  const delays = await evaluateDelays(env, today);
  const rankings = await computeRankings(env.DB, today);
  await applyPromotions(env.DB, today);
  return { today, delays, rankings };
}
