import {
  columns,
  indicators,
  divergences,
  triggerAt,
  plan,
  executionCost,
  DEFAULT_RULE,
} from "./engine.js";
export const DISCOVERY_PROTOCOL = "sharpnex-discovery-v2";
export const TIMEFRAMES = Array.from({ length: 14 }, (_, i) => `${i + 1}m`);
export const FAMILIES = ["divergence", "pullback", "breakout"];
export const FAMILY_NAMES = {
  divergence: "RSI divergence",
  pullback: "Trend pullback",
  breakout: "Range breakout",
};
export const BASE_RULES = Object.freeze({
  divergence: { ...DEFAULT_RULE, family: "divergence" },
  pullback: { family: "pullback", targetR: 2, volume: 0.8, stopATR: 1.5 },
  breakout: { family: "breakout", targetR: 2, volume: 1.2, stopATR: 1.5 },
});
export const RESEARCH_RULES = FAMILIES.flatMap((family) =>
  [2, 3].flatMap((targetR) =>
    [0.8, 1.2].flatMap((volume) =>
      family === "divergence"
        ? [1, 2].map((right) => ({
            ...DEFAULT_RULE,
            family,
            right,
            targetR,
            volume,
          }))
        : [1.5, 2].map((stopATR) => ({ family, targetR, volume, stopATR })),
    ),
  ),
);
export function minutesOf(interval) {
  const n = Number(String(interval).replace(/m$/, ""));
  if (!Number.isInteger(n) || n < 1 || n > 14)
    throw Error("Supported intervals: 1m–14m");
  return n;
}
// All bars use UTC epoch boundaries. A gap is never turned into a flat candle.
export function aggregateColumns(d, minutes) {
  if (minutes === 1) return d;
  const keys = ["time", "open", "high", "low", "close", "volume"],
    out = Object.fromEntries(keys.map((k) => [k, []]));
  let bar = null,
    count = 0,
    last = 0;
  const flush = () => {
    if (bar && count === minutes && bar.valid) {
      for (const k of keys) out[k].push(bar[k]);
    }
  };
  for (let i = 0; i < d.n; i++) {
    const bucket = Math.floor(d.time[i] / (minutes * 60)) * minutes * 60;
    if (!bar || bucket !== bar.time) {
      flush();
      bar = {
        time: bucket,
        open: d.open[i],
        high: d.high[i],
        low: d.low[i],
        close: d.close[i],
        volume: d.volume[i],
        valid: d.time[i] === bucket,
      };
      count = 1;
    } else {
      bar.valid &&= d.time[i] - last === 60;
      bar.high = Math.max(bar.high, d.high[i]);
      bar.low = Math.min(bar.low, d.low[i]);
      bar.close = d.close[i];
      bar.volume += d.volume[i];
      count++;
    }
    last = d.time[i];
  }
  flush();
  return {
    n: out.time.length,
    ...Object.fromEntries(keys.map((k) => [k, Float64Array.from(out[k])])),
  };
}
export function aggregateCandles(rows, minutes, now) {
  const buckets = new Map();
  for (const c of rows) {
    const time = Math.floor(c.time / (minutes * 60)) * minutes * 60;
    let b = buckets.get(time);
    if (!b) {
      b = { ...c, time, count: 1, last: c.time, valid: c.time === time };
      buckets.set(time, b);
    } else {
      b.valid &&= c.time - b.last === 60;
      b.count++;
      b.last = c.time;
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume;
    }
  }
  const all = [...buckets.values()].filter(
    (b) =>
      b.valid && (b.count === minutes || b.time * 1000 + minutes * 60000 > now),
  );
  return {
    closed: all.filter(
      (b) =>
        b.count === minutes && b.time * 1000 + minutes * 60000 <= now - 500,
    ),
    current:
      all.findLast((b) => b.time * 1000 + minutes * 60000 > now - 500) || null,
  };
}
export function strategySignals(d, ind, rule, venue = "spot") {
  if (rule.family === "divergence")
    return divergences(d, ind, rule).flatMap((e) => {
      const decision = triggerAt(d, ind, e, rule, venue);
      return decision === null
        ? []
        : [
            {
              ...e,
              decision,
              family: rule.family,
              entry: d.close[decision],
              relativeVolume: ind.rv[decision],
              atr: ind.atr[decision],
            },
          ];
    });
  const events = [];
  for (let i = 80; i < d.n; i++) {
    if (
      ind.age[i] < 80 ||
      ind.rv[i] < rule.volume ||
      !Number.isFinite(ind.rv[i]) ||
      !(ind.atr[i] > 0)
    )
      continue;
    for (const direction of venue === "spot" ? [1] : [1, -1]) {
      const trend =
        direction * (ind.fast[i] - ind.slow[i]) > 0 &&
        direction * (ind.slow[i] - ind.slow[i - 3]) > 0 &&
        direction * (d.close[i] - ind.slow[i]) > 0;
      if (!trend) continue;
      const rsi = ind.rsi[i];
      let valid = false,
        stop;
      if (rule.family === "pullback") {
        const extreme =
          direction === 1
            ? Math.min(...d.low.subarray(i - 3, i + 1))
            : Math.max(...d.high.subarray(i - 3, i + 1));
        const touch =
          direction === 1
            ? d.low[i] <= ind.fast[i] + 0.2 * ind.atr[i]
            : d.high[i] >= ind.fast[i] - 0.2 * ind.atr[i];
        const reclaim =
          direction * (d.close[i] - ind.fast[i]) > 0 &&
          direction * (d.close[i] - d.open[i]) > 0;
        const recovery =
          direction * (rsi - ind.rsi[i - 1]) >= 2 &&
          (direction === 1
            ? rsi >= 45 && rsi <= 65 && ind.rsi[i - 1] < 55
            : rsi >= 35 && rsi <= 55 && ind.rsi[i - 1] > 45);
        valid = touch && reclaim && recovery;
        stop =
          direction === 1
            ? Math.min(
                extreme - 0.15 * ind.atr[i],
                d.close[i] - rule.stopATR * ind.atr[i],
              )
            : Math.max(
                extreme + 0.15 * ind.atr[i],
                d.close[i] + rule.stopATR * ind.atr[i],
              );
      } else {
        const rangeHigh = Math.max(...d.high.subarray(i - 20, i)),
          rangeLow = Math.min(...d.low.subarray(i - 20, i));
        const body =
          Math.abs(d.close[i] - d.open[i]) / (d.high[i] - d.low[i] || Infinity);
        valid =
          (direction === 1
            ? d.close[i] > rangeHigh && rsi >= 55 && rsi <= 78
            : d.close[i] < rangeLow && rsi >= 22 && rsi <= 45) && body >= 0.5;
        stop = d.close[i] - direction * rule.stopATR * ind.atr[i];
      }
      if (valid)
        events.push({
          family: rule.family,
          direction,
          confirmed: i,
          decision: i,
          pivot: i,
          previous: i - 1,
          trigger: d.close[i],
          entry: d.close[i],
          stop,
          atr: ind.atr[i],
          relativeVolume: ind.rv[i],
          rsiDelta: direction * (rsi - ind.rsi[i - 1]),
        });
    }
  }
  return events;
}
export function liveDiscovery(
  raw,
  now,
  interval = "1m",
  rules = BASE_RULES,
  venue = "spot",
  family = "blend",
) {
  const minutes = minutesOf(interval),
    { closed, current } = aggregateCandles(raw, minutes, now),
    d = columns(closed),
    ind = indicators(d, minutes * 60),
    last = d.n - 1;
  const fresh =
    last >= 0 &&
    now - (d.time[last] + minutes * 60) * 1000 < minutes * 60000 + 1500;
  const result = {
    status:
      fresh && ind.age[last] >= 80 ? "ready" : fresh ? "warming" : "stale",
    candles: closed,
    currentCandle: current,
    rsi: Array.from(ind.rsi),
    rsiNow: ind.rsi[last],
    atr: ind.atr[last],
    relativeVolume: ind.rv[last],
    lastCloseAt: last >= 0 ? (d.time[last] + minutes * 60) * 1000 : null,
    candidate: null,
    candidates: [],
    events: [],
  };
  if (result.status !== "ready") return result;
  for (const name of FAMILIES.filter(
    (n) => family === "blend" || n === family,
  )) {
    const rule = rules[name] || BASE_RULES[name],
      signals = strategySignals(d, ind, rule, venue);
    const lastSignal = signals.at(-1);
    for (const e of signals.slice(-3))
      result.events.push({
        ...e,
        confirmed: e.decision,
        direction: e.direction === 1 ? "bull" : "bear",
        label: FAMILY_NAMES[name],
      });
    if (lastSignal?.decision === last) {
      const e = lastSignal,
        p = plan(e.entry, e.stop, e.direction, rule.targetR, venue);
      if (p.stop > 0 && p.target > 0 && p.distance > 0)
        result.candidates.push({
          ...e,
          ...p,
          rule,
          stage: "triggered",
          triggered: last,
          confirmedAt: (d.time[e.confirmed] + minutes * 60) * 1000,
          expiresAt: (d.time[last] + minutes * 120) * 1000,
          trend: true,
        });
    }
    if (name === "divergence")
      for (const e of divergences(d, ind, rule).slice(-4).reverse()) {
        if (last - e.confirmed > 6 || (venue === "spot" && e.direction < 0))
          continue;
        const path = closed.slice(e.confirmed + 1),
          broken = path.some((c) =>
            e.direction === 1
              ? c.low <= e.stop || c.close > e.trigger
              : c.high >= e.stop || c.close < e.trigger,
          );
        if (broken) continue;
        const p = plan(e.trigger, e.stop, e.direction, rule.targetR, venue);
        if (p.stop <= 0 || p.target <= 0 || p.distance <= 0) continue;
        result.candidates.push({
          ...e,
          ...p,
          family: name,
          rule,
          stage: "watch",
          triggered: null,
          atr: ind.atr[last],
          relativeVolume: ind.rv[last],
          trend: e.direction * (d.close[last] - ind.slow[last]) > 0,
          confirmedAt: (d.time[e.confirmed] + minutes * 60) * 1000,
          expiresAt: (d.time[e.confirmed] + minutes * 420) * 1000,
        });
        break;
      }
  }
  result.candidates = result.candidates
    .filter(
      (c) =>
        !current ||
        (c.direction === 1 ? current.low > c.stop : current.high < c.stop),
    )
    .sort(
      (a, b) =>
        (b.stage === "triggered") - (a.stage === "triggered") ||
        b.netR - a.netR,
    );
  result.candidate = result.candidates[0] || null;
  result.events.sort((a, b) => a.confirmed - b.confirmed);
  result.events = [
    ...new Map(
      result.events.map((e) => [`${e.confirmed}:${e.direction}`, e]),
    ).values(),
  ];
  return result;
}
export function simulateStrategy(
  d,
  ind,
  signals,
  rule,
  venue,
  from,
  to,
  minutes = 1,
  stress = 1,
) {
  const trades = [];
  let available = 0;
  const hold = Math.max(2, Math.min(10, Math.ceil(30 / minutes)));
  for (const e of signals) {
    const decision = e.decision,
      i = decision + 1;
    if (
      decision < available ||
      i >= d.n ||
      d.time[decision] < from ||
      d.time[i] >= to ||
      ind.age[i] < 80
    )
      continue;
    const reference = plan(
        d.close[decision],
        e.stop,
        e.direction,
        rule.targetR,
        venue,
      ),
      p = plan(
        d.open[i],
        e.stop,
        e.direction,
        rule.targetR,
        venue,
        undefined,
        stress,
        reference.target,
      ),
      base = plan(
        d.open[i],
        e.stop,
        e.direction,
        rule.targetR,
        venue,
        undefined,
        1,
        reference.target,
      );
    if (
      !(base.netR >= 1) ||
      Math.abs(d.open[i] - d.close[decision]) > ind.atr[decision] * 0.5
    )
      continue;
    let price = d.close[i],
      exit = i,
      reason = "time";
    for (let j = i; j < Math.min(i + hold, d.n) && d.time[j] < to; j++) {
      exit = j;
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
    trades.push({
      time: d.time[i],
      exit: d.time[exit],
      netR:
        (e.direction * (price - p.entry) -
          executionCost(p.entry, price, venue, undefined, stress)) /
        p.risk,
      reason,
    });
  }
  return trades;
}
