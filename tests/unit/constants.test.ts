import { describe, expect, it } from 'vitest';
import { DELAY_MAX_RATE_BP, DELAY_RATE_PER_DAY_BP, FIELDS } from '../../src/shared/constants';

describe('constants', () => {
  it('defines the confirmed delay rules', () => {
    expect(DELAY_RATE_PER_DAY_BP).toBe(500);
    expect(DELAY_MAX_RATE_BP).toBe(5000);
  });
  it('lists fields', () => {
    expect(FIELDS).toContain('illustration');
  });
});
