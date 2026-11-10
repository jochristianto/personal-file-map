import type { MeterPhoto } from "./meters";

/**
 * Electricity used, from a prepaid meter's top-ups. Usage is only measured from one top-up to the next:
 *
 *   used between two top-ups = credit just after the earlier one − credit just before the later one
 *
 * That's exact in kWh whatever the dates. Days, and so kWh a day, need a real capture time at both ends:
 * a photo without one only tells the month it's from (the file name), not the day. Over a run of top-ups,
 * the kWh in between add up exactly, so the daily rate is measured between the top-ups whose time is known,
 * however many undated top-ups lie in between. Nothing is split into calendar months.
 */

export interface Reading {
  kwh: number;
  at: Date;
}

/**
 * One top-up with the photos around it, merged: the credit just before, the kWh added, the credit just
 * after. Its photos are the Before / Input / After of one "#N" of the month, taken within a few hours.
 */
export interface TopUpEvent {
  /**
   * When it happened: the photos' capture time. Without one (`estimated`), worked out from the kWh used
   * since the dated top-ups around it, kept inside the file's month: only good for placing it on a timeline.
   */
  at: Date;
  /** No capture time: only the month is known. */
  estimated: boolean;
  /** "#2" in the file names → 2. */
  txn: number | null;
  before: Reading | null;
  amount: number;
  /** No photo of the amount: worked out as after − before. */
  amountInferred: boolean;
  after: Reading | null;
  /** Credit just after the top-up: the after photo, else before + amount. */
  credit: number | null;
  /** kWh used from just after the previous top-up to just before this one (null for the first one). */
  usedSincePrev: number | null;
  /** Days since the previous top-up: only when both have a capture time. */
  sincePrevDays: number | null;
  perDay: number | null;
  problem: string | null;
}

/** kWh a day, measured between two dated points with only known usage in between. */
export interface Rate {
  perDay: number;
  used: number;
  days: number;
  from: Date;
  to: Date;
}

/** Since the last top-up, up to the latest photo of the credit left. */
export interface SinceLast {
  used: number;
  days: number | null;
  perDay: number | null;
  at: Date;
}

/** How often the meter is topped up and when the next one is due, from past top-ups. */
export interface TopUpFrequency {
  /** Top-ups in the report's year. */
  count: number;
  /** Average days between top-ups, from the first to the last one with a capture time. */
  avgDays: number | null;
  perMonth: number | null;
  avgAmount: number | null;
  /** Average kWh used from one top-up to the next. */
  avgUsed: number | null;
  /** Credit left when you usually top up (median of the "before" readings). */
  usualBefore: number | null;
  last: TopUpEvent | null;
  /** When the credit is down to `usualBefore`, at the average rate. */
  next: Date | null;
  /** The same at the most recent rate, when that differs. */
  nextRecent: Date | null;
}

/** A moment that may only be known to the month. */
export interface Point {
  at: Date;
  estimated: boolean;
}

export interface MeterUsage {
  meter: string;
  photos: MeterPhoto[];
  events: TopUpEvent[];
  sinceLast: SinceLast | null;
  frequency: TopUpFrequency;
  /** kWh used between the first top-up and the latest photo (known stretches only). */
  totalUsed: number;
  cycles: number;
  /** The first and last point of `totalUsed`: a top-up or the latest photo. */
  usedFrom: Point | null;
  usedTo: Point | null;
  /** Over everything measurable. */
  rate: Rate | null;
  /** Over the latest stretch of at least a week between dated photos, when it's not the same as `rate`. */
  recent: Rate | null;
  balance: { kwh: number; at: Date; estimated: boolean } | null;
  /** When the credit at the latest photo is used up, at the average rate. */
  runsOut: Date | null;
  totalToppedUp: number;
  unread: number;
  problems: number;
  estimatedDates: number;
}

/**
 * What a photo shows, as used for the numbers: your correction wins, then "other" (unreadable), then the
 * file's label (Before / After = credit left, Input = kWh added), then what the AI reader said.
 */
