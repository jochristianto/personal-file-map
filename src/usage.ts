import type { MeterPhoto } from "./meters";

/**
 * Electricity used, from a prepaid meter's readings:
 *
 *   used between two balance readings = earlier balance + kWh topped up in between − later balance
 *
 * A top-up is a photo of the amount just added (or its receipt). When there's none but the balance went up
 * within a few hours (before/after photos of a top-up), the difference is taken as the top-up. Anything
 * that doesn't add up is flagged instead of guessed.
 */

export interface Period {
  from: Date;
  to: Date;
  startKwh: number;
  endKwh: number;
  toppedUp: number;
  /** null: unknown (balance rose with no top-up recorded, or the readings contradict each other). */
  used: number | null;
  days: number;
  perDay: number | null;
  /** Under SHORT_HOURS: the before/after photos of one top-up, not a stretch of usage. */
  short: boolean;
  /** A date is only estimated (no capture time in the photo). */
  estimated: boolean;
  problem: string | null;
}

export interface TopUp {
  at: Date;
  kwh: number;
  file: string | null;
  /** Worked out from before/after balances, no photo of the amount. */
  inferred: boolean;
}

export interface MonthUsage {
  used: number | null; // null: no period covers this month
  days: number; // days of the month covered by known usage
  toppedUp: number;
}

export interface MeterUsage {
  meter: string;
  photos: MeterPhoto[];
  periods: Period[];
  topUps: TopUp[];
  months: MonthUsage[]; // index 0 = January
  totalUsed: number;
  coveredDays: number;
  perDay: number | null;
  /** Rate of the latest period of at least a few days, for the "runs out" estimate. */
  recentPerDay: number | null;
  balance: { kwh: number; at: Date } | null;
  runsOut: Date | null;
  totalToppedUp: number;
  unread: number;
  problems: number;
  estimatedDates: number;
}

const SHORT_HOURS = 6;
const TOLERANCE = 0.5; // kWh: rounding and a few minutes of use between photos

export function meterUsage(meter: string, photos: MeterPhoto[], year: number): MeterUsage {
  const periods: Period[] = [];
  const topUps: TopUp[] = [];
  let last: { kwh: number; at: Date; estimated: boolean } | null = null;
  let pending: TopUp[] = [];

  const addTopUp = (t: TopUp) => {
    // A meter screen and a receipt of the same top-up between two balances: count it once
    if (pending.some((p) => Math.abs(p.kwh - t.kwh) < 0.05)) return;
    pending.push(t);
  };

  for (const p of photos) {
    const r = p.reading;
    if (!r || r.kind === "other") continue;
    if (r.kind === "topup") {
      addTopUp({ at: p.takenAt, kwh: r.kwh, file: p.file, inferred: false });
      continue;
    }
    const estimated = p.dateSource === "month";
    if (last) {
      const added = pending.reduce((n, t) => n + t.kwh, 0);
      const hours = (p.takenAt.getTime() - last.at.getTime()) / 3_600_000;
      const short = hours < SHORT_HOURS;
      let used: number | null = last.kwh + added - r.kwh;
      let problem: string | null = null;
      if (added === 0 && r.kwh > last.kwh + 0.05) {
        if (short) {
          // Before/after photos of a top-up without a photo of the amount
          pending.push({ at: p.takenAt, kwh: round(r.kwh - last.kwh), file: null, inferred: true });
          used = 0;
        } else {
          used = null;
          problem = "Balance went up but there's no top-up photo, so usage is unknown";
        }
      } else if (used < -TOLERANCE) {
        used = null;
        problem = `Readings don't add up (${fmt(last.kwh)} + ${fmt(added)} topped up, then ${fmt(r.kwh)}): check them`;
      }
      if (used !== null) used = Math.max(0, round(used));
      const days = Math.max(0, hours / 24);
      periods.push({
        from: last.at,
        to: p.takenAt,
        startKwh: last.kwh,
        endKwh: r.kwh,
        toppedUp: round(pending.reduce((n, t) => n + t.kwh, 0)),
        used,
        days,
        perDay: used !== null && days >= 0.5 ? used / days : null,
        short,
        estimated: estimated || last.estimated,
        problem,
      });
    }
    topUps.push(...pending);
    pending = [];
    last = { kwh: r.kwh, at: p.takenAt, estimated };
  }
  topUps.push(...pending); // top-ups after the latest balance photo

  const months: MonthUsage[] = Array.from({ length: 12 }, () => ({ used: null, days: 0, toppedUp: 0 }));
  for (const t of topUps) if (t.at.getFullYear() === year) months[t.at.getMonth()].toppedUp += t.kwh;
  for (const pr of periods) {
    if (pr.used === null || pr.short) continue;
    const span = pr.to.getTime() - pr.from.getTime();
    if (span <= 0) continue;
    // Spread the period's usage over the months it covers, in proportion to time
    for (let m = 0; m < 12; m++) {
      const start = Math.max(pr.from.getTime(), new Date(year, m, 1).getTime());
      const end = Math.min(pr.to.getTime(), new Date(year, m + 1, 1).getTime());
      if (end <= start) continue;
      const share = (end - start) / span;
      months[m].used = (months[m].used ?? 0) + pr.used * share;
      months[m].days += (end - start) / 86_400_000;
    }
  }

  const known = periods.filter((p) => p.used !== null && !p.short);
  const totalUsed = known.reduce((n, p) => n + (p.used ?? 0), 0);
  const coveredDays = known.reduce((n, p) => n + p.days, 0);
  const perDay = coveredDays >= 1 ? totalUsed / coveredDays : null;
  const recent = [...known].reverse().find((p) => p.days >= 3 && p.perDay !== null);
  const recentPerDay = recent?.perDay ?? perDay;

  const afterLast = last ? topUps.filter((t) => t.at > last!.at && !t.inferred).reduce((n, t) => n + t.kwh, 0) : 0;
  const balance = last ? { kwh: round(last.kwh + afterLast), at: last.at } : null;
  const runsOut =
    balance && recentPerDay && recentPerDay > 0 ? new Date(balance.at.getTime() + (balance.kwh / recentPerDay) * 86_400_000) : null;

  return {
    meter,
    photos,
    periods,
    topUps,
    months,
    totalUsed: round(totalUsed),
    coveredDays,
    perDay,
    recentPerDay,
    balance,
    runsOut,
    totalToppedUp: round(topUps.filter((t) => t.at.getFullYear() === year).reduce((n, t) => n + t.kwh, 0)),
    unread: photos.filter((p) => !p.reading).length,
    problems: periods.filter((p) => p.problem).length,
    estimatedDates: photos.filter((p) => p.dateSource === "month").length,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
