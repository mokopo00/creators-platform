import { createApp } from './app';
import type { Env } from './env';
import { runDailyJobs } from './jobs';

export { ChatRoom } from './chat-room';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyJobs(env));
  },
} satisfies ExportedHandler<Env>;
