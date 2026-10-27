import type { Env } from './env';
import { todayJst } from './lib/db';

/** Daily Cron Trigger entry point. Jobs are added per phase. */
export async function runDailyJobs(env: Env, today = todayJst()): Promise<{ today: string }> {
  void env;
  return { today };
}
