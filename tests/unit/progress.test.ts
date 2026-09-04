import { calculatePercentage, clampCharOffset } from '../../src/shared/progress';

describe('reading progress', () => {
  it('clamps offsets into the valid text range', () => {
    expect(clampCharOffset(-42, 100)).toBe(0);
    expect(clampCharOffset(42.4, 100)).toBe(42);
    expect(clampCharOffset(142, 100)).toBe(100);
    expect(clampCharOffset(Number.NaN, 100)).toBe(0);
  });

  it('calculates a stable one-decimal percentage', () => {
    expect(calculatePercentage(1, 3)).toBe(33.3);
    expect(calculatePercentage(99, 100)).toBe(99);
    expect(calculatePercentage(200, 100)).toBe(100);
    expect(calculatePercentage(1, 0)).toBe(0);
  });
});
