import { getJSON, hyperJSON } from "./trading-data.js";
import {
  liveDiscovery,
  BASE_RULES,
  minutesOf,
} from "../shared/hunt/strategies.js";
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
async function oneMinuteHistory(symbol, venue, signal) {
  const start = Date.now(),
    key = `${venue}:${symbol}`,
    old = cache.get(key);
  if (old && start - old.at < 8000) return old;
  const incremental = old && start - old.at < 180000;
  let incoming,
    clock,
    derivatives = null;
  if (venue === "spot") {
    const rows = [];
    let endTime;
    for (let page = 0; page < (incremental ? 1 : 3); page++) {
      const data = await getJSON(
        `${base}/klines?symbol=${symbol}&interval=1m&limit=${incremental ? 5 : 1000}${endTime ? `&endTime=${endTime}` : ""}`,
        signal,
      );
      if (!Array.isArray(data) || !data.length)
        throw Error("Candles unavailable");
      rows.unshift(...data);
      if (incremental || data.length < 1000) break;
      const next = Number(data[0][0]) - 1;
      if (endTime && next >= endTime) break;
      endTime = next;
    }
    const time = await getJSON(`${base}/time`, signal);
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
              interval: "1m",
              startTime: start - (incremental ? 5 : 2400) * 60000,
              endTime: start,
            },
          },
          signal,
        ),
        hyperJSON({ type: "l2Book", coin }, signal),
      ]);
    if (!Array.isArray(rows)) throw Error("Perpetual candles unavailable");
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
  if (
    !Number.isFinite(clock) ||
    Math.abs(clock - Date.now()) > 10000 ||
    Date.now() - start > 20000
  )
    throw Error("Exchange clock or response stale");
  const candles = [
    ...new Map(
      [...(incremental ? old.candles : []), ...incoming].map((c) => [
        c.time,
        c,
      ]),
    ).values(),
  ]
    .sort((a, b) => a.time - b.time)
    .slice(-2400);
  if (
    candles.some(
      (c) =>
        ![c.time, c.open, c.high, c.low, c.close, c.volume].every(
          Number.isFinite,
        ) ||
        c.time % 60 !== 0 ||
        c.time * 1000 > clock ||
        c.low <= 0 ||
        c.volume < 0 ||
        c.high < Math.max(c.open, c.close) ||
        c.low > Math.min(c.open, c.close),
    )
  )
    throw Error("Invalid OHLC");
  const value = { candles, clock, derivatives, at: Date.now() };
  cache.set(key, value);
  return value;
}
export async function scanMarket(
  symbol,
  venue,
  interval = "1m",
  rules = BASE_RULES,
  signal,
  family = "blend",
) {
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) throw Error("Unsupported market");
  minutesOf(interval);
  const h = await oneMinuteHistory(symbol, venue, signal),
    result = liveDiscovery(h.candles, h.clock, interval, rules, venue, family);
  return {
    ...result,
    symbol,
    venue,
    interval,
    rule: result.candidate?.rule || rules.divergence || BASE_RULES.divergence,
    derivatives: h.derivatives,
    receivedAt: h.at,
    price: h.candles.at(-1)?.close,
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
