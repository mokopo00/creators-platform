import { z } from 'zod';
import { FIELDS, PORTFOLIO_THEMES } from './constants';

export const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const handleSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{2,29}$/, '3〜30文字の半角英小文字・数字・ハイフン');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式');
export const hashtagSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^#/, ''))
  .pipe(z.string().regex(/^[\p{L}\p{N}_]{1,30}$/u, 'ハッシュタグは記号なし30文字以内'));
export const LANGS = ['ja', 'en', 'zh', 'ko'] as const;
export const langSchema = z.enum(LANGS);
export const mediaKeySchema = z
  .string()
  .regex(/^media\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/);

export const mockLoginSchema = z.object({
  handle: handleSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
  adult: z.boolean().optional(),
});

export const profileUpdateSchema = z.object({
  handle: handleSchema.optional(),
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().max(1000).optional(),
  bioLang: langSchema.optional(),
  theme: z.enum(PORTFOLIO_THEMES).optional(),
  decoration: z.string().max(40).optional(),
  isCreator: z.boolean().optional(),
  acceptingRequests: z.boolean().optional(),
  monthlyCapacity: z.number().int().min(0).max(50).optional(),
});

export const priceItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.number().int().min(500).max(10_000_000),
  description: z.string().max(300).default(''),
});

export const creatorSettingsSchema = z.object({
  priceList: z.array(priceItemSchema).max(20),
  samplePostIds: z.array(idSchema).max(12),
  notes: z.string().max(2000),
  productionDays: z.number().int().min(1).max(365),
  paymentTerms: z.string().max(200),
  retakeCount: z.number().int().min(0).max(20),
});

export const templateSchema = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(2000),
});

export const postCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    body: z.string().max(5000).default(''),
    lang: langSchema.default('ja'),
    mediaType: z.enum(['image', 'video', 'text']),
    mediaKey: mediaKeySchema.optional(),
    field: z.enum(FIELDS),
    hashtags: z.array(hashtagSchema).max(10).default([]),
    aiAssisted: z.boolean(),
    aiGenerated: z.boolean().default(false),
    originalConfirmed: z.literal(true, { message: 'オリジナル作品であることへの同意が必要です' }),
  })
  .refine((p) => p.mediaType === 'text' || !!p.mediaKey, {
    message: '画像または動画を添付してください',
    path: ['mediaKey'],
  });

export const postUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().max(5000).optional(),
  field: z.enum(FIELDS).optional(),
  hashtags: z.array(hashtagSchema).max(10).optional(),
  aiAssisted: z.boolean().optional(),
});

export const feedQuerySchema = z.object({
  tab: z.enum(['new', 'recommended']).default('new'),
  field: z.enum(FIELDS).optional(),
  tag: hashtagSchema.optional(),
  cursor: z.string().max(40).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  field: z.enum(FIELDS).optional(),
  sort: z.string().max(20).optional(),
});

export const uploadRequestSchema = z.object({
  contentType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
  ]),
  size: z.number().int().positive(),
});

export const requestCreateSchema = z.object({
  creatorHandle: handleSchema,
  templateId: idSchema.optional(),
  title: z.string().trim().min(1).max(100),
  details: z.string().trim().min(1).max(5000),
  price: z.number().int().min(500).max(10_000_000),
  dueDate: dateSchema,
  agreeDelayTerms: z.literal(true, { message: '遅延・減額・返金条件への同意が必要です' }),
});

export const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const deliverySchema = z.object({ note: z.string().trim().min(1).max(2000) });

export const PAUSE_REASONS = [
  'creator_force_majeure',
  'client_material_delay',
  'client_approval_wait',
  'platform_outage',
] as const;
export const pauseSchema = z.object({
  reason: z.enum(PAUSE_REASONS),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  note: z.string().max(1000).default(''),
});

export const reportSchema = z.object({
  targetType: z.enum(['post', 'user', 'message']),
  targetId: z.string().trim().min(1).max(100),
  kind: z.enum(['derivative', 'copyright', 'ai_undeclared', 'abuse', 'other']),
  details: z.string().trim().min(10).max(3000),
});

export const folderSchema = z.object({ name: z.string().trim().min(1).max(40) });

export const translateSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  target: langSchema,
});
export const tagSuggestSchema = z.object({
  title: z.string().max(100),
  body: z.string().max(5000).default(''),
  mediaKey: mediaKeySchema.optional(),
});
export const aiSearchSchema = z.object({ query: z.string().trim().min(1).max(200) });
export const chatbotSchema = z.object({
  mode: z.enum(['faq', 'template']),
  message: z.string().trim().min(1).max(1000),
});

export const ageConfirmSchema = z.object({
  birthDate: dateSchema,
  confirm: z.literal(true),
});

export const promotionSchema = z.object({
  postId: idSchema,
  startDate: dateSchema,
  endDate: dateSchema,
});

export const digitalProductSchema = z.object({
  title: z.string().trim().min(1).max(100),
  price: z.number().int().min(100).max(1_000_000),
});
