import { fetch, EnvHttpProxyAgent } from "undici";
import { markets, periodConfig } from "../shared/markets.js";
const dispatcher =
  process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    ? new EnvHttpProxyAgent()
    : undefined;
const cache = new Map();
const pending = new Map();
const rateLimitedUntil = new Map();
export async function cached(key, ttl, fn) {
  const old = cache.get(key);
  if (old && Date.now() - old.saved < ttl) return old.value;
  if (pending.has(key)) return pending.get(key);
  const p = fn()
    .then((value) => {
      cache.set(key, { value, saved: Date.now() });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
export async function request(url) {
  const host = new URL(url).hostname;
  if ((rateLimitedUntil.get(host) || 0) > Date.now())
    throw new Error("Provider rate limit cooldown");
  const response = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(7000),
    headers: { "User-Agent": "AtlasMarkets/1.0", Accept: "application/json" },
  });
  if (response.status === 429) rateLimitedUntil.set(host, Date.now() + 60000);
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json();
}
export function normalizeYahoo(data) {
  const result = data?.chart?.result?.[0];
  if (!result || data.chart.error) throw new Error("No market data returned");
  const q = result.indicators?.quote?.[0];
  const candles = (result.timestamp || [])
    .map((time, i) => ({
      time,
      open: q?.open?.[i],
      high: q?.high?.[i],
      low: q?.low?.[i],
      close: q?.close?.[i],
      volume: q?.volume?.[i] || 0,
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
  return { meta: result.meta, candles };
}
export function normalizeBinance(rows) {
  if (!Array.isArray(rows)) throw new Error("Invalid crypto history");
  return rows
    .map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
      volume: +r[5],
    }))
    .filter((c) =>
      [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite),
    );
}
export async function history(market, period) {
  return cached(
    `history:${market.id}:${period}`,
    market.provider === "Binance" ? 20000 : 60000,
    async () => {
      const p = periodConfig[period];
      if (market.provider === "Binance") {
        const candles = normalizeBinance(
          await request(
            `https://data-api.binance.vision/api/v3/klines?symbol=${market.id}&interval=${p.binance}&limit=${p.limit}`,
          ),
        );
        if (!candles.length) throw new Error("No candles returned");
        return {
          candles,
          provider: market.provider,
          currency: market.currency,
          asOf: candles.at(-1).time * 1000,
        };
      }
      const { meta, candles } = normalizeYahoo(
        await request(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(market.id)}?interval=${p.yahooInterval}&range=${p.yahooRange}`,
        ),
      );
      if (!candles.length) throw new Error("No candles returned");
      const latest = candles.at(-1).time;
      const selected =
        period === "1D"
          ? candles.filter((c) => c.time >= latest - 86400)
          : candles.filter((c) => c.time >= latest - p.seconds);
      return {
        candles: selected,
        meta,
        provider: market.provider,
        currency: meta.currency || market.currency,
        asOf: meta.regularMarketTime * 1000,
      };
    },
  );
}
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}
export async function snapshot(period = "1D") {
  return cached(`snapshot:${period}`, 20000, async () => {
    let tickers = {};
    let cryptoError;
    if (period === "1D") {
      try {
        const symbols = JSON.stringify(
          markets.filter((m) => m.provider === "Binance").map((m) => m.id),
        );
        const data = await request(
          `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`,
        );
        if (!Array.isArray(data)) throw new Error("Invalid crypto quotes");
        tickers = Object.fromEntries(data.map((r) => [r.symbol, r]));
      } catch (e) {
        cryptoError = e;
      }
    }
    const quotes = await mapLimit(markets, 6, async (m) => {
      const safe = { ...m };
      delete safe.samplePrice;
      delete safe.sampleChange;
      try {
        if (m.provider === "Binance" && period === "1D") {
          if (cryptoError) throw cryptoError;
          const q = tickers[m.id];
          if (
            !q ||
            ![
              q.lastPrice,
              q.priceChangePercent,
              q.highPrice,
              q.lowPrice,
              q.quoteVolume,
              q.closeTime,
            ].every((v) => v != null && v !== "" && Number.isFinite(Number(v)))
          )
            throw new Error("Invalid crypto quote");
          return {
            ...safe,
            price: +q.lastPrice,
            change: +q.priceChangePercent,
            high: +q.highPrice,
            low: +q.lowPrice,
            volume: +q.quoteVolume,
            asOf: +q.closeTime,
            status: "live",
            spark: [],
          };
        }
        const h = await history(m, period);
        const last = h.candles.at(-1);
        const price = h.meta?.regularMarketPrice ?? last.close;
        if (!Number.isFinite(price)) throw new Error("Invalid market price");
        const base =
          period === "1D"
            ? (h.meta?.chartPreviousClose ??
              h.meta?.previousClose ??
              h.candles[0].open)
            : h.candles[0].open;
        return {
          ...safe,
          currency: h.currency,
          price,
          change: base ? (price / base - 1) * 100 : null,
          high:
            (period === "1D" ? h.meta?.regularMarketDayHigh : null) ??
            Math.max(...h.candles.map((c) => c.high)),
          low:
            (period === "1D" ? h.meta?.regularMarketDayLow : null) ??
            Math.min(...h.candles.map((c) => c.low)),
          volume: h.meta?.regularMarketVolume ?? null,
          asOf: h.asOf,
          status: m.provider === "Binance" ? "live" : "delayed",
          spark: h.candles
            .filter(
              (_, i) =>
                i % Math.max(1, Math.floor(h.candles.length / 24)) === 0,
            )
            .map((c) => c.close),
        };
      } catch {
        return {
          ...safe,
          price: null,
          change: null,
          asOf: null,
          status: "unavailable",
          spark: [],
        };
      }
    });
    return {
      quotes,
      fetchedAt: Date.now(),
      available: quotes.filter((q) => q.price !== null).length,
      total: quotes.length,
    };
  });
}
