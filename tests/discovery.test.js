import test from "node:test";
import assert from "node:assert/strict";
import { columns, indicators } from "../shared/hunt/engine.js";
import {
  aggregateCandles,
  aggregateColumns,
  minutesOf,
  liveDiscovery,
  strategySignals,
  simulateStrategy,
  BASE_RULES,
  FAMILIES,
} from "../shared/hunt/strategies.js";
import { normalizeTicker, mergeTicker } from "../shared/live-quotes.js";
import fixture from "./fixtures/hunt-candles.json" with { type: "json" };
const rows = Array.from({ length: 2400 }, (_, i) => ({
  time: 1700000040 + i * 60,
  open: 100 + i * 0.01,
  high: 101 + i * 0.01,
  low: 99 + i * 0.01,
  close: 100.2 + i * 0.01,
  volume: 100,
}));
test("Every 1m–14m bucket uses consecutive source minutes, correct OHLCV and UTC boundaries", () => {
  for (let minutes = 1; minutes <= 14; minutes++) {
    assert.equal(minutesOf(`${minutes}m`), minutes);
    const d = aggregateColumns(columns(rows), minutes),
      live = aggregateCandles(rows, minutes, (rows.at(-1).time + 61) * 1000);
    assert.equal(d.n, live.closed.length);
    for (let i = 0; i < d.n; i++) {
      const source = rows.filter(
        (c) => c.time >= d.time[i] && c.time < d.time[i] + minutes * 60,
      );
      assert.equal(source.length, minutes);
      assert.equal(d.time[i] % (minutes * 60), 0);
      assert.equal(d.open[i], source[0].open);
      assert.equal(d.close[i], source.at(-1).close);
      assert.equal(d.high[i], Math.max(...source.map((c) => c.high)));
      assert.equal(d.volume[i], 100 * minutes);
    }
  }
  assert.throws(() => minutesOf("15m"));
  assert.throws(() => minutesOf("0m"));
});
test("Resampling never fills missing minutes or uses a partial bucket as a closed signal", () => {
  const missing = rows.filter((_, i) => i !== 1200),
    d = aggregateColumns(columns(missing), 7);
  const bad = Math.floor(rows[1200].time / 420) * 420;
  assert.ok(!Array.from(d.time).includes(bad));
  const now = (rows.at(-1).time + 30) * 1000,
    r = aggregateCandles(rows, 3, now);
  assert.ok(r.closed.every((b) => b.time * 1000 + 180000 <= now - 500));
  assert.ok(r.current);
});
test("All strategy families are causal: appending future candles cannot change past decisions", () => {
  const cs = [
      ...fixture.candles,
      ...rows
        .slice(0, 20)
        .map((c, i) => ({
          ...c,
          time: fixture.candles.at(-1).time + (i + 1) * 60,
        })),
    ],
    d = columns(cs),
    prefix = columns(cs.slice(0, 280));
  for (const f of FAMILIES) {
    const a = strategySignals(
        prefix,
        indicators(prefix),
        BASE_RULES[f],
        "perp",
      ),
      b = strategySignals(d, indicators(d), BASE_RULES[f], "perp").filter(
        (e) => e.decision < 280,
      );
    assert.deepEqual(a, b);
  }
  const before = liveDiscovery(fixture.candles, fixture.now, "1m"),
    future = fixture.candles.map((c, i) =>
      i === 301 ? { ...c, high: c.high * 2, close: c.high * 2 } : c,
    );
  assert.deepEqual(
    liveDiscovery(future, fixture.now, "1m").candidates,
    before.candidates,
  );
});
test("Breakouts exclude the current bar from the range and enter only on the next open", () => {
  const cs = rows.slice(0, 120).map((c) => ({ ...c }));
  cs[100] = {
    ...cs[100],
    open: 101,
    high: 104,
    close: 103.9,
    low: 100.9,
    volume: 300,
  };
  const d = columns(cs),
    ind = indicators(d);
  ind.rsi[100] = 65;
  const events = strategySignals(d, ind, BASE_RULES.breakout, "spot"),
    e = events.find((e) => e.decision === 100);
  assert.ok(e);
  const trades = simulateStrategy(
    d,
    ind,
    [e],
    BASE_RULES.breakout,
    "spot",
    0,
    Infinity,
  );
  if (trades.length) assert.ok(trades[0].time >= d.time[101]);
  const modified = columns(
    cs.map((c, i) => (i === 110 ? { ...c, high: 500 } : c)),
  );
  assert.deepEqual(
    strategySignals(
      modified,
      indicators(modified),
      BASE_RULES.breakout,
      "spot",
    ).filter((e) => e.decision < 100),
    events.filter((e) => e.decision < 100),
  );
});
test("A live stream admits any supported symbol, preserves precision and rejects stale/out-of-order or invented ticks", () => {
  const now = Date.now(),
    row = {
      e: "24hrMiniTicker",
      s: "NEWCOINUSDT",
      c: "0.00000508",
      o: "0.00000500",
      h: "0.000006",
      l: "0.000004",
      q: "1000",
      E: now,
    };
  const first = normalizeTicker(row, now);
  assert.equal(first.price, 0.00000508);
  assert.equal(mergeTicker(null, first, now).flash, null);
  const next = normalizeTicker(
      { ...row, c: "0.00000509", E: now + 1000 },
      now + 1000,
    ),
    merged = mergeTicker(first, next, now + 1000);
  assert.equal(merged.flash, "up");
  assert.equal(merged.tickInterval, 1000);
  assert.equal(mergeTicker(merged, first, now + 1000), merged);
  assert.equal(
    mergeTicker(merged, { ...next, asOf: now + 2000 }, now + 2000).flash,
    null,
  );
  assert.equal(normalizeTicker({ ...row, c: "NaN" }, now), null);
  assert.equal(normalizeTicker({ ...row, E: now + 10000 }, now), null);
  assert.equal(normalizeTicker({ ...row, E: now - 130000 }, now), null);
});
