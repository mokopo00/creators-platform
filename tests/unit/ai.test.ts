import { describe, expect, it } from 'vitest';
import { extractJson, getAi, sanitizeTags } from '../../src/server/lib/ai';
import type { AiBinding } from '../../src/server/env';
import { setup } from './helpers/client';
import { createPost } from './helpers/fixtures';

describe('AI features', () => {
  it('translates text', async () => {
    const { client } = setup();
    const res = await client().post('/api/ai/translate', { text: 'こんにちは', target: 'en' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toContain('こんにちは');
  });

  it('returns a user-facing error message when the AI fails', async () => {
    const { client } = setup();
    const res = await client().post('/api/ai/translate', { text: '__AI_FAIL__', target: 'en' });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('AI');
  });

  it('maps Workers AI exceptions and malformed output to a 503', async () => {
    const broken: AiBinding = {
      run: async () => {
        throw new Error('boom');
      },
    };
    const ai = getAi({ AI: broken, ENVIRONMENT: 'staging' } as never);
    await expect(ai.translate('x', 'en')).rejects.toMatchObject({ status: 503 });
    const weird: AiBinding = { run: async () => ({ nope: 1 }) };
    await expect(
      getAi({ AI: weird, ENVIRONMENT: 'staging' } as never).generate('s', 'u'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('is unavailable (not mocked) on staging without a binding', () => {
    expect(() => getAi({ ENVIRONMENT: 'staging' } as never)).toThrow();
  });

  it('suggests sanitised tag candidates (login required)', async () => {
    const { client } = setup();
    const anon = client();
    expect((await anon.post('/api/ai/tags', { title: 't' })).status).toBe(401);
    const c = client();
    await c.login('test-creator-01');
    const res = await c.post('/api/ai/tags', { title: '夜景のイラスト', body: '' });
    const { tags } = (await res.json()) as { tags: string[] };
    expect(tags.length).toBeGreaterThan(0);
  });

  it('sanitises LLM tag output', () => {
    expect(sanitizeTags(['#風景', 'a b', '<script>', 1, 'ok'])).toEqual(['風景', 'a_b', 'ok']);
    expect(extractJson('結果: ["a","b"] です')).toEqual(['a', 'b']);
    expect(extractJson('no json')).toBeNull();
  });

  it('AI search falls back to keyword search on failure', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    await createPost(c, { title: '星空の風景' });
    const ok = (await (await c.post('/api/ai/search', { query: '星空の 風景' })).json()) as {
      posts: unknown[];
      fallback: boolean;
    };
    expect(ok.fallback).toBe(false);
    expect(ok.posts.length).toBe(1);
    const fb = (await (await c.post('/api/ai/search', { query: '__AI_FAIL__' })).json()) as {
      fallback: boolean;
      message: string;
    };
    expect(fb.fallback).toBe(true);
    expect(fb.message).toBeTruthy();
  });

  it('chatbot answers FAQ and drafts templates', async () => {
    const { client } = setup();
    const c = client();
    const faq = (await (
      await c.post('/api/ai/chatbot', { mode: 'faq', message: '納期に遅れたら？' })
    ).json()) as { reply: string };
    expect(faq.reply).toContain('5%');
    expect((await c.post('/api/ai/chatbot', { mode: 'template', message: '立ち絵' })).status).toBe(
      401,
    );
    await c.login('test-creator-01');
    const t = (await (
      await c.post('/api/ai/chatbot', { mode: 'template', message: '立ち絵' })
    ).json()) as { reply: string };
    expect(t.reply).toContain('依頼内容');
  });

  it('rate limits AI calls', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-user-01');
    let last = 200;
    for (let i = 0; i < 31; i++)
      last = (await c.post('/api/ai/translate', { text: 'a', target: 'en' })).status;
    expect(last).toBe(429);
  });
});
