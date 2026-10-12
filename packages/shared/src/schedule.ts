// Release maths (11 S11-1), the parts specs 09 and 15 use now: weekdays, Mondays and the next share.
// `schedules` is the contract read `schedules(accountId)`; amounts are bigint token units.

export type Schedule = {
  startMonday: bigint | number;
  sharesOut: number;
  base: readonly bigint[];
  part: readonly bigint[];
};

export function dayOf(clock: bigint | number): number {
  return Math.floor(Number(clock) / 86400);
}

export function mondayNumber(day: number): number {
  return Math.floor((day + 3) / 7);
}

/** The day number of Monday number `m`. */
export function mondayDay(m: number): number {
  return 7 * m - 3;
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

/** Share `k` (1 to 4) of envelope `e`; the last share carries the rounding remainder (R5). */
export function shareAmount(r: Schedule, e: number, k: number): bigint {
  const base = r.base[e] ?? 0n;
  return k <= 3 ? base : (r.part[e] ?? 0n) - 3n * base;
}

export function sharesOutAt(r: Schedule, today: number): number {
  return Math.min(4, 1 + mondayNumber(today) - Number(r.startMonday));
}

/** The next Monday's release: its day and amount per weekly envelope, or null when every share is out. */
export function nextRelease(
  schedules: readonly Schedule[],
  today: number,
): { day: number; perEnvelope: bigint[]; total: bigint } | null {
  const perEnvelope = [0n, 0n, 0n, 0n];
  let any = false;
  for (const r of schedules) {
    const out = sharesOutAt(r, today);
    if (out >= 4) continue;
    any = true;
    for (let e = 0; e < 4; e++)
      perEnvelope[e] = (perEnvelope[e] ?? 0n) + shareAmount(r, e, out + 1);
  }
  if (!any) return null;
  return {
    day: mondayDay(mondayNumber(today) + 1),
    perEnvelope,
    total: perEnvelope.reduce((a, b) => a + b, 0n),
  };
}

/** Days to add so the clock lands on the next Monday at the same time of day (15 S15-10): 1 to 7. */
export function daysToNextMonday(today: number): number {
  return 7 - weekdayIndex(today);
}
