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
  /** The whole month at the measured rate, when readings cover only part of it (at least 3 days). */
  fullMonth: number | null;
  toppedUp: number;
  topUps: number;
}

/**
 * One top-up with the photos around it, merged: the balance just before, the kWh added, the balance just
 * after. Photos taken within a few hours of each other belong to the same top-up.
 */
export interface TopUpEvent {
  /** When the top-up happened: the top-up photo's time, else the after photo's, else the before photo's. */
  at: Date;
  before: { kwh: number; at: Date } | null;
  amount: number;
  /** No photo of the amount: worked out as after − before. */
  amountInferred: boolean;
  after: { kwh: number; at: Date } | null;
  /** Days since the previous top-up (null for the first one). */
  sincePrevDays: number | null;
  /** kWh used from just after the previous top-up to just before this one. */
  usedSincePrev: number | null;
  perDay: number | null;
  problem: string | null;
  estimated: boolean;
}

/** How often the meter is topped up, from the top-ups of the year. */
export interface TopUpFrequency {
  count: number;
  avgDays: number | null;
  minDays: number | null;
  maxDays: number | null;
  avgAmount: number | null;
  perMonth: number | null;
  last: TopUpEvent | null;
  /** The last top-up plus the usual interval. */
  nextAround: Date | null;
}

export interface MeterUsage {
  meter: string;
  photos: MeterPhoto[];
  periods: Period[];
  topUps: TopUp[];
  events: TopUpEvent[];
  frequency: TopUpFrequency;
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

  const months: MonthUsage[] = Array.from({ length: 12 }, () => ({ used: null, days: 0, fullMonth: null, toppedUp: 0, topUps: 0 }));
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

  for (let m = 0; m < 12; m++) {
    const mu = months[m];
    const inMonth = new Date(year, m + 1, 0).getDate();
    if (mu.used !== null && mu.days >= 3 && mu.days < inMonth - 0.5) mu.fullMonth = (mu.used / mu.days) * inMonth;
  }
  const events = topUpEvents(photos);
  for (const e of events) if (e.at.getFullYear() === year) months[e.at.getMonth()].topUps++;

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
    events,
    frequency: frequency(events.filter((e) => e.at.getFullYear() === year)),
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

const DAY = 86_400_000;

/** Groups the photos into top-ups: before / amount / after photos taken within SHORT_HOURS of each other. */
function topUpEvents(photos: MeterPhoto[]): TopUpEvent[] {
  const readings = photos.filter((p) => p.reading && p.reading.kind !== "other");
  const clusters: MeterPhoto[][] = [];
  for (const p of readings) {
    const cur = clusters[clusters.length - 1];
    if (cur && p.takenAt.getTime() - cur[cur.length - 1].takenAt.getTime() <= SHORT_HOURS * 3_600_000) cur.push(p);
    else clusters.push([p]);
  }

  const events: TopUpEvent[] = [];
  for (const c of clusters) {
    const kwhOf = (p: MeterPhoto) => p.reading!.kwh;
    const point = (p: MeterPhoto | undefined) => (p ? { kwh: kwhOf(p), at: p.takenAt } : null);
    const estimated = c.some((p) => p.dateSource === "month");
    const tops: MeterPhoto[] = [];
    for (const p of c) {
      // A meter screen and a receipt of the same top-up: count it once
      if (p.reading!.kind === "topup" && !tops.some((t) => Math.abs(kwhOf(t) - kwhOf(p)) < 0.05)) tops.push(p);
    }
    let before: MeterPhoto | undefined;
    let after: MeterPhoto | undefined;
    let amount: number;
    let inferred = false;
    if (tops.length > 0) {
      const first = c.indexOf(tops[0]);
      const lastTop = c.indexOf(tops[tops.length - 1]);
      before = c.slice(0, first).filter((p) => p.reading!.kind === "balance").pop();
      after = c.slice(lastTop + 1).find((p) => p.reading!.kind === "balance");
      amount = tops.reduce((n, t) => n + kwhOf(t), 0);
    } else {
      // No photo of the amount: the biggest rise between two balance photos is the top-up
      const bals = c.filter((p) => p.reading!.kind === "balance");
      let best = -1;
      for (let i = 0; i + 1 < bals.length; i++) {
        const rise = kwhOf(bals[i + 1]) - kwhOf(bals[i]);
        if (rise > 0.05 && (best < 0 || rise > kwhOf(bals[best + 1]) - kwhOf(bals[best]))) best = i;
      }
      if (best < 0) continue; // just balance readings, not a top-up
      before = bals[best];
      after = bals[best + 1];
      amount = kwhOf(after) - kwhOf(before);
      inferred = true;
    }
    let problem: string | null = null;
    if (before && after && !inferred && Math.abs(kwhOf(before) + amount - kwhOf(after)) > TOLERANCE) {
      problem = `${fmt(kwhOf(before))} + ${fmt(amount)} isn't ${fmt(kwhOf(after))}: check these photos`;
    }
    events.push({
      at: tops[0]?.takenAt ?? after?.takenAt ?? before!.takenAt,
      before: point(before),
      amount: round(amount),
      amountInferred: inferred,
      after: point(after),
      sincePrevDays: null,
      usedSincePrev: null,
      perDay: null,
      problem,
      estimated,
    });
  }

  // Between two top-ups: the balance just after the previous one, minus the balance just before this one
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const e = events[i];
    e.sincePrevDays = (e.at.getTime() - prev.at.getTime()) / DAY;
    const start = prev.after ?? (prev.before ? { kwh: prev.before.kwh + prev.amount, at: prev.at } : null);
    if (!start || !e.before) continue;
    const used = start.kwh - e.before.kwh;
    if (used < -TOLERANCE) {
      e.problem ??= `Balance went from ${fmt(start.kwh)} to ${fmt(e.before.kwh)} with no top-up in between: a photo may be missing or misread`;
      continue;
    }
    const days = (e.before.at.getTime() - start.at.getTime()) / DAY;
    e.usedSincePrev = round(Math.max(0, used));
    e.perDay = days >= 0.5 ? e.usedSincePrev / days : null;
  }
  return events;
}

function frequency(events: TopUpEvent[]): TopUpFrequency {
  const gaps = events.map((e) => e.sincePrevDays).filter((d): d is number => d !== null);
  const avgDays = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const last = events[events.length - 1] ?? null;
  return {
    count: events.length,
    avgDays,
    minDays: gaps.length ? Math.min(...gaps) : null,
    maxDays: gaps.length ? Math.max(...gaps) : null,
    avgAmount: events.length ? events.reduce((n, e) => n + e.amount, 0) / events.length : null,
    perMonth: avgDays ? 30.44 / avgDays : null,
    last,
    nextAround: last && avgDays ? new Date(last.at.getTime() + avgDays * DAY) : null,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
