import {
  RULES,
  rsiWilder,
  atrWilder,
  findDivergences,
  evaluateSetup,
  ema,
} from "./signals.js";
export const PROFILES = [
  {
    id: "defensive",
    label: "Low risk · low return",
    risk: 0.25,
    targetR: 1.5,
    minVolume: 1.2,
    trend: true,
    maxSpread: 3,
    note: "Strict trend, volume and event filters. Modest target; fewer setups.",
  },
  {
    id: "steady",
    label: "Low risk · mild return",
    risk: 0.5,
    targetR: 2,
    minVolume: 1.1,
    trend: true,
    maxSpread: 4,
    note: "Strict confirmation with a larger target. Returns remain uncertain.",
  },
  {
    id: "patient",
    label: "Low risk · high return",
    risk: 0.5,
    targetR: 3,
    minVolume: 1.2,
    trend: true,
    maxSpread: 3,
    note: "A high-return aspiration with low risk tolerance; many setups may be rejected.",
  },
  {
    id: "balanced",
    label: "Mild risk · high return",
    risk: 1,
    targetR: 3,
    minVolume: 1,
    trend: true,
    maxSpread: 6,
    note: "Trend-aligned setups and a more ambitious target.",
  },
  {
    id: "active",
    label: "High risk · high returns",
    risk: 2,
    targetR: 3,
    minVolume: 0.8,
    trend: false,
    maxSpread: 10,
    note: "Less restrictive filters. Higher loss exposure; no higher win rate is implied.",
  },
];
export const profileFor = (id) =>
  PROFILES.find((p) => p.id === id) || PROFILES[0];