export function kindOf(p: MeterPhoto): "balance" | "topup" | "other" | null {
  const r = p.reading;
  if (!r) return null;
  if (r.edited || r.kind === "other") return r.kind;
  return p.label === "input" ? "topup" : "balance";
}

const SHORT_HOURS = 6;
const TOLERANCE = 0.5; // kWh: rounding and a few minutes of use between photos
const DAY = 86_400_000;
const MIN_RECENT_DAYS = 7;

export function meterUsage(meter: string, photos: MeterPhoto[], year: number): MeterUsage {
  const events = topUpEvents(photos);
  const anchors = placeEvents(events);

  // The latest photo of the credit left, plus any top-up photographed after it
  const read = photos.filter((p) => p.reading && kindOf(p) !== "other");
  const lastBal = [...read].reverse().find((p) => kindOf(p) === "balance") ?? null;
  let balance: MeterUsage["balance"] = null;
  if (lastBal) {
    const added = read.filter((p) => kindOf(p) === "topup" && p.takenAt > lastBal.takenAt).reduce((n, p) => n + p.reading!.kwh, 0);
    const estimated = lastBal.dateSource === "month";
    const lastEv = events[events.length - 1];
    // An undated photo of the last top-up: use the top-up's worked-out time rather than the 15th
    const at = estimated && lastEv?.estimated && lastEv.after?.kwh === lastBal.reading!.kwh ? lastEv.at : lastBal.takenAt;
    balance = { kwh: round(lastBal.reading!.kwh + added), at, estimated };
  }

  // Since the last top-up, to the latest photo of the credit left
  const last = events[events.length - 1] ?? null;
  let sinceLast: SinceLast | null = null;
  if (last && last.credit !== null && balance && balance.at.getTime() - last.at.getTime() > SHORT_HOURS * 3_600_000) {
    const used = last.credit - balance.kwh;
    if (used >= -TOLERANCE) {
      const dated = !last.estimated && !balance.estimated;
      const days = dated ? (balance.at.getTime() - last.at.getTime()) / DAY : null;
      sinceLast = { used: round(Math.max(0, used)), days, perDay: days !== null && days >= 0.5 ? Math.max(0, used) / days : null, at: balance.at };
      const end = anchors[anchors.length - 1]; // the last top-up, as it's dated
      if (dated && end) anchors.push({ chain: end.chain, c: end.c + Math.max(0, used), at: balance.at });
    }
  }
  const { rate, recent } = rates(anchors);

  const known = events.filter((e) => e.usedSincePrev !== null);
  const totalUsed = known.reduce((n, e) => n + e.usedSincePrev!, 0) + (sinceLast?.used ?? 0);
  const first = events.find((e) => e.credit !== null);

  // Days between top-ups: from the first to the last dated one, divided by the top-ups in between
  const datedIdx = events.map((e, i) => (e.estimated ? -1 : i)).filter((i) => i >= 0);
  let avgDays: number | null = null;
  if (datedIdx.length >= 2) {
    const a = datedIdx[0];
    const b = datedIdx[datedIdx.length - 1];
    avgDays = (events[b].at.getTime() - events[a].at.getTime()) / DAY / (b - a);
  }
  const befores = events.map((e) => e.before?.kwh).filter((k): k is number => k !== undefined);
  const usualBefore = befores.length ? median(befores) : null;
  const inYear = events.filter((e) => e.at.getFullYear() === year);
  const when = (r: Rate | null, to: number) =>
    balance && r && r.perDay > 0 ? new Date(balance.at.getTime() + (Math.max(0, balance.kwh - to) / r.perDay) * DAY) : null;
  const next = usualBefore !== null ? when(rate, usualBefore) : null;

  return {
    meter,
    photos,
    events,
    sinceLast,
    frequency: {
      count: inYear.length,
      avgDays,
      perMonth: avgDays ? 30.44 / avgDays : null,
      avgAmount: events.length ? events.reduce((n, e) => n + e.amount, 0) / events.length : null,
      avgUsed: known.length ? known.reduce((n, e) => n + e.usedSincePrev!, 0) / known.length : null,
      usualBefore,
      last,
      next,
      nextRecent: usualBefore !== null && recent ? when(recent, usualBefore) : null,
    },
    totalUsed: round(totalUsed),
    cycles: known.length,
    usedFrom: first && known.length ? { at: first.at, estimated: first.estimated } : null,
    usedTo: sinceLast && balance ? { at: balance.at, estimated: balance.estimated } : known.length && last ? { at: last.at, estimated: last.estimated } : null,
    rate,
    recent,
    balance,
    runsOut: when(rate, 0),
    totalToppedUp: round(inYear.reduce((n, e) => n + e.amount, 0)),
    unread: photos.filter((p) => !p.reading).length,
    problems: events.filter((e) => e.problem).length,
    estimatedDates: photos.filter((p) => p.dateSource === "month").length,
  };
}

