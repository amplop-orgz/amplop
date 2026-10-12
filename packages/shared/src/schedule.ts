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

/** S11-1: share 1 shows the Monday of the arrival week (the record keeps no arrival day). */
export function releaseDay(r: Schedule, k: number): number {
  return mondayDay(Number(r.startMonday) + k - 1);
}

/** S11-1: the newest allowance's week, 1 to 4, or null before or after it (D6). */
export function weekCounter(schedules: readonly Schedule[], today: number): number | null {
  if (schedules.length === 0) return null;
  const newest = Math.max(...schedules.map((r) => Number(r.startMonday)));
  const w = 1 + mondayNumber(today) - newest;
  return w >= 1 && w <= 4 ? w : null;
}

/** S11-2: every share of envelope `e` released during the current Monday week. */
export function thisWeekShare(schedules: readonly Schedule[], today: number, e: number): bigint {
  let sum = 0n;
  for (const r of schedules) {
    const k = 1 + mondayNumber(today) - Number(r.startMonday);
    if (k >= 1 && k <= 4) sum += shareAmount(r, e, k);
  }
  return sum;
}

export type Pace = { periodStart: number; periodEnd: number };

/** S11-3: the whole Monday week, or null when no weekly envelope got a share this week. */
export function pace(schedules: readonly Schedule[], today: number): Pace | null {
  if ([0, 1, 2, 3].every((e) => thisWeekShare(schedules, today, e) === 0n)) return null;
  const m = mondayNumber(today);
  return { periodStart: mondayDay(m), periodEnd: mondayDay(m + 1) };
}

/** Where the pace tick sits, 0 to 1: the share of the week left after today. */
export function paceTick(p: Pace, today: number): number {
  return (p.periodEnd - today - 1) / 7;
}

export function barPercent(available: bigint, share: bigint): number | null {
  if (share === 0n) return null;
  const pct = (available * 100n) / share;
  return Number(pct > 100n ? 100n : pct);
}

/** Below the tick: `available × 7 < share × (periodEnd − today − 1)`, integers only. */
export function isSpendingFast(
  available: bigint,
  share: bigint,
  p: Pace | null,
  today: number,
): boolean {
  return share > 0n && p !== null && available * 7n < share * BigInt(p.periodEnd - today - 1);
}
