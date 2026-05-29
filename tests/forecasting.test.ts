import { describe, it, expect } from 'vitest';
import { forecastMonthEnd } from '@/lib/forecasting';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('forecastMonthEnd()', () => {
  it('extrapolates the daily run-rate linearly when there is no recent trend', async () => {
    // Day 10 of a 30-day month, $1/day consistently → projected ≈ $30.
    const now = new Date(Date.UTC(2025, 5, 10, 12, 0, 0)); // June 10, 2025 (30-day month)
    const points: { ts: Date; cost: number }[] = [];
    for (let i = 0; i < 10; i++) {
      points.push({
        ts: new Date(Date.UTC(2025, 5, i + 1, 12, 0, 0)),
        cost: 1.0,
      });
    }
    const f = forecastMonthEnd(points, now);
    expect(f.monthToDate).toBeCloseTo(10, 1);
    // Linear: ~10/10 days * 30 = 30. EMA blend may pull it a tiny bit higher
    // or lower depending on warmup; the function returns the larger of the two.
    expect(f.projectedMonthEnd).toBeGreaterThanOrEqual(29);
    expect(f.projectedMonthEnd).toBeLessThanOrEqual(40);
  });

  it('weights recent days more via EMA blend when spend ramps up', async () => {
    // Day 10 of a 30-day month. First 6 days $0.10, last 4 days $5 each.
    const now = new Date(Date.UTC(2025, 5, 10, 12, 0, 0));
    const points: { ts: Date; cost: number }[] = [];
    for (let i = 0; i < 6; i++) {
      points.push({ ts: new Date(Date.UTC(2025, 5, i + 1, 12, 0, 0)), cost: 0.1 });
    }
    for (let i = 6; i < 10; i++) {
      points.push({ ts: new Date(Date.UTC(2025, 5, i + 1, 12, 0, 0)), cost: 5 });
    }
    // monthToDate = 6*0.1 + 4*5 = 0.6 + 20 = 20.6
    const f = forecastMonthEnd(points, now);
    expect(f.monthToDate).toBeCloseTo(20.6, 1);
    // Linear: (20.6/10) * 30 = 61.8.
    // EMA blend should produce a value higher than linear because the
    // tail-weighted average exceeds the overall average. Test picks ema-blend
    // when its projection is strictly larger.
    expect(f.method).toBe('ema-blend');
  });

  it('assigns confidence high when > 14 days elapsed, medium 5-14, low < 5', async () => {
    const lowNow = new Date(Date.UTC(2025, 5, 3, 12, 0, 0));
    const medNow = new Date(Date.UTC(2025, 5, 10, 12, 0, 0));
    const highNow = new Date(Date.UTC(2025, 5, 20, 12, 0, 0));
    const points: { ts: Date; cost: number }[] = [{ ts: new Date(Date.UTC(2025, 5, 1, 12, 0, 0)), cost: 1 }];
    expect(forecastMonthEnd(points, lowNow).confidence).toBe('low');
    expect(forecastMonthEnd(points, medNow).confidence).toBe('medium');
    expect(forecastMonthEnd(points, highNow).confidence).toBe('high');
  });

  it('returns zeros for an empty dataset', () => {
    const now = new Date(Date.UTC(2025, 5, 15, 12, 0, 0));
    const f = forecastMonthEnd([], now);
    expect(f.monthToDate).toBe(0);
    expect(f.projectedMonthEnd).toBe(0);
  });

  it('reports the correct daysInMonth even for shorter months (February)', () => {
    // Feb 2025 has 28 days.
    const feb15 = new Date(Date.UTC(2025, 1, 15, 12, 0, 0));
    const points = [{ ts: new Date(Date.UTC(2025, 1, 1, 12, 0, 0)), cost: 7 }];
    const f = forecastMonthEnd(points, feb15);
    expect(f.daysElapsed + f.daysRemaining).toBe(28);
  });
});