/**
 * Groups the photos into top-ups. A new top-up starts after a gap of more than SHORT_HOURS, at another
 * "#N" of the month, or at a Before photo after the Input / After of the previous one: photos without a
 * capture time all sit on the 15th, seconds apart, so time alone can't tell #1 from #2.
 */
function topUpEvents(photos: MeterPhoto[]): TopUpEvent[] {
  const readings = photos.filter((p) => p.reading && kindOf(p) !== "other");
  const clusters: MeterPhoto[][] = [];
  for (const p of readings) {
    const cur = clusters[clusters.length - 1];
    const prev = cur?.[cur.length - 1];
    const same =
      prev &&
      p.takenAt.getTime() - prev.takenAt.getTime() <= SHORT_HOURS * 3_600_000 &&
      !(p.txn !== null && prev.txn !== null && p.txn !== prev.txn) &&
      !(p.label === "before" && cur.some((q) => q.label !== "before"));
    if (same) cur.push(p);
    else clusters.push([p]);
  }

  const events: TopUpEvent[] = [];
  for (const c of clusters) {
    const kwhOf = (p: MeterPhoto) => p.reading!.kwh;
    const point = (p: MeterPhoto | undefined) => (p ? { kwh: kwhOf(p), at: p.takenAt } : null);
    const tops: MeterPhoto[] = [];
    for (const p of c) {
      // A meter screen and a receipt of the same top-up: count it once
      if (kindOf(p) === "topup" && !tops.some((t) => Math.abs(kwhOf(t) - kwhOf(p)) < 0.05)) tops.push(p);
    }
    let before: MeterPhoto | undefined;
    let after: MeterPhoto | undefined;
    let amount: number;
    let inferred = false;
    if (tops.length > 0) {
      const first = c.indexOf(tops[0]);
      const lastTop = c.indexOf(tops[tops.length - 1]);
      before = c.slice(0, first).filter((p) => kindOf(p) === "balance").pop();
      after = c.slice(lastTop + 1).find((p) => kindOf(p) === "balance");
      amount = tops.reduce((n, t) => n + kwhOf(t), 0);
    } else {
      // No photo of the amount: the biggest rise between two balance photos is the top-up
      const bals = c.filter((p) => kindOf(p) === "balance");
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
      estimated: c.some((p) => p.dateSource === "month"),
      txn: c[0].txn,
      before: point(before),
      amount: round(amount),
      amountInferred: inferred,
      after: point(after),
      credit: after ? kwhOf(after) : before ? round(kwhOf(before) + amount) : null,
      usedSincePrev: null,
      sincePrevDays: null,
      perDay: null,
      problem,
    });
  }

  // Between two top-ups: the credit just after the previous one, minus the credit just before this one
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const e = events[i];
    if (prev.credit === null || !e.before) continue;
    const used = prev.credit - e.before.kwh;
    if (used < -TOLERANCE) {
      e.problem ??= `Credit went from ${fmt(prev.credit)} to ${fmt(e.before.kwh)} with no top-up in between: a photo may be missing or misread`;
      continue;
    }
    e.usedSincePrev = round(Math.max(0, used));
  }
  return events;
}

