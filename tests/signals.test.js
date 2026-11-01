import test from "node:test";
import assert from "node:assert/strict";
import {
  rsiWilder,
  findDivergences,
  evaluateSetup,
  analyzeFiveMinute,
  sampleChange,
} from "../shared/signals.js";
import { declaredUnlocks } from "../shared/unlocks.js";
import { readFile } from "node:fs/promises";
const fixture = () =>
  Array.from({ length: 32 }, (_, i) => ({
    time: i * 300,
    closeTime: (i + 1) * 300000 - 1,
    open: 111 + i * 0.1,
    close: 111 + i * 0.1,
    high: 113 + i * 0.1,
    low: 110 + i * 0.1,
    volume: 100,
  }));
test("Wilder RSI matches published reference calculation and flat/rising/falling boundaries", () => {
  const prices = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64,
  ];
  const r = rsiWilder(prices);
  assert.equal(
    r.slice(0, 14).every((v) => v === null),
    true,
  );
  assert.ok(Math.abs(r[14] - 70.4641350211) < 1e-8);
  assert.ok(Math.abs(r[15] - 66.2496185536) < 1e-8);
  assert.equal(rsiWilder(Array(30).fill(1)).at(-1), 50);
  assert.equal(
    rsiWilder(Array.from({ length: 30 }, (_, i) => i + 1)).at(-1),
    100,
  );
  assert.equal(
    rsiWilder(Array.from({ length: 30 }, (_, i) => 30 - i)).at(-1),
    0,
  );
});
test("bullish divergence is absent until all three right-hand candles close", () => {
  const c = fixture();
  c[8].low = 100;
  c[18].low = 98;
  const r = Array(c.length).fill(50);
  r[8] = 28;
  r[18] = 35;
  assert.equal(findDivergences(c.slice(0, 21), r).length, 0);
  const [e] = findDivergences(c.slice(0, 22), r);
  assert.equal(e.direction, "bull");
  assert.equal(e.confirmed, 21);
  assert.equal(e.first, 8);
  assert.equal(e.second, 18);
  const future = c.map((v) => ({ ...v }));
  future[30].low = 1;
  assert.deepEqual(findDivergences(future.slice(0, 22), r), [e]);
  r[18] = 29;
  assert.equal(findDivergences(c, r).length, 0);
});
test("bearish divergence uses higher price highs, lower RSI and overbought pivot", () => {
  const c = fixture();
  c[8].high = 125;
  c[18].high = 130;
  const r = Array(c.length).fill(50);
  r[8] = 75;
  r[18] = 69;
  const [e] = findDivergences(c, r);
  assert.equal(e.direction, "bear");
  assert.equal(e.confirmed, 21);
});
test("setup waits for a closed breakout, expires, and resolves ambiguous bars conservatively", () => {
  const c = fixture();
  c[8].low = 100;
  c[18].low = 98;
  const r = Array(c.length).fill(50);
  r[8] = 28;
  r[18] = 35;
  const e = findDivergences(c, r)[0],
    atr = Array(c.length).fill(2);
  assert.equal(evaluateSetup(e, c.slice(0, 22), atr).state, "watch");
  c[23] = { ...c[23], close: 118, high: 119 };
  const triggered = evaluateSetup(e, c.slice(0, 24), atr);
  assert.equal(triggered.state, "triggered");
  assert.equal(triggered.entry, 118);
  assert.equal(triggered.stop, 97.5);
  assert.equal(triggered.target, 159);
  c[24] = { ...c[24], high: 170, low: 96 };
  assert.equal(evaluateSetup(e, c.slice(0, 25), atr).state, "invalidated");
  const untriggered = fixture();
  untriggered[8].low = 100;
  untriggered[18].low = 98;
  for (let i = 22; i < 32; i++) untriggered[i].close = 112;
  assert.equal(evaluateSetup(e, untriggered, atr).state, "expired");
});
test("open candles cannot change analysis; gaps, invalid bars and stale clocks suppress signals", () => {
  const candles = Array.from({ length: 120 }, (_, i) => ({
    time: i * 300,
    closeTime: (i + 1) * 300000 - 1,
    open: 100 + Math.sin(i),
    close: 100 + Math.sin(i + 0.1),
    high: 102,
    low: 98,
    volume: 100 + i,
  }));
  const serverNow = candles.at(-1).time * 1000 + 150000;
  const a = analyzeFiveMinute(candles, serverNow);
  assert.equal(a.status, "ready");
  assert.equal(a.candles.length, 119);
  const forming = candles.map((c) => ({ ...c }));
  forming.at(-1).close = 1000000;
  assert.deepEqual(analyzeFiveMinute(forming, serverNow), a);
  assert.equal(
    analyzeFiveMinute(
      candles.filter((_, i) => i !== 50),
      serverNow,
    ).status,
    "unavailable",
  );
  assert.equal(analyzeFiveMinute(candles, NaN).status, "unavailable");
  const stale = analyzeFiveMinute(candles, candles.at(-1).closeTime + 311000);
  assert.equal(stale.status, "stale");
  assert.equal(stale.active, null);
});
test("two-second returns use provider sample timestamps and reject gaps or repeated quotes", () => {
  const prev = { price: 100, asOf: 10000 };
  assert.ok(
    Math.abs(sampleChange(prev, { price: 101, asOf: 12000 }).change - 1) <
      1e-10,
  );
  assert.equal(sampleChange(prev, { price: 101, asOf: 10000 }).change, null);
  assert.equal(sampleChange(prev, { price: 101, asOf: 16000 }).change, null);
  assert.equal(sampleChange(null, { price: 101, asOf: 12000 }).change, null);
  assert.equal(sampleChange(prev, { price: 100, asOf: 12000 }).change, 0);
  assert.equal(sampleChange(prev, { price: 101 }).change, null);
  assert.equal(sampleChange(prev, { price: 0, asOf: 12000 }).change, null);
});
test("unlock calendar admits only declared, dated, source-verified upcoming events", async () => {
  const initial = JSON.parse(
    await readFile(new URL("../data/announced-unlocks.json", import.meta.url)),
  );
  const now = Date.parse("2026-11-01T12:00:00Z");
  assert.equal(declaredUnlocks(initial.events, now).length, 5);
  const base = initial.events[0];
  const invalid = [
    { ...base, status: "estimated" },
    { ...base, date: "" },
    { ...base, source: "" },
    { ...base, date: "2026-02-31" },
    { ...base, date: "2026-10-15" },
    { ...base, checkedAt: "2026-01-01" },
  ];
  assert.deepEqual(declaredUnlocks(invalid, now), []);
  assert.equal(
    declaredUnlocks(initial.events, Date.parse("2027-04-01")).length,
    0,
  );
});
