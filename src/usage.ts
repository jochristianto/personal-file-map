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
 *
 * A top-up with only payment files (no meter photos) is still a top-up: at the payment's date, with the kWh
 * from its Payment Receipt. Its credit before and after are estimated: the kWh used between the top-ups
 * around it is still exact, and is split between the two stretches by time.
 */

/** What a top-up cost, as read from its Payment file (or its receipt). `currency` is "" when none was shown. */
export interface Paid {
  amount: number;
  currency: string;
  file: string;
}

/** A top-up known only from its Payment / Payment Receipt files (see paymentOnlyTopUps in meters.ts). */
export interface PaymentTopUp {
  meter: string;
  at: Date;
  /** No date read from its files: placed mid-month. */
  estimated: boolean;
  txn: number | null;
  /** kWh bought, from the receipt; null when not known. */
  amount: number | null;
  paid: Paid | null;
  files: string[];
}

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
  /** What it cost, from its Payment file; null when there's none or it isn't read yet. */
  paid: Paid | null;
  /** No meter photos, only payment files (`files`): before and after are estimated. */
  paymentOnly: boolean;
  files: string[];
  /** The kWh added came from the Payment Receipt (no Input photo). */
  amountFromReceipt: boolean;
  /** Payment only, and no kWh on its files: `amount` is 0 (or estimated from the usage, see amountInferred). */
  amountUnknown: boolean;
  beforeEstimated: boolean;
  afterEstimated: boolean;
  /** usedSincePrev rests on an estimated credit (a payment-only top-up on either side). */
  usedEstimated: boolean;
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

