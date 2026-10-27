import type { Env } from './env';
import { todayJst } from './lib/db';
import { evaluateDelays } from './lib/requests';

/** Daily Cron Trigger entry point (00:00 JST). */
export async function runDailyJobs(env: Env, today = todayJst()) {
  const delays = await evaluateDelays(env, today);
  return { today, delays };
}
