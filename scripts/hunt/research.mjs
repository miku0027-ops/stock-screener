import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  PROTOCOL,
  CANDIDATES,
  COSTS,
  DEFAULT_RULE,
  indicators,
  divergences,
  simulate,
  stats,
} from "../../shared/hunt/engine.js";
const root = process.argv[2] || "/tmp/sharpnex-history",
  out = process.argv[3] || "public/research/hunt-validation.json";
const at = (s) => Date.parse(s) / 1000,
  splits = {
    train: [at("2023-01-01"), at("2025-01-01")],
    validation: [at("2025-01-01"), at("2026-01-01")],
    test: [at("2026-01-01"), at("2026-10-01")],
  };
const report = {
  protocol: PROTOCOL,
  generatedAt: Date.now(),
  timeframe: "1m",
  source: "Binance public monthly archives",
  sourceUrl: "https://data.binance.vision/",
  costs: COSTS,
  candidates: CANDIDATES.length,
  splits,
  models: [],
  limitations: [
    "OHLC backtest; assumed fees, spread, slippage and perpetual funding. No order-queue simulation.",
    "No historical news, calendar or profile gating; live filters change the tested strategy.",
    "Binance perpetual evidence is a proxy, not a Hyperliquid venue validation.",
    "Selected BTC/ETH only; no claim across other assets. Fixed-date holdout; no probability forecast.",
  ],
};
for (const venue of ["spot", "perp"])
  for (const symbol of ["BTCUSDT", "ETHUSDT"]) {
    const file = path.join(
        root,
        `${venue === "spot" ? "spot" : "futures-um"}-${symbol}.bin`,
      ),
      b = await readFile(file),
      raw = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8),
      n = raw.length / 6,
      d = { n };
    ["time", "open", "high", "low", "close", "volume"].forEach((k, j) => {
      d[k] = new Float64Array(n);
      for (let i = 0; i < n; i++) d[k][i] = raw[i * 6 + j];
    });
    const ind = indicators(d),
      events = new Map();
    let rows = [];
    for (const rule of CANDIDATES) {
      const key = `${rule.right}:${rule.delta}`;
      if (!events.has(key)) events.set(key, divergences(d, ind, rule));
      const ev = events.get(key),
        train = stats(simulate(d, ind, ev, rule, venue, ...splits.train));
      rows.push({ rule, train });
    }
    // Predeclared selection: top five training expectancy candidates with >=100 trades,
    // then validation expectancy with >=30 trades. Never inspect test to choose rules.
    const ranked = rows
      .filter((r) => r.train.trades >= 100)
      .sort((a, b) => b.train.expectancyR - a.train.expectancyR)
      .slice(0, 5);
    for (const r of ranked)
      r.validation = stats(
        simulate(
          d,
          ind,
          events.get(`${r.rule.right}:${r.rule.delta}`),
          r.rule,
          venue,
          ...splits.validation,
        ),
      );
    let chosen = ranked
      .filter((r) => r.validation.trades >= 30)
      .sort((a, b) => b.validation.expectancyR - a.validation.expectancyR)[0];
    const selectionAdequate = !!chosen;
    if (!chosen) {
      chosen = rows.find(
        (r) => JSON.stringify(r.rule) === JSON.stringify(DEFAULT_RULE),
      );
      chosen.validation = stats(
        simulate(
          d,
          ind,
          events.get(`${chosen.rule.right}:${chosen.rule.delta}`),
          chosen.rule,
          venue,
          ...splits.validation,
        ),
      );
    }
    console.log(
      JSON.stringify({
        symbol,
        venue,
        trainingCandidates: rows.map((r) => ({
          rule: r.rule,
          trades: r.train.trades,
          expectancyR: r.train.expectancyR,
        })),
      }),
    );
    const ev = events.get(`${chosen.rule.right}:${chosen.rule.delta}`),
      testTrades = simulate(d, ind, ev, chosen.rule, venue, ...splits.test),
      test = stats(testTrades),
      stress = stats(
        simulate(d, ind, ev, chosen.rule, venue, ...splits.test, 2),
      );
    const monthly = [];
    for (let m = 1; m <= 9; m++) {
      const from = at(`2026-${String(m).padStart(2, "0")}-01`),
        to = at(`2026-${String(m + 1).padStart(2, "0")}-01`);
      monthly.push({
        month: `2026-${String(m).padStart(2, "0")}`,
        ...stats(testTrades.filter((t) => t.time >= from && t.time < to)),
      });
    }
    const model = {
      symbol,
      venue,
      selectionAdequate,
      rule: chosen.rule,
      rows: n,
      gaps: Array.from(ind.age).filter((x) => x === 0).length - 1,
      train: chosen.train,
      validation: chosen.validation,
      test,
      stress,
      monthly,
      selection: ranked,
      trainingCandidates: rows,
      verdict:
        selectionAdequate &&
        test.trades >= 100 &&
        test.expectancyR > 0 &&
        stress.expectancyR > 0 &&
        chosen.validation.expectancyR > 0
          ? "positive-sample"
          : "no-demonstrated-edge",
    };
    report.models.push(model);
    console.log(
      JSON.stringify({
        symbol,
        venue,
        rule: model.rule,
        test,
        stress,
        verdict: model.verdict,
      }),
    );
  }
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
report.archives = manifest.archives.map(({ url, sha256, bytes, status }) => ({
  url,
  sha256,
  bytes,
  status,
}));
report.engineSha256 = createHash("sha256")
  .update(
    await readFile(new URL("../../shared/hunt/engine.js", import.meta.url)),
  )
  .digest("hex");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 2) + "\n");