/** Money spent on the year's top-ups in one currency (normally the only one). */
export interface Spending {
  currency: string;
  amount: number;
  topUps: number;
  /** Price per kWh, over the top-ups whose kWh bought is known too. */
  perKwh: number | null;
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
  /** `kwhEstimated`: worked out for a payment-only top-up after the latest photo. */
  balance: { kwh: number; at: Date; estimated: boolean; kwhEstimated?: boolean } | null;
  /** When the credit at the latest photo is used up, at the average rate. */
  runsOut: Date | null;
  totalToppedUp: number;
  /** Spent on the year's top-ups, per currency, most spent first; empty when no amount is known. */
  spent: Spending[];
  /** The year's top-ups without an amount paid (no Payment file, or not read yet). */
  spentUnknown: number;
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

export function meterUsage(meter: string, photos: MeterPhoto[], year: number, paymentOnly: PaymentTopUp[] = []): MeterUsage {
  const events = topUpEvents(photos, paymentOnly);
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
  // A payment-only top-up after the latest photo: its estimated credit is the latest known
  const lastEv = events[events.length - 1];
  if (lastEv?.paymentOnly && lastEv.credit !== null && (!balance || lastEv.at > balance.at)) {
    balance = { kwh: lastEv.credit, at: lastEv.at, estimated: lastEv.estimated, kwhEstimated: true };
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
  const befores = events.filter((e) => !e.beforeEstimated).map((e) => e.before?.kwh).filter((k): k is number => k !== undefined);
  const usualBefore = befores.length ? median(befores) : null;
  const inYear = events.filter((e) => e.at.getFullYear() === year);
  const amounts = events.filter((e) => !e.amountUnknown);
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
      avgAmount: amounts.length ? amounts.reduce((n, e) => n + e.amount, 0) / amounts.length : null,
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
    totalToppedUp: round(inYear.filter((e) => !e.amountUnknown).reduce((n, e) => n + e.amount, 0)),
    spent: spending(inYear),
    spentUnknown: inYear.filter((e) => !e.paid).length,
    unread: photos.filter((p) => !p.reading).length,
    problems: events.filter((e) => e.problem).length,
    estimatedDates: photos.filter((p) => p.dateSource === "month").length,
  };
}

/** The amounts paid for these top-ups, added up per currency. */
function spending(events: TopUpEvent[]): Spending[] {
  const by = new Map<string, { amount: number; topUps: number; priced: number; kwh: number }>();
  for (const e of events) {
    if (!e.paid) continue;
    const t = by.get(e.paid.currency) ?? { amount: 0, topUps: 0, priced: 0, kwh: 0 };
    t.amount += e.paid.amount;
    t.topUps++;
    if (!e.amountUnknown && e.amount > 0) {
      t.priced += e.paid.amount;
      t.kwh += e.amount;
    }
    by.set(e.paid.currency, t);
  }
  return [...by]
    .map(([currency, t]) => ({ currency, amount: Math.round(t.amount * 100) / 100, topUps: t.topUps, perKwh: t.kwh > 0 ? t.priced / t.kwh : null }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Groups the photos into top-ups. A new top-up starts after a gap of more than SHORT_HOURS, at another
 * "#N" of the month, or at a Before photo after the Input / After of the previous one: photos without a
 * capture time all sit on the 15th, seconds apart, so time alone can't tell #1 from #2.
 */
function topUpEvents(photos: MeterPhoto[], paymentOnly: PaymentTopUp[]): TopUpEvent[] {
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
    let fromReceipt = false;
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
      const bought = c.find((p) => p.bought)?.bought;
      if (best >= 0) {
        before = bals[best];
        after = bals[best + 1];
        amount = kwhOf(after) - kwhOf(before);
        inferred = true;
      } else if (bought) {
        // No photo of the amount and no rise to work it out from: the kWh on the Payment Receipt
        before = bals.filter((p) => p.label === "before").pop();
        after = bals.find((p) => p.label === "after");
        amount = bought.kwh;
        fromReceipt = true;
      } else continue; // just balance readings, not a top-up
    }
    let problem: string | null = null;
    if (before && after && !inferred && !fromReceipt && Math.abs(kwhOf(before) + amount - kwhOf(after)) > TOLERANCE) {
      problem = `${fmt(kwhOf(before))} + ${fmt(amount)} isn't ${fmt(kwhOf(after))}: check these photos`;
    }
    events.push({
      at: tops[0]?.takenAt ?? after?.takenAt ?? before!.takenAt,
      estimated: c.some((p) => p.dateSource === "month"),
      txn: c[0].txn,
      paid: c.find((p) => p.paid)?.paid ?? null,
      before: point(before),
      amount: round(amount),
      amountInferred: inferred,
      after: point(after),
      credit: after ? kwhOf(after) : before ? round(kwhOf(before) + amount) : null,
      paymentOnly: false,
      files: [],
      amountFromReceipt: fromReceipt,
      amountUnknown: false,
      beforeEstimated: false,
      afterEstimated: false,
      usedEstimated: false,
      usedSincePrev: null,
      sincePrevDays: null,
      perDay: null,
      problem,
    });
  }

  for (const t of paymentOnly) {
    events.push({
      at: t.at, estimated: t.estimated, txn: t.txn, paid: t.paid, before: null, amount: t.amount ?? 0, amountInferred: false, after: null, credit: null,
      paymentOnly: true, files: t.files, amountFromReceipt: t.amount !== null, amountUnknown: t.amount === null,
      beforeEstimated: false, afterEstimated: false, usedEstimated: false, usedSincePrev: null, sincePrevDays: null, perDay: null, problem: null,
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  estimatePaymentOnly(events);

  // Between two top-ups: the credit just after the previous one, minus the credit just before this one
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const e = events[i];
    if (prev.credit === null || !e.before) continue;
    const used = prev.credit - e.before.kwh;
    e.usedEstimated = prev.afterEstimated || e.beforeEstimated;
    if (used < -TOLERANCE) {
      e.problem ??= `Credit went from ${fmt(prev.credit)} to ${fmt(e.before.kwh)} with no top-up in between: a photo may be missing or misread`;
      continue;
    }
    e.usedSincePrev = round(Math.max(0, used));
  }
  return events;
}

/** When a reading was taken: the photo's time, or the top-up's. */
const timeOf = (r: Reading | null, e: TopUpEvent) => (r ?? { at: e.at }).at.getTime();

/**
 * kWh a day between top-ups with photos on both sides, counting the kWh of payment-only top-ups in between:
 * a first guess, used only to estimate a payment-only top-up with a known credit on one side only.
 */
function roughRate(events: TopUpEvent[]): number | null {
  let used = 0;
  let ms = 0;
  let from = -1;
  let between = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.paymentOnly) {
      if (e.amountUnknown) from = -1;
      else between += e.amount;
      continue;
    }
    const a = from >= 0 ? events[from] : null;
    if (a && a.credit !== null && e.before && !a.estimated && !e.estimated) {
      const u = a.credit + between - e.before.kwh;
      const dt = e.before.at.getTime() - timeOf(a.after ?? a.before, a);
      if (u >= 0 && dt >= DAY) {
        used += u;
        ms += dt;
      }
    }
    from = i;
    between = 0;
  }
  return ms > 0 ? used / (ms / DAY) : null;
}

/**
 * The credit before and after each payment-only top-up. With a known credit on both sides, the kWh used
 * from the previous top-up to the next is exact (credit after the previous + kWh bought − credit before the
 * next); it's split between the two stretches by time. With one side only, at the usual kWh a day. A
 * payment-only top-up without its kWh gets it as after − before, when both can be estimated.
 */
function estimatePaymentOnly(events: TopUpEvent[]) {
  if (!events.some((e) => e.paymentOnly)) return;
  const rate = roughRate(events);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.paymentOnly) continue;
    const prev = i > 0 && events[i - 1].credit !== null ? events[i - 1] : null;
    // The next top-up with a photo of the credit before it, and the kWh of payment-only top-ups on the way
    let next: TopUpEvent | null = null;
    let between = 0;
    for (let j = i + 1; j < events.length; j++) {
      const n = events[j];
      if (!n.paymentOnly) {
        next = n.before ? n : null;
        break;
      }
      if (n.amountUnknown) break;
      between += n.amount;
    }
    const te = e.at.getTime();
    const tp = prev ? timeOf(prev.after ?? prev.before, prev) : 0;
    const tn = next ? timeOf(next.before, next) : 0;
    const days = (a: number, b: number) => Math.max(0, b - a) / DAY;
    let before: number | null = null;
    let after: number | null = null;
    if (!e.amountUnknown) {
      if (prev && next && tn > tp) {
        const total = prev.credit! + e.amount + between - next.before!.kwh;
        if (total < -TOLERANCE) e.problem = `${fmt(prev.credit!)} + ${fmt(e.amount + between)} bought isn't enough for the ${fmt(next.before!.kwh)} left before the next top-up: check the receipt`;
        const share = Math.min(1, Math.max(0, (te - tp) / (tn - tp)));
        before = Math.max(0, prev.credit! - Math.max(0, total) * share);
      } else if (prev && rate !== null) {
        before = Math.max(0, prev.credit! - rate * days(tp, te));
      } else if (next && rate !== null && between === 0) {
        after = next.before!.kwh + rate * days(te, tn);
        before = Math.max(0, after - e.amount);
      }
      if (before !== null) after = before + e.amount;
    } else if (rate !== null) {
      if (prev) before = Math.max(0, prev.credit! - rate * days(tp, te));
      if (next && between === 0) after = next.before!.kwh + rate * days(te, tn);
      if (before !== null && after !== null && after > before) {
        e.amount = round(after - before);
        e.amountInferred = true;
      } else after = null; // the credit after is unknown without the kWh bought
    }
    if (before !== null) [e.before, e.beforeEstimated] = [{ kwh: round(before), at: e.at }, true];
    if (after !== null) [e.after, e.afterEstimated, e.credit] = [{ kwh: round(after), at: e.at }, true, round(after)];
  }
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
