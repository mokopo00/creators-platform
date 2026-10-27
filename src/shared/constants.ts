export const FIELDS = ['3dcg', 'illustration', 'animation', 'novel', 'manga', 'other'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  '3dcg': '3DCG',
  illustration: 'イラスト',
  animation: 'アニメーション',
  novel: '小説',
  manga: '漫画',
  other: 'その他',
};

export const PORTFOLIO_THEMES = ['glass', 'mist', 'paper', 'night'] as const;
export type PortfolioTheme = (typeof PORTFOLIO_THEMES)[number];

/** Delay reduction rules (CLAUDE.md 3-5). Values are in basis points (1/10000). */
export const DELAY_RATE_PER_DAY_BP = 500; // 5% per day
export const DELAY_MAX_RATE_BP = 5000; // 50% cap

export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
