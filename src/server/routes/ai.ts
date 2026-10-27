import { Hono } from 'hono';
import { FIELDS } from '../../shared/constants';
import {
  aiSearchSchema,
  chatbotSchema,
  tagSuggestSchema,
  translateSchema,
} from '../../shared/schemas';
import type { AppBindings } from '../env';
import { extractJson, getAi, sanitizeTags, searchIntentSchema } from '../lib/ai';
import { HttpError } from '../lib/errors';
import { rateLimit } from '../lib/security';
import { requireUser } from '../lib/session';
import { parseJson } from '../lib/validate';
import { searchPosts } from './discover';

export const FAQ: { q: string; keywords: string[]; a: string }[] = [
  {
    q: '依頼料はいつ支払いますか？',
    keywords: ['支払', '前払', '決済', 'お金'],
    a: '依頼料は依頼確定時に前払いします。納品後、依頼者とクリエイターの双方が受け取りを承認するとクリエイターへ送金されます。',
  },
  {
    q: '納期に遅れた場合はどうなりますか？',
    keywords: ['遅延', '遅れ', '納期', '減額', '返金'],
    a: '納期を1日過ぎるごとに依頼料の5%が減額され、上限は50%です。依頼者は減額を適用して待つか、キャンセルして全額返金を受けるかを選べます。病気・災害、依頼者側の遅れ、運営の障害など正当な理由がある場合は減額されません。',
  },
  {
    q: '手数料はいくらですか？',
    keywords: ['手数料', 'fee'],
    a: '依頼の手数料は売上の10%です。',
  },
  {
    q: '二次創作やAI生成作品は投稿できますか？',
    keywords: ['二次創作', 'AI', 'ファンアート', '生成'],
    a: '投稿できるのはご本人のオリジナル作品のみで、二次創作は禁止です。AI生成作品は投稿できません。AI補助ツールを使った場合は投稿時に申告してください（「AI補助」ラベルが表示されます）。',
  },
  {
    q: '未成年でも依頼できますか？',
    keywords: ['未成年', '年齢', '18'],
    a: '有償の依頼は18歳以上の方のみ利用できます。設定画面で年齢確認を行ってください。',
  },
  {
    q: 'アカウントを削除したい',
    keywords: ['削除', '退会'],
    a: '設定 → アカウント → 「アカウントを削除」から削除できます。決済に関する記録は法令で定められた期間保存されます。',
  },
];

export const aiRoutes = new Hono<AppBindings>();

aiRoutes.use('*', rateLimit('ai', 30, 600));

aiRoutes.post('/translate', async (c) => {
  const b = await parseJson(c, translateSchema);
  const text = await getAi(c.env).translate(b.text, b.target);
  return c.json({ text });
});

aiRoutes.post('/tags', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, tagSuggestSchema);
  const ai = getAi(c.env);
  const raw = await ai.generate(
    'TAGS: あなたは作品投稿サイトのタグ付けアシスタントです。作品のタイトルと説明から、日本語のハッシュタグ候補を最大8個、JSON 配列のみで返してください。記号や # は付けないでください。',
    `タイトル: ${b.title}\n説明: ${b.body}`,
    200,
  );
  let tags = sanitizeTags(extractJson(raw));
  if (b.mediaKey && tags.length < 8) {
    const obj = await c.env.MEDIA.get(b.mediaKey);
    const owner = (await c.env.MEDIA.head(b.mediaKey))?.customMetadata?.owner;
    if (obj && owner === user.id && obj.httpMetadata?.contentType?.startsWith('image/')) {
      const labels = await ai
        .classifyImage(new Uint8Array(await obj.arrayBuffer()))
        .catch(() => []);
      tags = [
        ...new Set([...tags, ...sanitizeTags(labels.map((l) => l.split(',')[0]?.trim() ?? ''))]),
      ].slice(0, 8);
    }
  }
  if (tags.length === 0) throw new HttpError(502, 'ai_no_result', 'タグ候補を生成できませんでした');
  return c.json({ tags });
});

/** AIおすすめ検索: natural-language taste → keywords/field → search. Falls back to plain search. */
aiRoutes.post('/search', async (c) => {
  const b = await parseJson(c, aiSearchSchema);
  const viewer = c.get('user')?.id ?? '';
  try {
    const raw = await getAi(c.env).generate(
      `SEARCH: ユーザーが探している作品のテイストから検索キーワード（最大3個、短い日本語）と分野（${FIELDS.join(', ')} のいずれか、または null）を抽出し、{"keywords": [...], "field": ...} の JSON のみを返してください。`,
      b.query,
      150,
    );
    const intent = searchIntentSchema.parse(extractJson(raw) ?? {});
    const field = (FIELDS as readonly string[]).includes(intent.field ?? '')
      ? intent.field!
      : undefined;
    const seen = new Map<string, Awaited<ReturnType<typeof searchPosts>>[number]>();
    for (const kw of intent.keywords.slice(0, 3)) {
      for (const p of await searchPosts(c.env.DB, viewer, kw, field)) seen.set(p.id, p);
    }
    if (seen.size === 0 && field) {
      for (const p of await searchPosts(c.env.DB, viewer, '', field)) seen.set(p.id, p);
    }
    return c.json({
      posts: [...seen.values()].slice(0, 30),
      keywords: intent.keywords,
      fallback: false,
    });
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    const posts = await searchPosts(c.env.DB, viewer, b.query.slice(0, 100));
    return c.json({
      posts,
      keywords: [],
      fallback: true,
      message: 'AI検索を利用できなかったため、キーワード検索の結果を表示しています',
    });
  }
});

/** Chatbot: FAQ answers and request-template drafting. */
aiRoutes.post('/chatbot', async (c) => {
  const b = await parseJson(c, chatbotSchema);
  if (b.mode === 'faq') {
    const hit = FAQ.find((f) => f.keywords.some((k) => b.message.includes(k)));
    if (hit) return c.json({ reply: hit.a, source: 'faq' });
    const context = FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');
    const reply = await getAi(c.env).generate(
      `FAQ: あなたはクリエイター向け依頼プラットフォームのサポートです。次の FAQ の範囲内で、日本語で簡潔に答えてください。分からない場合は「通報・お問い合わせフォームからご連絡ください」と案内してください。\n${context}`,
      b.message,
      300,
    );
    return c.json({ reply, source: 'ai' });
  }
  requireUser(c);
  const reply = await getAi(c.env).generate(
    'TEMPLATE: あなたはイラスト・3DCG等の制作依頼のテンプレート作成を手伝います。ユーザーの入力をもとに、依頼者が埋めやすい項目（依頼内容、用途、サイズ・形式、希望納期、参考資料、注意事項）を含む依頼テンプレートを日本語で作成してください。テンプレート本文のみを返してください。',
    b.message,
    500,
  );
  return c.json({ reply: reply.slice(0, 2000), source: 'ai' });
});
