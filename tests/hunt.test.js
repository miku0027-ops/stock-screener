import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/hunt-candles.json" with { type: "json" };
import {
  columns,
  indicators,
  divergences,
  liveScan,
  simulate,
  plan,
  stats,
  DEFAULT_RULE,
} from "../shared/hunt/engine.js";
import { assessHunt } from "../shared/hunt/assessment.js";
import { rsiWilder } from "../shared/signals.js";
const { candles, now } = fixture;
test("Wilder RSI agrees with the independent existing implementation; indicators are causal", () => {
  const d = columns(candles),
    i = indicators(d),
    reference = rsiWilder(candles.map((c) => c.close));
  for (let n = 14; n < d.n; n++)
    assert.ok(Math.abs(i.rsi[n] - reference[n]) < 1e-10);
  const cut = columns(candles.slice(0, 300)),
    early = indicators(cut);
  for (const k of ["rsi", "atr", "fast", "slow", "rv"])
    for (let n = 80; n < 300; n++) assert.equal(i[k][n], early[k][n]);
  assert.deepEqual(
    divergences(cut, early),
    divergences(d, i).filter((e) => e.confirmed < 300),
  );
});
test("Live one-minute breakout waits for a candle close, cannot repaint with future data, and expires after one entry bar", () => {
  const result = liveScan(candles, now);
  assert.equal(result.candidate.stage, "triggered");
  assert.equal(result.candidate.triggered, 300);
  assert.equal(liveScan(candles, now - 1500).candidate.stage, "watch");
  const poisoned = candles.map((c, i) =>
    i === 301 ? { ...c, high: c.high * 2, close: c.high * 2 } : c,
  );
  assert.deepEqual(liveScan(poisoned, now).candidate, result.candidate);
  assert.equal(liveScan(candles, now + 60000).candidate, null);
  assert.equal(liveScan(candles, now + 180000).status, "stale");
});
test("Missing minutes reset indicators and suppress signals through a fresh warmup", () => {
  const broken = candles.filter((_, i) => i !== 280),
    d = columns(broken),
    i = indicators(d);
  assert.equal(i.age[280], 0);
  assert.ok(Number.isNaN(i.rsi[280]));
  assert.equal(liveScan(broken, now).candidate, null);
  assert.equal(liveScan(broken, now).status, "warming");
});
test("Costs can make a nominal 2R scalp infeasible and targets stay fixed when entry drifts", () => {
  const tiny = plan(100, 99.95, 1, 2, "spot");
  assert.ok(tiny.netR < 0);
  const original = plan(100, 99, 1, 2, "spot"),
    chased = plan(101, 99, 1, 2, "spot", 1, 1, original.target);
  assert.equal(chased.target, 102);
  assert.ok(chased.netR < original.netR);
});
function executionCase() {
  const cs = Array.from({ length: 100 }, (_, n) => ({
    time: 1000 + n * 60,
    open: 100,
    high: 100.2,
    low: 99.8,
    close: 100,
    volume: 100,
  }));
  cs[81] = { ...cs[81], high: 101.2, close: 101 };
  cs[82] = { ...cs[82], open: 101, high: 108, low: 97, close: 103 };
  const d = columns(cs),
    i = {
      age: new Uint32Array(100).fill(100),
      rv: new Float64Array(100).fill(2),
      slow: new Float64Array(100).fill(99),
      atr: new Float64Array(100).fill(5),
    };
  return {
    d,
    i,
    e: [{ direction: 1, confirmed: 80, pivot: 78, trigger: 100.5, stop: 98 }],
  };
}
test("Simulation enters next open, applies stop-first ambiguity and tests the same trades under doubled costs", () => {
  const { d, i, e } = executionCase(),
    trades = simulate(d, i, e, DEFAULT_RULE, "spot", 0, Infinity),
    stress = simulate(d, i, e, DEFAULT_RULE, "spot", 0, Infinity, 2);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].time, d.time[82]);
  assert.equal(trades[0].exit, d.time[82]);
  assert.equal(trades[0].reason, "stop");
  assert.equal(trades[0].netR, -1);
  assert.equal(stress.length, 1);
  assert.equal(stress[0].time, trades[0].time);
  d.low[82] = 99;
  d.high[82] = 103;
  d.close[82] = 102;
  d.open[83] = 97;
  const gap = simulate(d, i, e, DEFAULT_RULE, "spot", 0, Infinity);
  assert.equal(gap[0].reason, "gap-stop");
  assert.ok(gap[0].netR < -1);
});
test("No trades cross a data gap or enter outside the chronological split", () => {
  const { d, i, e } = executionCase();
  i.age[82] = 0;
  assert.equal(simulate(d, i, e, DEFAULT_RULE, "spot", 0, Infinity).length, 0);
  i.age[82] = 100;
  assert.equal(
    simulate(d, i, e, DEFAULT_RULE, "spot", 0, d.time[82]).length,
    0,
  );
  assert.equal(
    simulate(d, i, e, DEFAULT_RULE, "spot", d.time[81], Infinity).length,
    0,
  );
});
function assessmentCase() {
  const d = liveScan(candles, now);
  d.symbol = "BTCUSDT";
  d.venue = "spot";
  d.interval = "1m";
  d.receivedAt = now;
  d.rule = DEFAULT_RULE;
  d.candidate.relativeVolume = 2;
  d.candidate.family = "divergence";
  d.currentCandle = candles.at(-1);
  const quote = {
    symbol: d.symbol,
    venue: "spot",
    bid: d.candidate.entry - 0.01,
    ask: d.candidate.entry + 0.01,
    price: d.candidate.entry,
    spreadBps: 0.003,
    asOf: now,
    receivedAt: now,
  };
  const research = {
    sources: ["bls-calendar", "fed-calendar"].map((id) => ({
      id,
      kind: "calendar",
      checkedAt: now,
      status: "ok",
    })),
    events: [],
  };
  const model = {
    symbol: d.symbol,
    venue: "spot",
    verdict: "positive-sample",
    interval: "1m",
    family: "divergence",
  };
  return { d, quote, research, model };
}
test("Eligibility fails closed for events, stale data, chasing, pause, unmatched evidence and invalidated stops", () => {
  const { d, quote, research, model } = assessmentCase(),
    check = (
      dd = d,
      q = quote,
      r = research,
      m = model,
      n = now,
      paused = false,
    ) => assessHunt(dd, q, r, "defensive", m, n, paused);
  assert.equal(check().eligible, true);
  assert.equal(
    check(d, quote, { ...research, events: [{ priority: "major", at: now }] })
      .eligible,
    false,
  );
  assert.equal(check(d, quote, { sources: [], events: [] }).eligible, false);
  assert.equal(check(d, quote, research, model, now + 9000).eligible, false);
  assert.equal(check(d, quote, research, model, now, true).eligible, false);
  assert.equal(
    check(d, { ...quote, ask: quote.ask + d.atr * 2 }).eligible,
    false,
  );
  assert.equal(
    check(d, quote, research, { ...model, verdict: "no-demonstrated-edge" })
      .eligible,
    false,
  );
  assert.equal(check({ ...d, interval: "5m" }).eligible, false);
  assert.equal(
    check({ ...d, venue: "perp" }, { ...quote, venue: "perp" }).eligible,
    false,
  );
  assert.equal(
    check({
      ...d,
      currentCandle: { ...d.currentCandle, low: d.candidate.stop - 1 },
    }).eligible,
    false,
  );
});
test("Statistics use net outcomes and expose insufficient samples without fake accuracy", () => {
  assert.equal(stats([]).winRate, null);
  assert.equal(stats([]).expectancyR, null);
  const s = stats([{ netR: 1 }, { netR: -1 }, { netR: -0.5 }]);
  assert.equal(s.wins, 1);
  assert.equal(s.winRate, 1 / 3);
  assert.equal(s.maxDrawdownR, 1.5);
  assert.ok(s.winInterval[0] < s.winRate && s.winInterval[1] > s.winRate);
});
