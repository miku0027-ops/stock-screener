import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeYahoo,
  normalizeBinance,
  cached,
  mapLimit,
} from "../server/providers.js";
import { demoHistory } from "../shared/demo.js";
import { markets, periodConfig } from "../shared/markets.js";
import { app } from "../server/index.js";

test("Yahoo candles discard missing OHLC values and retain provider metadata", () => {
  const result = normalizeYahoo({
    chart: {
      result: [
        {
          meta: { currency: "JPY", regularMarketTime: 123 },
          timestamp: [1, 2, 3],
          indicators: {
            quote: [
              {
                open: [100, null, 103],
                high: [102, null, 105],
                low: [99, null, 101],
                close: [101, null, 104],
                volume: [22, null, 24],
              },
            ],
          },
        },
      ],
    },
  });
  assert.equal(result.candles.length, 2);
  assert.equal(result.meta.currency, "JPY");
  assert.deepEqual(result.candles[1], {
    time: 3,
    open: 103,
    high: 105,
    low: 101,
    close: 104,
    volume: 24,
  });
  assert.throws(() =>
    normalizeYahoo({ chart: { result: null, error: { code: "Not Found" } } }),
  );
});
test("Binance history converts milliseconds and numeric strings", () => {
  assert.deepEqual(
    normalizeBinance([[1700000000000, "10", "12", "9", "11", "123"]]),
    [{ time: 1700000000, open: 10, high: 12, low: 9, close: 11, volume: 123 }],
  );
  assert.throws(() => normalizeBinance({ code: -1 }));
});
test("cache coalesces concurrent requests and retries failed requests", async () => {
  let calls = 0;
  const key = "test-" + Date.now();
  const make = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return 42;
  };
  assert.deepEqual(
    await Promise.all([cached(key, 10000, make), cached(key, 10000, make)]),
    [42, 42],
  );
  assert.equal(calls, 1);
  await assert.rejects(
    cached(key + "fail", 10000, async () => {
      throw Error("temporary");
    }),
  );
  assert.equal(await cached(key + "fail", 10000, async () => 7), 7);
});
test("concurrency limiter bounds work and preserves input ordering", async () => {
  let active = 0,
    max = 0;
  const output = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return x * 2;
  });
  assert.deepEqual(output, [2, 4, 6, 8, 10]);
  assert.equal(max, 2);
});
test("demo chart OHLC is ordered and valid for every market and timeframe", () => {
  for (const market of markets)
    for (const period of Object.keys(periodConfig)) {
      const candles = demoHistory(market, period);
      assert.equal(candles.length, 96);
      candles.forEach((c, i) => {
        assert.ok(c.high >= Math.max(c.open, c.close));
        assert.ok(c.low <= Math.min(c.open, c.close));
        assert.ok(c.low > 0);
        if (i) assert.ok(c.time > candles[i - 1].time);
      });
      assert.ok(Math.abs(candles.at(-1).close - market.samplePrice) < 0.000001);
    }
});
test("HTTP API validates timeframe and symbol before contacting providers", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + "/api/health")).status, 200);
    assert.equal(
      (await fetch(base + "/api/history?symbol=https://example.com&period=1D"))
        .status,
      400,
    );
    assert.equal(
      (await fetch(base + "/api/history?symbol=BTCUSDT&period=BAD")).status,
      400,
    );
    assert.equal((await fetch(base + "/api/markets?period=BAD")).status, 400);
    assert.equal((await fetch(base + "/api/unknown")).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
