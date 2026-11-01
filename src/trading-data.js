import { enrichment } from "../shared/analysis.js";
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
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol))
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
  return enrichment({
    ...analysis,
    currentCandle: incoming.at(-1),
    depth,
    latency,
    receivedAt: Date.now(),
    status: latency > 5000 ? "stale" : analysis.status,
    active: latency > 5000 ? null : analysis.active,
    reason:
      latency > 5000 ? "Exchange request took over 5 seconds" : analysis.reason,
    venue: "Binance spot",
  });
}

const hyperBase = "https://api.hyperliquid.xyz/info";
export async function hyperJSON(body, signal) {
  const r = await fetch(hyperBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const e = new Error(
      r.status === 429
        ? "Provider rate limited"
        : "Perpetual source unavailable",
    );
    e.status = r.status;
    throw e;
  }
  return r.json();
}
let perpMarket = null;
async function perpUniverse(signal) {
  if (perpMarket && Date.now() - perpMarket.receivedAt < 15000)
    return perpMarket;
  const data = await hyperJSON({ type: "metaAndAssetCtxs" }, signal);
  if (!Array.isArray(data?.[0]?.universe) || !Array.isArray(data[1]))
    throw Error("Perpetual metadata invalid");
  perpMarket = {
    universe: data[0].universe,
    contexts: data[1],
    receivedAt: Date.now(),
  };
  return perpMarket;
}
export async function getPerpetualContext(symbol, signal) {
  const coin = symbol.replace(/USDT$/, "");
  if (!/^[A-Z0-9]{2,20}$/.test(coin)) throw Error("Unsupported perpetual");
  const start = Date.now(),
    market = await perpUniverse(signal),
    index = market.universe.findIndex((m) => m.name === coin && !m.isDelisted);
  if (index < 0)
    throw Error("This coin has no supported Hyperliquid perpetual");
  const key = `perp:${coin}`,
    previous = historyCache.get(key),
    incremental = previous && start - previous.receivedAt < 300000;
  const [rows, book] = await Promise.all([
    hyperJSON(
      {
        type: "candleSnapshot",
        req: {
          coin,
          interval: "5m",
          startTime: start - (incremental ? 4 : 502) * 300000,
          endTime: start,
        },
      },
      signal,
    ),
    hyperJSON({ type: "l2Book", coin }, signal),
  ]);
  if (!Array.isArray(rows) || !Number.isFinite(book?.time))
    throw Error("Perpetual exchange data invalid");
  const incoming = rows.map((r) => ({
    time: +r.t / 1000,
    closeTime: +r.t + 299999,
    open: +r.o,
    high: +r.h,
    low: +r.l,
    close: +r.c,
    volume: +r.v,
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
  const analysis = analyzeFiveMinute(candles, book.time);
  if (analysis.status === "ready")
    historyCache.set(key, { candles, receivedAt: Date.now() });
  else historyCache.delete(key);
  let depth = null;
  const levels = book.levels;
  if (levels?.[0]?.length && levels?.[1]?.length) {
    const bid = +levels[0][0].px,
      ask = +levels[1][0].px,
      bids = levels[0].slice(0, 20).reduce((s, r) => s + +r.px * +r.sz, 0),
      asks = levels[1].slice(0, 20).reduce((s, r) => s + +r.px * +r.sz, 0);
    if (
      [bid, ask, bids, asks].every(Number.isFinite) &&
      ask >= bid &&
      bid > 0 &&
      bids + asks > 0
    )
      depth = {
        spreadBps: ((ask - bid) / ((ask + bid) / 2)) * 10000,
        imbalance: ((bids - asks) / (bids + asks)) * 100,
      };
  }
  const ctx = market.contexts[index];
  let derivatives = null;
  if (
    ctx &&
    [ctx.funding, ctx.openInterest, ctx.markPx, ctx.oraclePx].every(
      (v) => v !== null && v !== "" && Number.isFinite(+v),
    ) &&
    +ctx.oraclePx > 0 &&
    +ctx.markPx > 0
  )
    derivatives = {
      fundingHourly: +ctx.funding * 100,
      openInterest: +ctx.openInterest,
      openInterestUSD: +ctx.openInterest * +ctx.markPx,
      mark: +ctx.markPx,
      oracle: +ctx.oraclePx,
      basisPct: (+ctx.markPx / +ctx.oraclePx - 1) * 100,
      asOf: market.receivedAt,
    };
  const latency = Date.now() - start,
    stale = latency > 5000 || Math.abs(Date.now() - book.time) > 10000;
  return enrichment({
    ...analysis,
    currentCandle: incoming.at(-1),
    depth,
    derivatives,
    venue: "Hyperliquid perpetual",
    receivedAt: Date.now(),
    latency,
    status: stale ? "stale" : analysis.status,
    active: stale ? null : analysis.active,
    reason: stale ? "Perpetual data or clock is stale" : analysis.reason,
  });
}
