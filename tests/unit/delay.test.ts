import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeDelay,
  computeSettlement,
  creatorAmountAfter,
  daysBetween,
} from '../../src/shared/delay';

const due = '2026-11-01';
const price = 10_000;

describe('delay reduction (5%/day, cap 50%)', () => {
  it('does not reduce on or before the due date', () => {
    expect(computeDelay({ price, dueDate: due, asOf: '2026-10-25' }).amount).toBe(0);
    expect(computeDelay({ price, dueDate: due, asOf: due }).amount).toBe(0);
  });

  it.each([
    [1, 500],
    [2, 1000],
    [5, 2500],
    [9, 4500],
    [10, 5000],
    [11, 5000],
    [30, 5000],
    [365, 5000],
  ])('after %i day(s) the reduction is %i yen', (days, expected) => {
    const r = computeDelay({ price, dueDate: due, asOf: addDays(due, days) });
    expect(r.overdueDays).toBe(days);
    expect(r.amount).toBe(expected);
    expect(r.amount).toBeLessThanOrEqual(price / 2);
  });

  it('matches the published examples (10,000円: 1日後9,500円, 5日後7,500円, 10日後5,000円)', () => {
    expect(creatorAmountAfter(10_000, 1)).toBe(9_500);
    expect(creatorAmountAfter(10_000, 5)).toBe(7_500);
    expect(creatorAmountAfter(10_000, 10)).toBe(5_000);
    expect(creatorAmountAfter(10_000, 20)).toBe(5_000);
  });

  it('caps at 50% for any price and rounds down to whole yen', () => {
    for (const p of [500, 999, 1234, 33_333, 10_000_000]) {
      for (let d = 0; d <= 15; d++) {
        const r = computeDelay({ price: p, dueDate: due, asOf: addDays(due, d) });
        expect(Number.isInteger(r.amount)).toBe(true);
        expect(r.amount).toBeLessThanOrEqual(Math.floor(p / 2));
        expect(r.amount).toBe(Math.floor((p * Math.min(d * 5, 50)) / 100));
      }
    }
  });

  it('excludes days covered by justified-delay flags', () => {
    const pauses = [{ startDate: addDays(due, 1), endDate: addDays(due, 3) }];
    const r = computeDelay({ price, dueDate: due, asOf: addDays(due, 5), pauses });
    expect(r.overdueDays).toBe(5);
    expect(r.excusedDays).toBe(3);
    expect(r.chargeableDays).toBe(2);
    expect(r.amount).toBe(1000);
  });

  it('does not reduce at all while an open-ended justified flag covers every overdue day', () => {
    const pauses = [{ startDate: '2026-10-20', endDate: null }];
    const r = computeDelay({ price, dueDate: due, asOf: addDays(due, 20), pauses });
    expect(r.amount).toBe(0);
    expect(r.chargeableDays).toBe(0);
  });

  it('daysBetween handles month boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('settlement', () => {
  it('takes a 10% fee from the reduced amount and refunds the reduction', () => {
    expect(computeSettlement(10_000, 0, 0.1)).toEqual({
      creatorGross: 10_000,
      fee: 1_000,
      payout: 9_000,
      refundToClient: 0,
    });
    expect(computeSettlement(10_000, 2_500, 0.1)).toEqual({
      creatorGross: 7_500,
      fee: 750,
      payout: 6_750,
      refundToClient: 2_500,
    });
  });
});
