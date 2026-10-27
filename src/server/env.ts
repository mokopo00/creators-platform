export type Environment = 'development' | 'test' | 'staging' | 'production';

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  MEDIA: R2Bucket;
  CHAT?: DurableObjectNamespace;
  AI?: AiBinding;
  ASSETS?: Fetcher;

  ENVIRONMENT: Environment;
  APP_ORIGIN: string;
  MOCK_AUTH?: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URIS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ALLOW_AI_GENERATED?: string;
  PREMIUM_PRICE_JPY?: string;
  PREMIUM_PRICE_TAX_LABEL?: string;
  PLATFORM_FEE_RATE?: string;
  DIGITAL_SALES_FEE_RATE?: string;
  ADMIN_HANDLES?: string;
  BUSINESS_NAME?: string;
  BUSINESS_ADDRESS?: string;
  BUSINESS_PHONE?: string;
  BUSINESS_CONTACT?: string;
}

export type SessionUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isCreator: boolean;
  isAdult: boolean;
  isPremium: boolean;
};

export type AppBindings = {
  Bindings: Env;
  Variables: { user: SessionUser | null; sessionId: string | null };
};

/** Mock login is only ever available in local development and automated tests. */
export function mockAuthEnabled(env: Env): boolean {
  return (
    (env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test') && env.MOCK_AUTH === 'true'
  );
}

export function isDevLike(env: Env): boolean {
  return env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test';
}
