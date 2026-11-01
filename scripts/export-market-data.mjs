import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { markets, periodConfig } from "../shared/markets.js";
import { history, mapLimit } from "../server/providers.js";
import { historyFile, snapshotFile } from "../shared/feed-files.js";
const output = path.resolve(process.argv[2] || "/tmp/atlas-market-data");
const read = async (name) => {
  try {
    return JSON.parse(await readFile(path.join(output, name), "utf8"));
  } catch {
    return null;
  }
};
const write = async (name, data) => {
  const file = path.join(output, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data) + "\n");
};
const now = Date.now();
let successful = 0,
  failed = 0;
for (const period of Object.keys(periodConfig)) {
  const old = await read(snapshotFile(period));
  // Longer histories refresh hourly; intraday quotes refresh on each workflow run.
  if (period !== "1D" && old?.available > 0 && now - old.fetchedAt < 3600000)
    continue;
  const quotes = await mapLimit(
    markets.filter((m) => m.provider !== "Binance"),
    3,
    async (m) => {
      const { samplePrice, sampleChange, ...safe } = m;
      try {
        const h = await history(m, period);
        const price = h.meta?.regularMarketPrice ?? h.candles.at(-1).close;
        if (!Number.isFinite(price)) throw Error("No quote");
        const base =
          period === "1D"
            ? (h.meta?.chartPreviousClose ??
              h.meta?.previousClose ??
              h.candles[0].open)
            : h.candles[0].open;
        await write(historyFile(m.id, period), { ...h, fetchedAt: now });
        successful++;
        return {
          ...safe,
          price,
          change: base ? (price / base - 1) * 100 : null,
          currency: h.currency,
          asOf: h.asOf,
          status: "snapshot",
          high:
            (period === "1D" ? h.meta?.regularMarketDayHigh : null) ??
            Math.max(...h.candles.map((c) => c.high)),
          low:
            (period === "1D" ? h.meta?.regularMarketDayLow : null) ??
            Math.min(...h.candles.map((c) => c.low)),
          volume: h.meta?.regularMarketVolume ?? null,
          spark: h.candles
            .filter(
              (_, i) =>
                i % Math.max(1, Math.floor(h.candles.length / 24)) === 0,
            )
            .map((c) => c.close),
        };
      } catch {
        failed++;
        const previous = old?.quotes.find(
          (q) => q.id === m.id && Number.isFinite(q.price),
        );
        return previous
          ? { ...previous, status: "stale" }
          : {
              ...safe,
              price: null,
              change: null,
              asOf: null,
              status: "unavailable",
              spark: [],
            };
      }
    },
  );
  await write(snapshotFile(period), {
    quotes,
    fetchedAt: now,
    available: quotes.filter((q) => Number.isFinite(q.price)).length,
    total: quotes.length,
  });
}
await write("status.json", {
  attemptedAt: now,
  successful,
  failed,
  notice:
    "Scheduled public market snapshots. Provider timestamps remain authoritative; unavailable sources are never replaced with demo data.",
});
console.log(JSON.stringify({ successful, failed }));
