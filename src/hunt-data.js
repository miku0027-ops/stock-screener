import { getJSON, hyperJSON } from "./trading-data.js";
import { liveScan, DEFAULT_RULE } from "../shared/hunt/engine.js";
const base = "https://data-api.binance.vision/api/v3",
  cache = new Map();
let metadata = null,
  metadataPromise = null;
export const SCAN_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
];
async function meta(signal) {
  if (metadata && Date.now() - metadata.at < 30000) return metadata;
  if (metadataPromise) return metadataPromise;
  metadataPromise = hyperJSON({ type: "metaAndAssetCtxs" }, signal)
    .then((d) => {
      if (!Array.isArray(d?.[0]?.universe) || !Array.isArray(d[1]))
        throw Error("Perpetual metadata unavailable");
      return (metadata = {
        universe: d[0].universe,
        contexts: d[1],
        at: Date.now(),
      });
    })
    .finally(() => {
      metadataPromise = null;
    });
  return metadataPromise;
}
async function contract(symbol, signal) {
  const m = await meta(signal),
    coin = symbol.replace(/USDT$/, ""),
    index = m.universe.findIndex((x) => x.name === coin && !x.isDelisted);
  if (index < 0) throw Error("No supported perpetual");
  return { coin, context: m.contexts[index], asOf: m.at };
}
export async function scanMarket(
  symbol,
  venue,
  interval = "1m",
  rule = DEFAULT_RULE,
  signal,
) {
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol) || !["1m", "5m"].includes(interval))
    throw Error("Unsupported market");
  const ms = interval === "1m" ? 60000 : 300000,
    start = Date.now(),
    key = `${venue}:${symbol}:${interval}`,
    old = cache.get(key),
    incremental = old && start - old.at < ms * 2;
  let incoming,
    clock,
    derivatives = null;
  if (venue === "spot") {
    const [rows, time] = await Promise.all([
      getJSON(
        `${base}/klines?symbol=${symbol}&interval=${interval}&limit=${incremental ? 3 : 500}`,
        signal,
      ),
      getJSON(`${base}/time`, signal),
    ]);
    if (!Array.isArray(rows) || !Number.isFinite(time.serverTime))
      throw Error("Invalid exchange response");
    clock = time.serverTime;
    incoming = rows.map((r) => ({
      time: +r[0] / 1000,
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
      volume: +r[5],
    }));
  } else {
    const { coin, context, asOf } = await contract(symbol, signal),
      [rows, book] = await Promise.all([
        hyperJSON(
          {
            type: "candleSnapshot",
            req: {
              coin,
              interval,
              startTime: start - (incremental ? 3 : 502) * ms,
              endTime: start,
            },
          },
          signal,
        ),
        hyperJSON({ type: "l2Book", coin }, signal),
      ]);
    if (!Array.isArray(rows) || !Number.isFinite(book.time))
      throw Error("Invalid perpetual candles");
    clock = book.time;
    incoming = rows.map((r) => ({
      time: +r.t / 1000,
      open: +r.o,
      high: +r.h,
      low: +r.l,
      close: +r.c,
      volume: +r.v,
    }));
    if (
      context &&
      [
        context.funding,
        context.openInterest,
        context.markPx,
        context.oraclePx,
      ].every((v) => v !== null && v !== "" && Number.isFinite(+v)) &&
      +context.oraclePx > 0 &&
      +context.markPx > 0
    )
      derivatives = {
        fundingHourly: +context.funding * 100,
        openInterestUSD: +context.openInterest * +context.markPx,
        basisPct: (+context.markPx / +context.oraclePx - 1) * 100,
        asOf,
      };
  }
  const candles = [
    ...new Map(
      [...(incremental ? old.candles : []), ...incoming].map((c) => [
        c.time,
        c,
      ]),
    ).values(),
  ]
    .sort((a, b) => a.time - b.time)
    .slice(-600);
  if (
    candles.some(
      (c) =>
        ![c.time, c.open, c.high, c.low, c.close, c.volume].every(
          Number.isFinite,
        ) ||
        c.low <= 0 ||
        c.volume < 0 ||
        c.time * 1000 > clock ||
        c.time % (ms / 1000) !== 0 ||
        c.high < Math.max(c.open, c.close) ||
        c.low > Math.min(c.open, c.close),
    )
  )
    throw Error("Invalid OHLC");
  const result = liveScan(candles, clock, ms / 1000, rule, venue),
    latency = Date.now() - start;
  if (latency > 8000 || Math.abs(clock - Date.now()) > 10000)
    throw Error("Exchange response stale");
  cache.set(key, { candles, at: Date.now() });
  return {
    ...result,
    symbol,
    venue,
    interval,
    rule,
    derivatives,
    currentCandle: incoming.at(-1),
    receivedAt: Date.now(),
    price: incoming.at(-1)?.close,
  };
}
export async function huntQuote(symbol, venue, signal) {
  const start = Date.now();
  let bid, ask, time;
  if (venue === "spot") {
    const [book, clock] = await Promise.all([
      getJSON(`${base}/ticker/bookTicker?symbol=${symbol}`, signal),
      getJSON(`${base}/time`, signal),
    ]);
    bid = +book.bidPrice;
    ask = +book.askPrice;
    time = clock.serverTime;
  } else {
    const { coin } = await contract(symbol, signal),
      book = await hyperJSON({ type: "l2Book", coin }, signal);
    bid = +book.levels?.[0]?.[0]?.px;
    ask = +book.levels?.[1]?.[0]?.px;
    time = book.time;
  }
  if (
    ![bid, ask, time].every(Number.isFinite) ||
    bid <= 0 ||
    ask < bid ||
    Date.now() - start > 5000 ||
    Math.abs(Date.now() - time) > 8000
  )
    throw Error("Quote unavailable / stale");
  return {
    bid,
    ask,
    price: (bid + ask) / 2,
    spreadBps: ((ask - bid) / ((ask + bid) / 2)) * 10000,
    asOf: time,
    receivedAt: Date.now(),
    symbol,
    venue,
  };
}
