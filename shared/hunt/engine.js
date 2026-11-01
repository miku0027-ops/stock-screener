// One causal rules engine for live scans and chronological research.
export const PROTOCOL = "sharpnex-hunt-v1";
export const DEFAULT_RULE = Object.freeze({
  right: 2,
  delta: 3,
  targetR: 2,
  volume: 0.8,
});
export const COSTS = Object.freeze({
  spot: { feeBps: 10, slippageBps: 2, halfSpreadBps: 0.5, fundingBps: 0 },
  perp: { feeBps: 5, slippageBps: 2, halfSpreadBps: 0.5, fundingBps: 1 },
});
export const CANDIDATES = [1, 2].flatMap((right) =>
  [3, 5].flatMap((delta) =>
    [1.5, 2, 3].flatMap((targetR) =>
      [0.8, 1.2].map((volume) => ({ right, delta, targetR, volume })),
    ),
  ),
);
export function columns(candles) {
  const d = { n: candles.length };
  for (const k of ["time", "open", "high", "low", "close", "volume"])
    d[k] = Float64Array.from(candles, (c) => c[k]);
  return d;
}
export function indicators(d, seconds = 60) {
  const { n, close: c, high: h, low: l, volume: v, time: t } = d;
  const rsi = new Float64Array(n).fill(NaN),
    atr = new Float64Array(n).fill(NaN),
    fast = new Float64Array(n).fill(NaN),
    slow = new Float64Array(n).fill(NaN),
    rv = new Float64Array(n).fill(NaN),
    age = new Uint32Array(n);
  let gain = 0,
    loss = 0,
    tr = 0,
    ef = 0,
    es = 0,
    sum = 0,
    start = 0;
  for (let i = 0; i < n; i++) {
    const valid =
      [c[i], h[i], l[i], d.open[i], v[i], t[i]].every(Number.isFinite) &&
      l[i] > 0 &&
      h[i] >= Math.max(c[i], d.open[i]) &&
      l[i] <= Math.min(c[i], d.open[i]) &&
      v[i] >= 0;
    if (!valid) {
      start = i + 1;
      gain = loss = tr = sum = 0;
      continue;
    }
    if (i === start || i === 0 || t[i] - t[i - 1] !== seconds) {
      start = i;
      gain = loss = tr = sum = 0;
      ef = es = c[i];
    }
    age[i] = i - start;
    const a = i - start;
    ef += (2 / 21) * (c[i] - ef);
    es += (2 / 51) * (c[i] - es);
    fast[i] = ef;
    slow[i] = es;
    if (a >= 20) {
      rv[i] = sum > 0 ? v[i] / (sum / 20) : NaN;
      sum -= v[i - 20];
    }
    sum += v[i];
    if (!a) continue;
    const diff = c[i] - c[i - 1],
      g = Math.max(0, diff),
      lossNow = Math.max(0, -diff),
      range = Math.max(
        h[i] - l[i],
        Math.abs(h[i] - c[i - 1]),
        Math.abs(l[i] - c[i - 1]),
      );
    if (a <= 14) {
      gain += g;
      loss += lossNow;
      tr += range;
      if (a === 14) {
        gain /= 14;
        loss /= 14;
        tr /= 14;
      }
    } else {
      gain = (gain * 13 + g) / 14;
      loss = (loss * 13 + lossNow) / 14;
      tr = (tr * 13 + range) / 14;
    }
    if (a >= 14) {
      rsi[i] =
        loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
      atr[i] = tr;
    }
  }
  return { rsi, atr, fast, slow, rv, age };
}
export function divergences(d, ind, rule = DEFAULT_RULE) {
  const out = [];
  let previousLow = -1,
    previousHigh = -1;
  for (let i = rule.right + 3; i < d.n; i++) {
    if (ind.age[i] < 80) {
      previousLow = previousHigh = -1;
      continue;
    }
    const p = i - rule.right;
    for (const direction of [1, -1]) {
      const values = direction === 1 ? d.low : d.high;
      let pivot = true;
      for (let j = p - 3; j <= i; j++)
        if (
          j !== p &&
          (direction === 1 ? values[j] <= values[p] : values[j] >= values[p])
        ) {
          pivot = false;
          break;
        }
      if (!pivot) continue;
      const prev = direction === 1 ? previousLow : previousHigh;
      if (direction === 1) previousLow = p;
      else previousHigh = p;
      if (
        prev < 0 ||
        p - prev < 5 ||
        p - prev > 60 ||
        !Number.isFinite(ind.rsi[prev])
      )
        continue;
      const priceMove = (direction * (values[prev] - values[p])) / values[prev],
        rsiMove = direction * (ind.rsi[p] - ind.rsi[prev]);
      const extreme =
        direction === 1
          ? Math.min(ind.rsi[p], ind.rsi[prev]) <= 40
          : Math.max(ind.rsi[p], ind.rsi[prev]) >= 60;
      if (priceMove >= 0.0005 && rsiMove >= rule.delta && extreme)
        out.push({
          direction,
          pivot: p,
          previous: prev,
          confirmed: i,
          trigger: direction === 1 ? d.high[i] : d.low[i],
          stop: values[p] - direction * 0.25 * ind.atr[i],
          rsiDelta: rsiMove,
        });
    }
  }
  return out;
}
export function costFraction(venue = "spot", spreadBps, stress = 1) {
  const c = COSTS[venue];
  return (
    ((2 * c.feeBps +
      2 * c.slippageBps +
      (Number.isFinite(spreadBps)
        ? Math.max(0, spreadBps)
        : 2 * c.halfSpreadBps) +
      c.fundingBps) *
      stress) /
    10000
  );
}
export function executionCost(
  entry,
  exit,
  venue = "spot",
  spreadBps,
  stress = 1,
) {
  const funding = (COSTS[venue].fundingBps * stress) / 10000;
  const perSide = (costFraction(venue, spreadBps, stress) - funding) / 2;
  return (entry + exit) * perSide + entry * funding;
}
export function plan(
  entry,
  stop,
  direction,
  targetR,
  venue = "spot",
  spreadBps,
  stress = 1,
  targetOverride,
) {
  const distance = direction * (entry - stop),
    cost = executionCost(entry, entry, venue, spreadBps, stress);
  const target = targetOverride ?? entry + direction * distance * targetR;
  const reward =
      direction * (target - entry) -
      executionCost(entry, target, venue, spreadBps, stress),
    risk = distance + executionCost(entry, stop, venue, spreadBps, stress);
  return {
    entry,
    stop,
    target,
    cost,
    risk,
    reward,
    netR:
      entry > 0 && stop > 0 && target > 0 && distance > 0 && risk > 0
        ? reward / risk
        : NaN,
    distance,
  };
}
// Trigger only on a completed bar; no retrospective entry on the pivot bar.
export function triggerAt(d, ind, event, rule, venue) {
  const end = Math.min(d.n - 1, event.confirmed + 6);
  for (let i = event.confirmed + 1; i <= end; i++) {
    if (
      ind.age[i] < 80 ||
      (event.direction === 1 ? d.low[i] <= event.stop : d.high[i] >= event.stop)
    )
      return null;
    if (event.direction * (d.close[i] - event.trigger) > 0) {
      if (venue === "spot" && event.direction < 0) return null;
      const trend = event.direction * (d.close[i] - ind.slow[i]) > 0;
      if (!trend || ind.rv[i] < rule.volume || !Number.isFinite(ind.rv[i]))
        return null;
      return i;
    }
  }
  return null;
}
export function liveScan(
  candles,
  now,
  seconds = 60,
  rule = DEFAULT_RULE,
  venue = "spot",
) {
  const closed = candles
    .filter((c) => c.time * 1000 + seconds * 1000 <= now - 500)
    .sort((a, b) => a.time - b.time);
  const d = columns(closed),
    ind = indicators(d, seconds),
    last = d.n - 1;
  const fresh =
    last >= 0 && now - (d.time[last] + seconds) * 1000 < seconds * 1000 + 1500;
  if (last < 80 || ind.age[last] < 80 || !fresh)
    return {
      status: fresh ? "warming" : "stale",
      candles: closed,
      rsi: Array.from(ind.rsi),
      events: [],
      candidate: null,
    };
  const events = divergences(d, ind, rule);
  let candidate = null;
  for (const e of events.slice(-6).reverse()) {
    if (last - e.confirmed > 6 || (venue === "spot" && e.direction < 0))
      continue;
    const invalid = closed
      .slice(e.confirmed + 1)
      .some((c) => (e.direction === 1 ? c.low <= e.stop : c.high >= e.stop));
    if (invalid) continue;
    const triggered = triggerAt(d, ind, e, rule, venue);
    // A breakout is useful for only one following candle, not six old candles.
    if (triggered !== null && last > triggered) continue;
    if (
      triggered === null &&
      closed
        .slice(e.confirmed + 1)
        .some((c) => e.direction * (c.close - e.trigger) > 0)
    )
      continue;
    const entry = triggered === null ? e.trigger : d.close[triggered];
    const p = plan(entry, e.stop, e.direction, rule.targetR, venue);
    if (!(p.distance > 0) || p.stop <= 0 || p.target <= 0) continue;
    candidate = {
      ...e,
      ...p,
      stage: triggered === null ? "watch" : "triggered",
      triggered,
      expiresAt:
        (d.time[triggered ?? e.confirmed] +
          seconds * (triggered === null ? 7 : 2)) *
        1000,
      confirmedAt: (d.time[e.confirmed] + seconds) * 1000,
      atr: ind.atr[last],
      relativeVolume: ind.rv[last],
      trend: e.direction * (d.close[last] - ind.slow[last]) > 0,
    };
    break;
  }
  return {
    status: "ready",
    candles: closed,
    rsi: Array.from(ind.rsi),
    events: events
      .slice(-8)
      .map((e) => ({ ...e, direction: e.direction === 1 ? "bull" : "bear" })),
    candidate,
    atr: ind.atr[last],
    rsiNow: ind.rsi[last],
    relativeVolume: ind.rv[last],
    lastCloseAt: (d.time[last] + seconds) * 1000,
  };
}
export function simulate(d, ind, events, rule, venue, from, to, stress = 1) {
  const trades = [];
  let available = 0;
  for (const e of events) {
    if (
      d.time[e.confirmed] < from ||
      d.time[e.confirmed] >= to ||
      e.confirmed < available
    )
      continue;
    const trigger = triggerAt(d, ind, e, rule, venue);
    if (trigger === null) continue;
    const i = trigger + 1;
    if (i >= d.n || d.time[i] >= to || ind.age[i] < 80) continue;
    const original = plan(
      d.close[trigger],
      e.stop,
      e.direction,
      rule.targetR,
      venue,
    );
    const p = plan(
      d.open[i],
      e.stop,
      e.direction,
      rule.targetR,
      venue,
      undefined,
      stress,
      original.target,
    );
    const basePlan = plan(
      d.open[i],
      e.stop,
      e.direction,
      rule.targetR,
      venue,
      undefined,
      1,
      original.target,
    );
    if (
      !(basePlan.netR >= 1) ||
      p.distance <= 0 ||
      Math.abs(d.open[i] - d.close[trigger]) > ind.atr[trigger] * 0.5
    )
      continue;
    let price = d.close[i],
      exit = i,
      reason = "time";
    for (let j = i; j < Math.min(i + 10, d.n) && d.time[j] < to; j++) {
      exit = j;
      // Reject a trade if its path includes missing/invalid bars: never bridge a data gap.
      if (ind.age[j] < 80) {
        reason = "gap";
        break;
      }
      if (e.direction * (d.open[j] - p.stop) <= 0) {
        price = d.open[j];
        reason = "gap-stop";
        break;
      }
      if (e.direction * (d.open[j] - p.target) >= 0) {
        price = p.target;
        reason = "target";
        break;
      }
      if (e.direction === 1 ? d.low[j] <= p.stop : d.high[j] >= p.stop) {
        price = p.stop;
        reason = "stop";
        break;
      }
      if (e.direction === 1 ? d.high[j] >= p.target : d.low[j] <= p.target) {
        price = p.target;
        reason = "target";
        break;
      }
      price = d.close[j];
    }
    available = exit + 1;
    if (reason === "gap") continue;
    const net =
      e.direction * (price - p.entry) -
      executionCost(p.entry, price, venue, undefined, stress);
    trades.push({
      time: d.time[i],
      exit: d.time[exit],
      netR: net / p.risk,
      reason,
    });
  }
  return trades;
}
export function stats(trades) {
  const n = trades.length,
    wins = trades.filter((t) => t.netR > 0).length,
    p = n ? wins / n : 0,
    z = 1.96,
    den = 1 + (z * z) / (n || 1),
    center = (p + (z * z) / (2 * (n || 1))) / den,
    half =
      (z *
        Math.sqrt((p * (1 - p)) / (n || 1) + (z * z) / (4 * (n || 1) ** 2))) /
      den;
  let total = 0,
    peak = 0,
    drawdown = 0,
    positive = 0,
    negative = 0;
  for (const t of trades) {
    total += t.netR;
    peak = Math.max(peak, total);
    drawdown = Math.max(drawdown, peak - total);
    if (t.netR > 0) positive += t.netR;
    else negative -= t.netR;
  }
  return {
    trades: n,
    wins,
    winRate: n ? p : null,
    winInterval: n
      ? [Math.max(0, center - half), Math.min(1, center + half)]
      : null,
    expectancyR: n ? total / n : null,
    profitFactor: negative ? positive / negative : null,
    maxDrawdownR: drawdown,
    totalR: total,
  };
}
