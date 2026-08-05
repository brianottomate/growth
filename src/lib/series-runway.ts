const PERIOD_LENGTH = { day: 1, week: 7, month: 30 } as const;
const NON_RUNWAY_STATUSES = new Set(["published", "rejected", "archived"]);

export type SeriesRunway = {
  horizonDays: number;
  required: number;
  scheduled: number;
  reserve: number;
  shortfall: number;
};

/**
 * Count distinct installments, not channel renderings. One installment can
 * satisfy several channel cadences, so the fastest target sets the runway.
 */
export function getSeriesRunway(input: {
  cadence: Array<{ count: number; period: keyof typeof PERIOD_LENGTH }>;
  installments: Array<{ plannedAt: Date | null; status: string }>;
  now: Date;
  horizonDays?: number;
}): SeriesRunway | null {
  const horizonDays = input.horizonDays ?? 14;
  const required = input.cadence.reduce((largest, target) => {
    const withinHorizon = Math.ceil(
      (target.count * horizonDays) / PERIOD_LENGTH[target.period],
    );
    return Math.max(largest, withinHorizon);
  }, 0);
  if (required === 0) return null;

  const end = new Date(input.now.getTime() + horizonDays * 86_400_000);
  let scheduled = 0;
  let reserve = 0;
  for (const installment of input.installments) {
    if (NON_RUNWAY_STATUSES.has(installment.status)) continue;
    if (!installment.plannedAt) {
      reserve += 1;
      continue;
    }
    if (installment.plannedAt >= input.now && installment.plannedAt < end) {
      scheduled += 1;
    }
  }

  return {
    horizonDays,
    required,
    scheduled,
    reserve,
    shortfall: Math.max(0, required - scheduled),
  };
}
