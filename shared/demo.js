import { markets, periodConfig } from "./markets.js";
const factor = (period) =>
  ({ "1D": 1, "1W": 1.8, "1M": 3.2, "3M": 5, "1Y": 8 })[period];
// Deterministic illustrative history, never used by the live API.
export function demoHistory(market, period = "1D") {
  let seed = [...market.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const n = 96,
    step = Math.floor(periodConfig[period].seconds / n),
    end = Math.floor(Date.now() / 1000 / step) * step;
  const growth = 1 + (market.sampleChange * factor(period)) / 100;
  const start = market.samplePrice / growth;
  const noise = [0];
  for (let i = 1; i <= n; i++)
    noise.push(noise[i - 1] + (rand() - 0.5) * 0.007);
  let price = start;
  return Array.from({ length: n }, (_, i) => {
    const open = price,
      t = (i + 1) / n;
    price =
      start * Math.exp(Math.log(growth) * t + noise[i + 1] - noise[n] * t);
    return {
      time: end - (n - 1 - i) * step,
      open,
      high: Math.max(open, price) * (1 + rand() * 0.0015),
      low: Math.min(open, price) * (1 - rand() * 0.0015),
      close: price,
      volume: rand() * 1000,
    };
  });
}
export function demoSnapshot(period = "1D") {
  return markets.map((m) => {
    const candles = demoHistory(m, period);
    return {
      ...m,
      price: m.samplePrice,
      change: m.sampleChange * factor(period),
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      volume: null,
      asOf: null,
      status: "demo",
      spark: candles
        .filter((_, i) => i % 4 === 0 || i === 95)
        .map((c) => c.close),
    };
  });
}
