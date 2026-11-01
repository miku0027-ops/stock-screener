import { analyzeFiveMinute } from "../shared/signals.js";
const base = "https://data-api.binance.vision/api/v3";
export async function getJSON(url, signal) {
  const r = await fetch(url, {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const e = new Error(
      r.status === 429 ? "Provider rate limited" : "Source unavailable",
    );
    e.status = r.status;
    throw e;
  }
  return r.json();
}
const historyCache = new Map();
const depthCache = new Map();
async function bookSnapshot(symbol, signal) {
  const old = depthCache.get(symbol);
  if (old && Date.now() - old.receivedAt < 10000) return old.value;
  const value = await getJSON(
    `${base}/depth?symbol=${symbol}&limit=20`,
    signal,
  );
  depthCache.set(symbol, { value, receivedAt: Date.now() });
  return value;
}
export async function getFiveMinuteContext(symbol, signal) {
  if (!["BTCUSDT", "ETHUSDT"].includes(symbol))
    throw Error("Unsupported signal market");
  const start = Date.now();
  const previous = historyCache.get(symbol);
  const incremental = previous && start - previous.receivedAt < 300000;
  const [clock, rows, book] = await Promise.all([
    getJSON(`${base}/time`, signal),
    getJSON(
      `${base}/klines?symbol=${symbol}&interval=5m&limit=${incremental ? 3 : 500}`,
      signal,
    ),
    bookSnapshot(symbol, signal).catch(() => null),
  ]);
  if (!Array.isArray(rows) || !Number.isFinite(clock.serverTime))
    throw Error("Exchange data invalid");
  const incoming = rows.map((r) => ({
    time: +r[0] / 1000,
    closeTime: +r[6],
    open: +r[1],
    high: +r[2],
    low: +r[3],
    close: +r[4],
    volume: +r[5],
  }));
  const candles = [
    ...new Map(
      [...(incremental ? previous.candles : []), ...incoming].map((c) => [
        c.time,
        c,
      ]),
    ).values(),
  ]
    .sort((a, b) => a.time - b.time)
    .slice(-1000);
  const analysis = analyzeFiveMinute(candles, clock.serverTime);
  if (analysis.status === "ready")
    historyCache.set(symbol, { candles, receivedAt: Date.now() });
  else historyCache.delete(symbol);
  let depth = null;
  if (book?.bids?.length && book?.asks?.length) {
    const bid = +book.bids[0][0],
      ask = +book.asks[0][0];
    const bids = book.bids.reduce((s, r) => s + +r[0] * +r[1], 0),
      asks = book.asks.reduce((s, r) => s + +r[0] * +r[1], 0);
    if (
      [bid, ask, bids, asks].every(Number.isFinite) &&
      bid > 0 &&
      ask >= bid &&
      bids + asks > 0
    )
      depth = {
        spreadBps: ((ask - bid) / ((ask + bid) / 2)) * 10000,
        imbalance: ((bids - asks) / (bids + asks)) * 100,
      };
  }
  const latency = Date.now() - start;
  return {
    ...analysis,
    depth,
    latency,
    receivedAt: Date.now(),
    status: latency > 5000 ? "stale" : analysis.status,
    active: latency > 5000 ? null : analysis.active,
    reason:
      latency > 5000 ? "Exchange request took over 5 seconds" : analysis.reason,
  };
}
