import { markets, periodConfig } from "../shared/markets.js";
import { historyFile, snapshotFile } from "../shared/feed-files.js";
const staticHosting = import.meta.env.VITE_STATIC_HOSTING === "true";
const dataBase =
  "https://raw.githubusercontent.com/miku0027-ops/stock-screener/market-data";
const cryptoBase = "https://data-api.binance.vision/api/v3";
export { staticHosting };
const cache = new Map();
const pending = new Map();
const snapshots = new Map();
const snapshotRetry = new Map();
const snapshotRequests = new Map();
async function cachedJSON(url, ttl, signal) {
  const saved = cache.get(url);
  if (saved && Date.now() - saved.time < ttl) return saved.value;
  if (pending.has(url)) return pending.get(url);
  const p = json(url, signal)
    .then((value) => {
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      cache.set(url, { time: Date.now(), value });
      return value;
    })
    .finally(() => pending.delete(url));
  pending.set(url, p);
  return p;
}
async function json(url, signal) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const e = new Error(`Data source returned ${response.status}`);
    e.status = response.status;
    throw e;
  }
  return response.json();
}
function emptyQuote(m) {
  const { samplePrice, sampleChange, ...safe } = m;
  return {
    ...safe,
    price: null,
    change: null,
    asOf: null,
    status: "unavailable",
    spark: [],
  };
}
export async function loadHistory(asset, period, signal) {
  if (!staticHosting)
    return json(
      `/api/history?symbol=${encodeURIComponent(asset.id)}&period=${period}`,
      signal,
    );
  if (asset.provider !== "Binance")
    return cachedJSON(
      `${dataBase}/${historyFile(asset.id, period)}?v=${Math.floor(Date.now() / 300000)}`,
      60000,
      signal,
    );
  const p = periodConfig[period];
  const rows = await cachedJSON(
    `${cryptoBase}/klines?symbol=${encodeURIComponent(asset.id)}&interval=${p.binance}&limit=${p.limit}`,
    30000,
    signal,
  );
  if (!Array.isArray(rows)) throw new Error("No crypto history");
  const candles = rows
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
  if (!candles.length) throw new Error("No candles");
  return { candles, provider: "Binance", asOf: candles.at(-1).time * 1000 };
}
async function cryptoQuotes(period, signal) {
  const assets = markets.filter((m) => m.provider === "Binance");
  {
    const data = await json(
      `${cryptoBase}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(assets.map((m) => m.id)))}`,
      signal,
    );
    if (!Array.isArray(data)) throw new Error("Invalid crypto quotes");
    const quotes = assets.map((m) => {
      const q = data.find((q) => q.symbol === m.id);
      if (
        !q ||
        ![
          q.lastPrice,
          q.priceChangePercent,
          q.highPrice,
          q.lowPrice,
          q.closeTime,
        ].every((v) => v != null && v !== "" && Number.isFinite(+v))
      )
        return emptyQuote(m);
      return {
        ...emptyQuote(m),
        price: +q.lastPrice,
        change: +q.priceChangePercent,
        high: +q.highPrice,
        low: +q.lowPrice,
        volume: +q.quoteVolume,
        asOf: +q.closeTime,
        status: "live",
      };
    });
    if (period === "1D") return quotes;
    return Promise.all(
      quotes.map(async (q) => {
        if (q.price == null) return q;
        try {
          const h = await loadHistory(q, period, signal),
            base = h.candles[0].open;
          return {
            ...q,
            change: base ? (q.price / base - 1) * 100 : null,
            spark: h.candles.filter((_, i) => i % 8 === 0).map((c) => c.close),
          };
        } catch {
          return { ...q, change: null };
        }
      }),
    );
  }
}
export async function loadMarkets(period, signal) {
  if (!staticHosting) return json(`/api/markets?period=${period}`, signal);
  // Global feeds must never hold up a two-second crypto sample.
  if (Date.now() >= (snapshotRetry.get(period) || 0)) {
    snapshotRetry.set(period, Date.now() + 300000);
    const job = cachedJSON(
      `${dataBase}/${snapshotFile(period)}?v=${Math.floor(Date.now() / 300000)}`,
      300000,
      signal,
    )
      .then((value) => snapshots.set(period, value))
      .catch(() => snapshotRetry.set(period, Date.now() + 30000))
      .finally(() => snapshotRequests.delete(period));
    snapshotRequests.set(period, job);
  }
  const [crypto] = await Promise.allSettled([cryptoQuotes(period, signal)]);
  if (crypto.status === "rejected" && !snapshots.has(period))
    await snapshotRequests.get(period);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const retryAfterMs =
    crypto.status === "rejected" && crypto.reason?.status === 429 ? 60000 : 0;
  const cryptos = crypto.status === "fulfilled" ? crypto.value : [];
  const snapshot = snapshots.get(period) || null;
  const quotes = markets.map((m) => {
    if (m.provider === "Binance")
      return cryptos.find((q) => q.id === m.id) || emptyQuote(m);
    const q = snapshot?.quotes?.find((q) => q.id === m.id);
    if (!q || !Number.isFinite(q.price)) return emptyQuote(m);
    return {
      ...q,
      status:
        q.status === "stale" ||
        Date.now() - snapshot.fetchedAt >
          (period === "1D" ? 20 : 120) * 60 * 1000
          ? "stale"
          : "snapshot",
    };
  });
  return {
    quotes,
    available: quotes.filter((q) => Number.isFinite(q.price)).length,
    total: quotes.length,
    fetchedAt: Date.now(),
    retryAfterMs,
  };
}
