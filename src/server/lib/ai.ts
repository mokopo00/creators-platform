/**
 * Workers AI integration. Model IDs were checked against the Cloudflare docs
 * on 2026-10-27 (see docs/TECH_DECISIONS.md).
 *
 * Every call has a timeout and throws an HttpError with a user-facing message
 * on failure, so callers can show it without breaking the page.
 */
import { z } from 'zod';
import { hashtagSchema } from '../../shared/schemas';
import { isDevLike, type AiBinding, type Env } from '../env';
import { HttpError } from './errors';

export const AI_MODELS = {
  text: '@cf/meta/llama-3.1-8b-instruct-fp8',
  translate: '@cf/meta/m2m100-1.2b',
  imageClassify: '@cf/microsoft/resnet-50',
} as const;

const TIMEOUT_MS = 15_000;
const LANG_NAMES = { ja: 'japanese', en: 'english', zh: 'chinese', ko: 'korean' } as const;
export type Lang = keyof typeof LANG_NAMES;

export const aiUnavailable = () =>
  new HttpError(
    503,
    'ai_unavailable',
    'AI 機能を一時的に利用できません。時間をおいて再度お試しください',
  );

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new HttpError(504, 'ai_timeout', 'AI の応答がタイムアウトしました')),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface AiProvider {
  kind: 'workers-ai' | 'mock';
  generate(system: string, user: string, maxTokens?: number): Promise<string>;
  translate(text: string, target: Lang, source?: Lang): Promise<string>;
  classifyImage(bytes: Uint8Array): Promise<string[]>;
}

class WorkersAiProvider implements AiProvider {
  kind = 'workers-ai' as const;
  constructor(private ai: AiBinding) {}

  private async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    try {
      return await withTimeout(this.ai.run(model, inputs));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw aiUnavailable();
    }
  }

  async generate(system: string, user: string, maxTokens = 512) {
    const out = (await this.run(AI_MODELS.text, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
    })) as { response?: string };
    if (typeof out?.response !== 'string') throw aiUnavailable();
    return out.response;
  }

  async translate(text: string, target: Lang, source?: Lang) {
    const out = (await this.run(AI_MODELS.translate, {
      text,
      target_lang: target,
      ...(source ? { source_lang: source } : {}),
    })) as { translated_text?: string };
    if (typeof out?.translated_text !== 'string') throw aiUnavailable();
    return out.translated_text;
  }

  async classifyImage(bytes: Uint8Array) {
    const out = (await this.run(AI_MODELS.imageClassify, { image: [...bytes] })) as {
      label: string;
      score: number;
    }[];
    if (!Array.isArray(out)) return [];
    return out.filter((x) => x.score > 0.2).map((x) => x.label);
  }
}

/** Deterministic stand-in used only in development/test when no AI binding exists. */
class MockAiProvider implements AiProvider {
  kind = 'mock' as const;
  private check(text: string) {
    if (text.includes('__AI_FAIL__')) throw aiUnavailable();
  }
  async generate(system: string, user: string) {
    this.check(user);
    if (system.includes('TAGS')) return JSON.stringify(['テスト', 'イラスト', 'オリジナル']);
    if (system.includes('SEARCH')) {
      return JSON.stringify({
        keywords: user
          .split(/[\s、。]+/)
          .filter(Boolean)
          .slice(0, 3),
        field: null,
      });
    }
    if (system.includes('TEMPLATE')) {
      return `【依頼内容】${user}\n【用途】\n【サイズ・形式】\n【希望納期】\n【参考資料】`;
    }
    return 'よくある質問をご確認ください。解決しない場合は通報・お問い合わせフォームからご連絡ください。';
  }
  async translate(text: string, target: Lang) {
    this.check(text);
    return `[${target}] ${text}`;
  }
  async classifyImage() {
    return ['artwork'];
  }
}

export function getAi(env: Env): AiProvider {
  if (env.AI) return new WorkersAiProvider(env.AI);
  if (isDevLike(env)) return new MockAiProvider();
  throw aiUnavailable();
}

/** Extracts the first JSON value from an LLM response. */
export function extractJson(text: string): unknown {
  const m = /[[{][\s\S]*[\]}]/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Sanitises LLM tag output into valid, unique hashtags. */
export function sanitizeTags(raw: unknown, limit = 8): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const r = hashtagSchema.safeParse(item.replace(/\s+/g, '_').slice(0, 30));
    if (r.success) out.add(r.data.toLowerCase());
    if (out.size >= limit) break;
  }
  return [...out];
}

export const searchIntentSchema = z.object({
  keywords: z.array(z.string().max(30)).max(5).catch([]),
  field: z.string().nullable().catch(null),
});
