import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { indicators, stats, COSTS } from "../../shared/hunt/engine.js";
import {
  DISCOVERY_PROTOCOL,
  FAMILIES,
  BASE_RULES,
  RESEARCH_RULES,
  aggregateColumns,
  strategySignals,
  simulateStrategy,
} from "../../shared/hunt/strategies.js";
const history = process.argv[2] || "/tmp/sharpnex-history",
  holdout = process.argv[3] || "/tmp/sharpnex-october",
  output = process.argv[4] || "public/research/discovery-validation.json";
const at = (s) => Date.parse(s) / 1000,
  splits = {
    train: [at("2023-01-01"), at("2025-01-01")],
    validation: [at("2025-01-01"), at("2026-01-01")],
    test: [at("2026-10-01"), at("2026-10-31")],
  };
async function load(root, venue, symbol) {
  const b = await readFile(
      path.join(
        root,
        `${venue === "spot" ? "spot" : "futures-um"}-${symbol}.bin`,
      ),
    ),
    a = new Float64Array(b.buffer, b.byteOffset, b.length / 8),
    d = { n: a.length / 6 };
  for (const [j, k] of [
    "time",
    "open",
    "high",
    "low",
    "close",
    "volume",
  ].entries()) {
    d[k] = new Float64Array(d.n);
    for (let i = 0; i < d.n; i++) d[k][i] = a[i * 6 + j];
  }
  return d;
}
const report = {
  protocol: DISCOVERY_PROTOCOL,
  generatedAt: Date.now(),
  source: "Binance checksum-verified archives",
  sourceUrl: "https://data.binance.vision/",
  costs: COSTS,
  splits,
  candidates: RESEARCH_RULES.length,
  models: [],
  limitations: [
    "October is a short holdout. Win frequency is not a forecast. Multiple model comparisons were not corrected for statistical significance.",
    "Each family is tested separately; the combined scanner is not a validated portfolio.",
    "Live dynamic-universe, news, calendar, liquidity and profile filters are not historically tested.",
    "Binance perpetual history does not validate Hyperliquid fills. No leverage or liquidation simulation.",
    "Fees, spread, slippage and funding are explicit assumptions; actual execution may be worse.",
  ],
};
for (const venue of ["spot", "perp"])
  for (const symbol of ["BTCUSDT", "ETHUSDT"]) {
    const raw = await load(history, venue, symbol),
      selected = [];
    // Rule selection is completed before this symbol's new October data is read.
    for (let minutes = 1; minutes <= 14; minutes++) {
      const d = aggregateColumns(raw, minutes),
        ind = indicators(d, minutes * 60);
      for (const family of FAMILIES) {
        const memo = new Map(),
          rows = [];
        const events = (rule) => {
          const key = JSON.stringify({ ...rule, targetR: 0 });
          if (!memo.has(key))
            memo.set(key, strategySignals(d, ind, rule, venue));
          return memo.get(key);
        };
        for (const rule of RESEARCH_RULES.filter((r) => r.family === family)) {
          const train = stats(
            simulateStrategy(
              d,
              ind,
              events(rule),
              rule,
              venue,
              ...splits.train,
              minutes,
            ),
          );
          rows.push({ rule, train });
        }
        const ranked = rows
          .filter((r) => r.train.trades >= 100)
          .sort((a, b) => b.train.expectancyR - a.train.expectancyR)
          .slice(0, 3);
        for (const row of ranked)
          row.validation = stats(
            simulateStrategy(
              d,
              ind,
              events(row.rule),
              row.rule,
              venue,
              ...splits.validation,
              minutes,
            ),
          );
        let chosen = ranked
          .filter((r) => r.validation.trades >= 30)
          .sort(
            (a, b) => b.validation.expectancyR - a.validation.expectancyR,
          )[0];
        const adequate = !!chosen;
        if (!chosen) {
          const rule = BASE_RULES[family];
          chosen = {
            rule,
            train: stats(
              simulateStrategy(
                d,
                ind,
                events(rule),
                rule,
                venue,
                ...splits.train,
                minutes,
              ),
            ),
            validation: stats(
              simulateStrategy(
                d,
                ind,
                events(rule),
                rule,
                venue,
                ...splits.validation,
                minutes,
              ),
            ),
          };
        }
        selected.push({
          symbol,
          venue,
          interval: `${minutes}m`,
          family,
          rule: chosen.rule,
          train: chosen.train,
          validation: chosen.validation,
          selectionAdequate: adequate,
          selection: ranked,
          rows: d.n,
        });
      }
    }
    console.log(
      `${venue} ${symbol}: all 42 models selected without October data`,
    );
    const testRaw = await load(holdout, venue, symbol),
      manifest = JSON.parse(
        await readFile(path.join(holdout, "manifest.json"), "utf8"),
      );
    for (let minutes = 1; minutes <= 14; minutes++) {
      const d = aggregateColumns(testRaw, minutes),
        ind = indicators(d, minutes * 60);
      for (const m of selected.filter((m) => m.interval === `${minutes}m`)) {
        const events = strategySignals(d, ind, m.rule, venue);
        m.test = stats(
          simulateStrategy(
            d,
            ind,
            events,
            m.rule,
            venue,
            ...splits.test,
            minutes,
          ),
        );
        m.stress = stats(
          simulateStrategy(
            d,
            ind,
            events,
            m.rule,
            venue,
            ...splits.test,
            minutes,
            2,
          ),
        );
        m.testRows = d.n;
        m.missingDays = manifest.archives
          .filter(
            (a) =>
              a.venue === (venue === "spot" ? "spot" : "futures/um") &&
              a.symbol === symbol &&
              a.status === "missing",
          )
          .map((a) => a.date);
        m.verdict =
          m.selectionAdequate &&
          m.test.trades >= 100 &&
          m.train.expectancyR > 0 &&
          m.validation.expectancyR > 0 &&
          m.test.expectancyR > 0 &&
          m.stress.expectancyR > 0
            ? "positive-sample"
            : "no-demonstrated-edge";
        report.models.push(m);
      }
    }
    console.log(`${venue} ${symbol}: October evaluation complete`);
  }
report.archives = [];
for (const root of [history, holdout]) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  report.archives.push(
    ...manifest.archives.map(({ url, sha256, bytes, status, error }) => ({
      url,
      sha256,
      bytes,
      status,
      error,
    })),
  );
}
report.engineSha256 = createHash("sha256")
  .update(
    await readFile(new URL("../../shared/hunt/engine.js", import.meta.url)),
  )
  .update(
    await readFile(new URL("../../shared/hunt/strategies.js", import.meta.url)),
  )
  .digest("hex");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    models: report.models.length,
    positive: report.models.filter((m) => m.verdict === "positive-sample")
      .length,
  }),
);
