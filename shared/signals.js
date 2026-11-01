// Transparent technical-analysis rules. No forecast probability or profit claim.
export const RULES = Object.freeze({
  rsiPeriod: 14,
  pivotLeft: 3,
  pivotRight: 3,
  minSeparation: 5,
  maxSeparation: 60,
  minPriceMovePct: 0.05,
  minRsiMove: 3,
  expiryBars: 6,
});
export function rsiWilder(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  gain /= period;
  loss /= period;
  const value = () =>
    gain === 0 && loss === 0
      ? 50
      : loss === 0
        ? 100
        : 100 - 100 / (1 + gain / loss);
  out[period] = value();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}
export function ema(values, period) {
  if (values.length < period) return null;
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const p of values.slice(period)) v += ((p - v) * 2) / (period + 1);
  return v;
}
export function atrWilder(candles, period = 14) {
  const out = Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  let v = 0;
  const tr = (i) =>
    Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  for (let i = 1; i <= period; i++) v += tr(i);
  v /= period;
  out[period] = v;
  for (let i = period + 1; i < candles.length; i++) {
    v = (v * (period - 1) + tr(i)) / period;
    out[i] = v;
  }
  return out;
}
export function findDivergences(candles, rsi, rules = RULES) {
  const events = [];
  for (const direction of ["bull", "bear"]) {
    const key = direction === "bull" ? "low" : "high";
    let previous = null;
    for (let i = rules.pivotLeft; i < candles.length - rules.pivotRight; i++) {
      if (!Number.isFinite(rsi[i])) continue;
      const p = candles[i][key];
      let pivot = true;
      for (let j = i - rules.pivotLeft; j <= i + rules.pivotRight; j++)
        if (
          j !== i &&
          (direction === "bull" ? candles[j][key] <= p : candles[j][key] >= p)
        ) {
          pivot = false;
          break;
        }
      if (!pivot) continue;
      if (previous !== null) {
        const a = previous,
          distance = i - a,
          priceMove = (p / candles[a][key] - 1) * 100,
          rsiMove = rsi[i] - rsi[a];
        if (
          distance >= rules.minSeparation &&
          distance <= rules.maxSeparation &&
          (direction === "bull"
            ? priceMove <= -rules.minPriceMovePct &&
              rsiMove >= rules.minRsiMove &&
              Math.min(rsi[a], rsi[i]) <= 40
            : priceMove >= rules.minPriceMovePct &&
              rsiMove <= -rules.minRsiMove &&
              Math.max(rsi[a], rsi[i]) >= 60)
        )
          events.push({
            direction,
            first: a,
            second: i,
            confirmed: i + rules.pivotRight,
            priceMove,
            rsiMove,
          });
      }
      previous = i;
    }
  }
  return events.sort((a, b) => a.confirmed - b.confirmed);
}
export function evaluateSetup(event, candles, atr, rules = RULES) {
  const bull = event.direction === "bull",
    pivot = candles[event.second],
    confirmation = candles[event.confirmed];
  const trigger = bull ? confirmation.high : confirmation.low;
  const stop = bull
    ? pivot.low - atr[event.confirmed] * 0.25
    : pivot.high + atr[event.confirmed] * 0.25;
  if (!Number.isFinite(stop)) return { ...event, state: "unavailable" };
  let entry = null,
    entryIndex = null,
    target = null,
    state = "watch";
  for (let i = event.confirmed + 1; i < candles.length; i++) {
    const c = candles[i];
    if (bull ? c.low <= stop : c.high >= stop) {
      state = "invalidated";
      break;
    }
    if (entry === null) {
      if (i - event.confirmed > rules.expiryBars) {
        state = "expired";
        break;
      }
      if (bull ? c.close > trigger : c.close < trigger) {
        entry = c.close;
        entryIndex = i;
        const risk = Math.abs(entry - stop);
        target = bull ? entry + 2 * risk : entry - 2 * risk;
        state = "triggered";
      }
    } else {
      if (bull ? c.high >= target : c.low <= target) {
        state = "target reached";
        break;
      }
      if (i - entryIndex > rules.expiryBars) {
        state = "expired";
        break;
      }
    }
  }
  return {
    ...event,
    state,
    trigger,
    stop,
    entry,
    entryIndex,
    target,
    confirmedAt: confirmation.closeTime,
    pivotAt: pivot.time,
  };
}
export function analyzeFiveMinute(candles, serverNow) {
  if (!Number.isFinite(serverNow))
    return {
      status: "unavailable",
      reason: "Exchange clock unavailable",
      candles: [],
      events: [],
    };
  // A safety margin prevents treating a still-settling exchange candle as final.
  const closed = candles.filter((c) => c.closeTime < serverNow - 500);
  const bad = closed.some(
    (c, i) =>
      ![c.time, c.closeTime, c.open, c.high, c.low, c.close, c.volume].every(
        Number.isFinite,
      ) ||
      c.open <= 0 ||
      c.close <= 0 ||
      c.low <= 0 ||
      c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close) ||
      c.volume < 0 ||
      c.closeTime !== c.time * 1000 + 299999 ||
      (i > 0 && c.time - closed[i - 1].time !== 300),
  );
  if (bad || closed.length < 100)
    return {
      status: "unavailable",
      reason: bad
        ? "Candle gap or invalid exchange data"
        : "At least 100 closed 5m candles are required",
      candles: [],
      events: [],
    };
  const age = serverNow - closed.at(-1).closeTime;
  const closes = closed.map((c) => c.close),
    rsi = rsiWilder(closes),
    atr = atrWilder(closed);
  const events = findDivergences(closed, rsi).map((e) =>
    evaluateSetup(e, closed, atr),
  );
  const latest = events.at(-1),
    active =
      latest && ["watch", "triggered"].includes(latest.state) ? latest : null;
  const recent = closed.slice(-21, -1),
    meanVolume = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const day = Math.floor(closed.at(-1).time / 86400),
    session = closed.filter((c) => Math.floor(c.time / 86400) === day),
    volume = session.reduce((s, c) => s + c.volume, 0);
  return {
    status: age > 310000 ? "stale" : "ready",
    reason: age > 310000 ? "Latest closed candle is overdue" : null,
    candles: closed,
    rsi,
    atr: atr.at(-1),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    vwap: volume
      ? session.reduce(
          (s, c) => s + ((c.high + c.low + c.close) / 3) * c.volume,
          0,
        ) / volume
      : null,
    relativeVolume: meanVolume ? closed.at(-1).volume / meanVolume : null,
    events: events.slice(-8),
    active: age > 310000 ? null : active,
    lastClose: closed.at(-1).close,
    lastCandleAt: closed.at(-1).closeTime,
    serverNow,
  };
}
export function sampleChange(previous, current) {
  if (
    !previous ||
    !Number.isFinite(previous.price) ||
    !Number.isFinite(current.price) ||
    !Number.isFinite(previous.asOf) ||
    !Number.isFinite(current.asOf) ||
    previous.price <= 0 ||
    current.price <= 0
  )
    return { change: null, interval: null };
  const interval = current.asOf - previous.asOf;
  // Do not invent a two-second return after a timeout, stale quote or resumed tab.
  if (interval < 1500 || interval > 3500) return { change: null, interval };
  return { change: (current.price / previous.price - 1) * 100, interval };
}
