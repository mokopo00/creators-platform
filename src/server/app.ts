import { Hono } from 'hono';
import type { AppBindings } from './env';
import { HttpError } from './lib/errors';
import { originCheck, securityHeaders } from './lib/security';
import { sessionMiddleware } from './lib/session';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import {
  favoriteRoutes,
  folderRoutes,
  notificationRoutes,
  rankingRoutes,
  searchRoutes,
} from './routes/discover';
import { meRoutes } from './routes/me';
import { paymentRoutes } from './routes/payments';
import { feedRoutes, postRoutes } from './routes/posts';
import { requestRoutes } from './routes/requests';
import { mediaRoutes, uploadRoutes } from './routes/uploads';
import { profileRoutes, userRoutes } from './routes/users';

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use('*', securityHeaders);
  app.use('/api/*', originCheck);
  app.use('/api/*', sessionMiddleware);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    // Never log request bodies, tokens or personal data.
    console.error('unhandled_error', err instanceof Error ? err.name : 'unknown');
    return c.json({ error: { code: 'internal', message: 'サーバーでエラーが発生しました' } }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));
  app.route('/api/auth', authRoutes);
  app.route('/api/me', meRoutes);
  app.route('/api/me', profileRoutes);
  app.route('/api/users', userRoutes);
  app.route('/api/posts', postRoutes);
  app.route('/api/feed', feedRoutes);
  app.route('/api/uploads', uploadRoutes);
  app.route('/api/requests', requestRoutes);
  app.route('/api/payments', paymentRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/search', searchRoutes);
  app.route('/api/rankings', rankingRoutes);
  app.route('/api/favorites', favoriteRoutes);
  app.route('/api/folders', folderRoutes);
  app.route('/api/notifications', notificationRoutes);
  app.route('/media', mediaRoutes);

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: { code: 'not_found', message: '見つかりません' } }, 404);
    }
    // SPA fallback is handled by Workers static assets (not_found_handling).
    return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404);
  });

  return app;
}
