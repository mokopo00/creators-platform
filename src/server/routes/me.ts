import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { first } from '../lib/db';

export const meRoutes = new Hono<AppBindings>();

meRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ user: null, unreadNotifications: 0 });
  const unread = await first<{ n: number }>(
    c.env.DB,
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    user.id,
  );
  return c.json({ user, unreadNotifications: unread?.n ?? 0 });
});
