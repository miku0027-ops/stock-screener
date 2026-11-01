import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetch, EnvHttpProxyAgent } from "undici";
import { analyzeFiveMinute } from "../shared/signals.js";
import { backtestSpot, alignedCorrelation } from "../shared/analysis.js";
import { historyFile } from "../shared/feed-files.js";
const dir = path.resolve(process.argv[2] || "/tmp/atlas-market-data"),
  now = Date.now(),
  file = path.join(dir, "validation.json"),
  dispatcher = new EnvHttpProxyAgent();
let previous;
try {
  previous = JSON.parse(await readFile(file, "utf8"));
} catch {}
if (previous && now - previous.fetchedAt < 86400000) {
  console.log("Retaining same-day research validation");
  process.exit(0);
}
async function get(url) {
  const r = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error(`Source HTTP ${r.status}`);
  return r.json();
}
const base = "https://data-api.binance.vision/api/v3";
const models = [];
for (const symbol of ["BTCUSDT", "ETHUSDT"]) {
  try {
    const clock = await get(`${base}/time`);
    let cursor = clock.serverTime - 14 * 86400000;
    const rows = [];
    for (let page = 0; page < 5; page++) {
      const batch = await get(
        `${base}/klines?symbol=${symbol}&interval=5m&startTime=${cursor}&limit=1000`,
      );
      if (!Array.isArray(batch) || !batch.length) break;
      rows.push(...batch);
      cursor = +batch.at(-1)[0] + 300000;
      if (cursor >= clock.serverTime) break;
    }
    const candles = rows.map((r) => ({
      time: +r[0] / 1000,
      closeTime: +r[6],
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
      volume: +r[5],
    }));
    const analysis = analyzeFiveMinute(candles, clock.serverTime);
    if (analysis.status !== "ready")
      throw Error(analysis.reason || "Candle validation failed");
    const from = clock.serverTime - 7 * 86400000,
      result = backtestSpot(analysis.candles, { from });
    models.push({
      symbol,
      status: "ok",
      from,
      to: analysis.lastCandleAt,
      bars: analysis.candles.length,
      ...result,
    });
  } catch (e) {
    models.push({ symbol, status: "unavailable", reason: e.message });
  }
}
const correlations = [];
try {
  const btc = await get(`${base}/klines?symbol=BTCUSDT&interval=1d&limit=180`);
  const reference = btc
    .filter((r) => +r[6] < now)
    .map((r) => ({ time: +r[0] / 1000, close: +r[4] }));
  for (const [symbol, label] of [
    ["^GSPC", "S&P 500"],
    ["DX-Y.NYB", "Dollar index"],
    ["GC=F", "Gold futures"],
    ["CL=F", "WTI crude"],
    ["^VIX", "VIX"],
  ]) {
    try {
      const h = JSON.parse(
        await readFile(path.join(dir, historyFile(symbol, "1Y")), "utf8"),
      );
      if (
        !Number.isFinite(h.fetchedAt) ||
        now - h.fetchedAt > 48 * 3600000 ||
        now - h.candles.at(-1).time * 1000 > 7 * 86400000
      )
        throw Error("Global history is stale");
      correlations.push({
        symbol,
        label,
        ...alignedCorrelation(
          reference,
          h.candles.filter((c) => c.time * 1000 < now - 86400000),
        ),
      });
    } catch {
      correlations.push({ symbol, label, pearson: null, n: 0 });
    }
  }
} catch {}
const out = {
  fetchedAt: now,
  method:
    "Fixed RSI divergence baseline · spot long only · next-bar open · no parameter optimization",
  costs:
    "10 bps fee + 5 bps slippage per side; no leverage. Gaps fill adversely; stop wins ambiguous bars.",
  scope:
    "Recent 7-day evaluation after warmup. Excludes profile, news and macro filters. This is not predictive validation of the full platform. Historical candles cannot reproduce live fills.",
  models,
  correlations,
};
await mkdir(dir, { recursive: true });
await writeFile(file, JSON.stringify(out) + "\n");
console.log(
  JSON.stringify({
    models: models.map((m) => ({
      symbol: m.symbol,
      status: m.status,
      trades: m.n,
      wins: m.wins,
      expectancyR: m.expectancyR,
    })),
    correlations: correlations.length,
  }),
);