export function heikinAshi(candles) {
  let previous;
  return candles.map((c) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = previous
      ? (previous.open + previous.close) / 2
      : (c.open + c.close) / 2;
    const bar = {
      ...c,
      open,
      close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
    };
    previous = bar;
    return bar;
  });
}
export function enrichment(data) {
  if (data.status !== "ready") return { ...data, early: null, hourly: null };
  const { candles, rsi } = data,
    atr = atrWilder(candles);
  const earlyEvents = findDivergences(candles, rsi, {
    ...RULES,
    pivotRight: 1,
  });
  const candidate = earlyEvents.at(-1);
  let early =
    candidate && candidate.second > candles.length - 4
      ? evaluateSetup(candidate, candles, atr)
      : null;
  if (early && !["watch", "triggered"].includes(early.state)) early = null;
  // Construct only complete UTC hourly bars from twelve consecutive closed five-minute bars.
  const buckets = new Map();
  for (const c of candles) {
    const h = Math.floor(c.time / 3600) * 3600;
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h).push(c);
  }
  const hours = [...buckets.entries()]
    .filter(
      ([h, cs]) =>
        cs.length === 12 && cs[0].time === h && cs.at(-1).time === h + 3300,
    )
    .map(([time, cs]) => ({ time, close: cs.at(-1).close }));
  const hourly =
    hours.length >= 20
      ? {
          ema20: ema(
            hours.map((c) => c.close),
            20,
          ),
          close: hours.at(-1).close,
          bars: hours.length,
          time: hours.at(-1).time,
        }
      : null;
  return { ...data, early, hourly };
}
export function eventWindow(research, now = Date.now()) {
  const calendar =
    research?.sources?.filter((s) => s.kind === "calendar") || [];
  const fresh = ["bls-calendar", "fed-calendar"].every((id) =>
    calendar.some(
      (s) =>
        s.id === id &&
        s.status === "ok" &&
        Number.isFinite(s.checkedAt) &&
        now - s.checkedAt >= -60000 &&
        now - s.checkedAt <= 30 * 60000,
    ),
  );
  const events = (research?.events || []).filter(
    (e) =>
      e.priority === "major" &&
      (e.timePrecision === "day"
        ? e.date ===
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/New_York",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(now)
        : Math.abs(e.at - now) <= 30 * 60000),
  );
  return { fresh, events };
}
export function assessSetup(
  data,
  profileId,
  instrument = "spot",
  research,
  now = Date.now(),
) {
  const profile = profileFor(profileId),
    active = data?.active;
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  const fresh =
    data?.status === "ready" &&
    Number.isFinite(data.receivedAt) &&
    now - data.receivedAt <= 8000;
  add(
    "Exchange feed",
    fresh,
    fresh
      ? "Fresh, consecutive closed candles"
      : "Fresh exchange data required",
  );
  add(
    "Confirmed divergence",
    !!active,
    active
      ? `${active.direction} · ${active.state}`
      : "No active confirmed setup",
  );
  add(
    "Closed breakout",
    active?.state === "triggered",
    active?.state === "triggered"
      ? "Breakout observed on a closed candle"
      : "Wait for a subsequent closed breakout",
  );
  const direction = active?.direction;
  const current = data?.currentCandle;
  const validCurrent =
    !!current &&
    [
      current.open,
      current.high,
      current.low,
      current.close,
      current.time,
    ].every(Number.isFinite) &&
    current.low > 0 &&
    current.high >= Math.max(current.open, current.close) &&
    current.low <= Math.min(current.open, current.close) &&
    current.time * 1000 > data.lastCandleAt;
  const invalidated =
    validCurrent &&
    active &&
    (direction === "bull"
      ? current.low <= active.stop
      : current.high >= active.stop);
  add(
    "Live invalidation",
    validCurrent && !invalidated,
    !validCurrent
      ? "Current exchange bar unavailable"
      : invalidated
        ? "Current bar crossed the invalidation level"
        : "Current bar has not crossed invalidation",
  );
  const near =
    validCurrent &&
    Number.isFinite(active?.entry) &&
    Number.isFinite(data?.atr) &&
    Math.abs(current.close - active.entry) <= data.atr * 0.5;
  add(
    "Entry proximity",
    near,
    "Current observed price must be within 0.5 ATR of breakout close; no chasing",
  );

  add(
    "Market direction",
    instrument === "perp" || direction === "bull",
    instrument === "spot"
      ? "Spot entries are long only; bearish means avoid / reassess holdings"
      : "Perpetual long / short analysis",
  );
  const hour = data?.hourly;
  const aligned =
    !!hour &&
    (direction === "bull"
      ? hour.close > hour.ema20 && data.ema20 > data.ema50
      : hour.close < hour.ema20 && data.ema20 < data.ema50);
  add(
    "5m + 1h trend",
    !profile.trend || aligned,
    !profile.trend
      ? "Not required by this profile"
      : !hour
        ? "Need 20 complete hourly candles"
        : aligned
          ? "Both trends align"
          : "Trend alignment missing",
  );
  add(
    "Volume participation",
    Number.isFinite(data?.relativeVolume) &&
      data.relativeVolume >= profile.minVolume,
    `Require ≥${profile.minVolume.toFixed(1)}× previous 20-bar mean`,
  );
  const book = data?.depth;
  add(
    "Liquidity spread",
    !!book && book.spreadBps <= profile.maxSpread,
    `Require ≤${profile.maxSpread} bps; missing book fails this check`,
  );
  const calendar = eventWindow(research, now);
  add(
    "Scheduled event window",
    calendar.fresh && calendar.events.length === 0,
    !calendar.fresh
      ? "Calendar coverage unavailable or >30m old"
      : calendar.events.length
        ? calendar.events.map((e) => e.title).join(" · ")
        : "No covered major release within ±30m / FOMC day",
  );
  if (instrument === "perp")
    add(
      "Perpetual market context",
      !!data?.derivatives && now - data.derivatives.asOf <= 60000,
      "Venue funding, mark, open interest and oracle must be fresh",
    );
  const risk =
    active?.entry && active?.stop ? Math.abs(active.entry - active.stop) : null;
  const target = risk
    ? direction === "bull"
      ? active.entry + profile.targetR * risk
      : active.entry - profile.targetR * risk
    : null;
  const subsequent = Number.isInteger(active?.entryIndex)
    ? (data?.candles || []).slice(active.entryIndex + 1)
    : [];
  const targetReached =
    Number.isFinite(target) &&
    [...subsequent, ...(validCurrent ? [current] : [])].some((c) =>
      direction === "bull" ? c.high >= target : c.low <= target,
    );
  add(
    "Target still ahead",
    Number.isFinite(target) && !targetReached,
    targetReached
      ? "The profile target was already touched; do not recycle this entry"
      : "A triggered target must not already have been reached",
  );
  const eligible = checks.every((c) => c.pass);
  return {
    profile,
    checks,
    eligible,
    passed: checks.filter((c) => c.pass).length,
    reference: active?.entry || null,
    stop: active?.stop || null,
    target,
    riskPct: risk ? (risk / active.entry) * 100 : null,
  };
}
export function positionReference(equity, entry, stop, profileId) {
  if (
    ![equity, entry, stop].every(Number.isFinite) ||
    equity <= 0 ||
    entry <= 0 ||
    stop <= 0 ||
    entry === stop
  )
    return null;
  const riskBudget = (equity * profileFor(profileId).risk) / 100,
    units = riskBudget / Math.abs(entry - stop);
  return { riskBudget, units, notional: units * entry };
}
export function alignedCorrelation(reference, other, limit = 60) {
  const byDay = (cs) =>
    new Map(
      cs
        .filter((c) => Number.isFinite(c.close) && c.close > 0)
        .map((c) => [
          new Date(c.time * 1000).toISOString().slice(0, 10),
          c.close,
        ]),
    );
  const a = byDay(reference),
    b = byDay(other),
    days = [...a.keys()]
      .filter((d) => b.has(d))
      .sort()
      .slice(-limit - 1),
    x = [],
    y = [];
  for (let i = 1; i < days.length; i++) {
    x.push(Math.log(a.get(days[i]) / a.get(days[i - 1])));
    y.push(Math.log(b.get(days[i]) / b.get(days[i - 1])));
  }
  if (x.length < 20) return { n: x.length, pearson: null };
  const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length,
    mx = mean(x),
    my = mean(y);
  const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0),
    vx = x.reduce((s, v) => s + (v - mx) ** 2, 0),
    vy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return {
    n: x.length,
    pearson: vx && vy ? cov / Math.sqrt(vx * vy) : null,
    from: days[0],
    to: days.at(-1),
  };
}
// Fixed-rule chronological spot research. Entry is next bar open, after signal close.
// No parameter search; one position at a time; stop wins ambiguous bars; adverse gaps fill at open.
export function backtestSpot(
  candles,
  { from = 0, feeBps = 10, slippageBps = 5 } = {},
) {
  const rsi = rsiWilder(candles.map((c) => c.close)),
    atr = atrWilder(candles),
    events = findDivergences(candles, rsi).filter(
      (e) => e.direction === "bull",
    );
  const trades = [];
  let freeAfter = -1;
  for (const e of events) {
    if (
      e.confirmed < 100 ||
      candles[e.confirmed].time * 1000 < from ||
      e.confirmed <= freeAfter
    )
      continue;
    const stop = candles[e.second].low - atr[e.confirmed] * 0.25,
      trigger = candles[e.confirmed].high;
    for (
      let i = e.confirmed + 1;
      i <= Math.min(candles.length - 2, e.confirmed + RULES.expiryBars);
      i++
    ) {
      if (candles[i].low <= stop) break;
      if (candles[i].close <= trigger) continue;
      const next = candles[i + 1],
        entry = next.open * (1 + slippageBps / 10000),
        risk = entry - stop;
      if (risk <= 0) break;
      const target = entry + 2 * risk;
      let exit = null,
        exitIndex = null,
        reason = null;
      for (
        let j = i + 1;
        j < Math.min(candles.length, i + 1 + RULES.expiryBars);
        j++
      ) {
        const c = candles[j];
        if (c.low <= stop) {
          exit = Math.min(stop, c.open);
          reason = "stop";
        } else if (c.high >= target) {
          exit = target;
          reason = "target";
        } else if (j === i + RULES.expiryBars) {
          exit = c.close;
          reason = "time";
        }
        if (exit !== null) {
          exitIndex = j;
          break;
        }
      }
      if (exit === null) break;
      exit *= 1 - slippageBps / 10000;
      const pnl = exit - entry - ((entry + exit) * feeBps) / 10000;
      trades.push({
        at: next.time * 1000,
        exitAt: candles[exitIndex].closeTime,
        entry,
        exit,
        stop,
        target,
        r: pnl / risk,
        reason,
      });
      freeAfter = exitIndex;
      break;
    }
  }
  const n = trades.length,
    wins = trades.filter((t) => t.r > 0).length;
  let curve = 0,
    peak = 0,
    maxDrawdownR = 0;
  for (const t of trades) {
    curve += t.r;
    peak = Math.max(peak, curve);
    maxDrawdownR = Math.max(maxDrawdownR, peak - curve);
  }
  return {
    n,
    wins,
    winRate: n ? wins / n : null,
    expectancyR: n ? curve / n : null,
    netR: curve,
    maxDrawdownR,
    feeBps,
    slippageBps,
    trades,
  };
}