/** A dated point on the running total of kWh used, within a run of top-ups with known usage in between. */
interface Anchor {
  chain: number;
  c: number;
  at: Date;
}

/**
 * Days and kWh a day for top-ups that are both dated, and a likely time for undated ones: in proportion to
 * the kWh used between the dated top-ups around them, kept inside their month. Returns the dated points.
 */
function placeEvents(events: TopUpEvent[]): Anchor[] {
  let chain = 0;
  let c = 0;
  const cum = events.map((e, i) => {
    if (i > 0) {
      if (e.usedSincePrev === null) {
        chain++;
        c = 0;
      } else c += e.usedSincePrev;
    }
    return { chain, c };
  });

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.estimated) continue;
    const month = new Date(e.at.getFullYear(), e.at.getMonth(), 1).getTime();
    const monthEnd = new Date(e.at.getFullYear(), e.at.getMonth() + 1, 1).getTime() - 60_000;
    let a = -1;
    let b = -1;
    for (let j = i - 1; j >= 0 && cum[j].chain === cum[i].chain; j--) if (!events[j].estimated) { a = j; break; }
    for (let j = i + 1; j < events.length && cum[j].chain === cum[i].chain; j++) if (!events[j].estimated) { b = j; break; }
    if (a < 0 || b < 0 || cum[b].c <= cum[a].c) continue; // stays mid-month
    const ta = events[a].at.getTime();
    const tb = events[b].at.getTime();
    const t = ta + ((cum[i].c - cum[a].c) / (cum[b].c - cum[a].c)) * (tb - ta);
    const at = new Date(Math.min(monthEnd, Math.max(month, t)));
    e.at = at;
    if (e.before) e.before.at = at;
    if (e.after) e.after.at = at;
  }

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const e = events[i];
    if (prev.estimated || e.estimated) continue;
    e.sincePrevDays = (e.at.getTime() - prev.at.getTime()) / DAY;
    if (e.usedSincePrev === null || !e.before) continue;
    const days = (e.before.at.getTime() - (prev.after ?? prev.before ?? { at: prev.at }).at.getTime()) / DAY;
    e.perDay = days >= 0.5 ? e.usedSincePrev / days : null;
  }

  return events.map((e, i) => ({ ...cum[i], at: e.at, e })).filter((x) => !x.e.estimated).map(({ chain, c, at }) => ({ chain, c, at }));
}

/** The average rate over every run of dated points, and the most recent one over at least a week. */
function rates(anchors: Anchor[]): { rate: Rate | null; recent: Rate | null } {
  const chains = new Map<number, Anchor[]>();
  for (const a of anchors) chains.set(a.chain, [...(chains.get(a.chain) ?? []), a]);
  let used = 0;
  let ms = 0;
  let from: Date | null = null;
  let to: Date | null = null;
  let recent: Rate | null = null;
  for (const list of chains.values()) {
    const a = list[0];
    const b = list[list.length - 1];
    const span = b.at.getTime() - a.at.getTime();
    if (span < DAY) continue;
    used += b.c - a.c;
    ms += span;
    from ??= a.at;
    to = b.at;
    // Back from the latest point to the first one at least a week earlier
    let k = list.length - 2;
    while (k > 0 && b.at.getTime() - list[k].at.getTime() < MIN_RECENT_DAYS * DAY) k--;
    const days = (b.at.getTime() - list[k].at.getTime()) / DAY;
    recent = { perDay: (b.c - list[k].c) / days, used: round(b.c - list[k].c), days, from: list[k].at, to: b.at };
  }
  const rate = ms > 0 && from && to ? { perDay: used / (ms / DAY), used: round(used), days: ms / DAY, from, to } : null;
  if (rate && recent && recent.from.getTime() === rate.from.getTime()) recent = null;
  return { rate, recent };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
