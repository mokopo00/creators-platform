/**
 * Delay reduction rules (CLAUDE.md 3-5). Pure functions shared by the API
 * (authoritative calculation, Cron) and the UI (terms and examples).
 *
 * - Each overdue day reduces the creator's amount by 5% of the request price
 *   (before platform fee).
 * - The total reduction is capped at 50% of the price.
 * - Days covered by an approved justified-delay flag are excluded.
 * - Amounts are integer yen (rounded down) and never
 *   exceed the cap.
 */
import { DELAY_MAX_RATE_BP, DELAY_RATE_PER_DAY_BP } from './constants';

export type DelayPause = { startDate: string; endDate: string | null };

export type DelayResult = {
  overdueDays: number;
  excusedDays: number;
  chargeableDays: number;
  rateBp: number;
  amount: number;
  capped: boolean;
};

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function computeDelay(input: {
  price: number;
  dueDate: string;
  asOf: string;
  pauses?: DelayPause[];
}): DelayResult {
  const { price, dueDate, asOf, pauses = [] } = input;
  const overdueDays = Math.max(0, daysBetween(dueDate, asOf));
  let excusedDays = 0;
  for (let k = 1; k <= overdueDays; k++) {
    const day = addDays(dueDate, k);
    const excused = pauses.some((p) => p.startDate <= day && day <= (p.endDate ?? asOf));
    if (excused) excusedDays++;
  }
  const chargeableDays = overdueDays - excusedDays;
  const rateBp = Math.min(chargeableDays * DELAY_RATE_PER_DAY_BP, DELAY_MAX_RATE_BP);
  const amount = Math.floor((price * rateBp) / 10_000);
  return {
    overdueDays,
    excusedDays,
    chargeableDays,
    rateBp,
    amount,
    capped: chargeableDays * DELAY_RATE_PER_DAY_BP >= DELAY_MAX_RATE_BP,
  };
}

/** Amount the creator receives (before fee) after `days` chargeable overdue days. */
export function creatorAmountAfter(price: number, days: number): number {
  const rateBp = Math.min(days * DELAY_RATE_PER_DAY_BP, DELAY_MAX_RATE_BP);
  return price - Math.floor((price * rateBp) / 10_000);
}

/**
 * Settlement after both parties approve: the reduction is refunded to the
 * client, the platform fee is taken from the reduced amount, and the rest is
 * transferred to the creator.
 */
export function computeSettlement(price: number, reduction: number, feeRate: number) {
  const creatorGross = price - reduction;
  const fee = Math.floor(creatorGross * feeRate);
  return { creatorGross, fee, payout: creatorGross - fee, refundToClient: reduction };
}

export const DELAY_EXAMPLE_PRICE = 10_000;
export const DELAY_EXAMPLE_DAYS = [1, 5, 10] as const;
