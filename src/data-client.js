import { markets, periodConfig } from "../shared/markets.js";
import { historyFile, snapshotFile } from "../shared/feed-files.js";
const staticHosting = import.meta.env.VITE_STATIC_HOSTING === "true";
const dataBase =
  "https://raw.githubusercontent.com/miku0027-ops/stock-screener/market-data";
const cryptoBase = "https://data-api.binance.vision/api/v3";
export { staticHosting };
async function json(url, signal) {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Data source returned ${response.status}`);
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
    return json(
      `${dataBase}/${historyFile(asset.id, period)}?v=${Math.floor(Date.now() / 300000)}`,
      signal,
    );
  const p = periodConfig[period];
  const rows = await json(
    `${cryptoBase}/klines?symbol=${encodeURIComponent(asset.id)}&interval=${p.binance}&limit=${p.limit}`,
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
  if (period === "1D") {
    const data = await json(
      `${cryptoBase}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(assets.map((m) => m.id)))}`,
      signal,
    );
    if (!Array.isArray(data)) throw new Error("Invalid crypto quotes");
    return assets.map((m) => {
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
  }
  return Promise.all(
    assets.map(async (m) => {
      try {
        const { candles, asOf } = await loadHistory(m, period, signal);
        const price = candles.at(-1).close,
          base = candles[0].open;
        return {
          ...emptyQuote(m),
          price,
          change: base ? (price / base - 1) * 100 : null,
          high: Math.max(...candles.map((c) => c.high)),
          low: Math.min(...candles.map((c) => c.low)),
          volume: null,
          asOf,
          status: "live",
          spark: candles.filter((_, i) => i % 8 === 0).map((c) => c.close),
        };
      } catch {
        return emptyQuote(m);
      }
    }),
  );
}
export async function loadMarkets(period, signal) {
  if (!staticHosting) return json(`/api/markets?period=${period}`, signal);
  const [crypto, stored] = await Promise.allSettled([
    cryptoQuotes(period, signal),
    json(
      `${dataBase}/${snapshotFile(period)}?v=${Math.floor(Date.now() / 300000)}`,
      signal,
    ),
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const cryptos = crypto.status === "fulfilled" ? crypto.value : [];
  const snapshot = stored.status === "fulfilled" ? stored.value : null;
  const quotes = markets.map((m) => {
    if (m.provider === "Binance")
      return cryptos.find((q) => q.id === m.id) || emptyQuote(m);
    const q = snapshot?.quotes?.find((q) => q.id === m.id);
    if (!q || !Number.isFinite(q.price)) return emptyQuote(m);
    return {
      ...q,
      status:
        q.status === "stale" || Date.now() - snapshot.fetchedAt > 20 * 60 * 1000
          ? "stale"
          : "snapshot",
    };
  });
  return {
    quotes,
    available: quotes.filter((q) => Number.isFinite(q.price)).length,
    total: quotes.length,
    fetchedAt: Date.now(),
  };
}
