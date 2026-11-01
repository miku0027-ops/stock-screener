import { test, expect } from "@playwright/test";
import { markets } from "../../shared/markets.js";
import { demoSnapshot } from "../../shared/demo.js";
async function fixture(page) {
  const now = Date.now(),
    end = Math.floor(now / 60000) * 60000,
    coins = ["BTC", "ETH", "NEWCOIN"];
  let stream, tape;
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(() =>
    localStorage.setItem("sharpnex-profile", '"defensive"'),
  );
  await page.routeWebSocket(/!miniTicker/, (ws) => {
    stream = ws;
  });
  await page.routeWebSocket(/@aggTrade/, (ws) => {
    tape = ws;
  });
  await page.route("https://data-api.binance.vision/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith("/exchangeInfo"))
      return route.fulfill({
        json: {
          symbols: coins.map((c) => ({
            symbol: c + "USDT",
            baseAsset: c,
            quoteAsset: "USDT",
            status: "TRADING",
            isSpotTradingAllowed: true,
          })),
        },
      });
    if (u.pathname.endsWith("/time"))
      return route.fulfill({ json: { serverTime: now } });
    if (u.pathname.endsWith("/ticker/bookTicker"))
      return route.fulfill({ json: { bidPrice: "100", askPrice: "100.01" } });
    if (u.pathname.endsWith("/aggTrades"))
      return route.fulfill({
        json: [{ a: 1, p: "100.0123", q: "2.5", T: now, m: false }],
      });
    if (u.pathname.endsWith("/klines")) {
      const endAt = +(u.searchParams.get("endTime") || end),
        last = Math.floor(endAt / 60000) * 60000;
      return route.fulfill({
        json: Array.from(
          { length: u.searchParams.get("limit") === "5" ? 5 : 1000 },
          (_, i) => {
            const n = u.searchParams.get("limit") === "5" ? 5 : 1000,
              t = last - (n - 1 - i) * 60000,
              p = 100 + Math.sin((t / 60000) * 0.2);
            return [t, p, p + 0.2, p - 0.2, p + 0.05, 100, t + 59999];
          },
        ),
      });
    }
    const raw =
      u.searchParams.get("type") === "MINI"
        ? coins.map((c) => ({ id: c + "USDT", samplePrice: 100 }))
        : markets.filter((m) => m.provider === "Binance");
    return route.fulfill({
      json: raw.map((m) => ({
        symbol: m.id,
        lastPrice: m.samplePrice,
        openPrice: m.samplePrice,
        priceChangePercent: 0,
        highPrice: m.samplePrice,
        lowPrice: m.samplePrice,
        quoteVolume: 100000,
        closeTime: now,
      })),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("research.json")
        ? { fetchedAt: now, events: [], articles: [], sources: [] }
        : {
            fetchedAt: now,
            quotes: demoSnapshot()
              .filter((q) => q.provider !== "Binance")
              .map((q) => ({ ...q, status: "snapshot", asOf: now })),
          },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".coin-row")).toHaveCount(3);
  const send = (price, time = now + 1000) =>
    stream.send(
      JSON.stringify([
        {
          e: "24hrMiniTicker",
          s: "NEWCOINUSDT",
          c: String(price),
          o: "100",
          h: "110",
          l: "90",
          q: "100000",
          E: time,
        },
      ]),
    );
  return {
    now,
    send,
    trade: () =>
      tape.send(
        JSON.stringify({
          e: "aggTrade",
          a: 2,
          p: "100.0256",
          q: "1",
          T: now + 1000,
          m: true,
        }),
      ),
  };
}
test("All supported coins stream changes, unchanged prices do not flash, and Crypto expands beyond the curated catalog", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.clock.fastForward(1000);
  f.send(100.123456);
  await page.clock.fastForward(1000);
  const row = page.getByLabel("Analyze NEWCOINUSDT", { exact: true });
  await expect(row).toContainText("100.1235");
  await expect(row).toHaveClass(/coin-flash-up/);
  await expect(page.locator(".rail-heading")).toContainText("1s STREAM");
  f.send(100.123456, f.now + 2000);
  await page.clock.fastForward(1000);
  await expect(row).not.toHaveClass(/coin-flash-up/);
  await page.getByLabel("Market heatmap", { exact: true }).click();
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(page.locator(".heat-tile")).toHaveCount(3);
  await page.getByLabel("Search markets").fill("NEWCOIN");
  await expect(page.locator(".heat-tile")).toHaveCount(1);
});
test("One combined scanner supports every sub-15m timeframe and displays genuine market prints separately", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.clock.fastForward(1000);
  f.trade();
  await page.clock.fastForward(1000);
  await expect(page.locator(".market-tape")).toContainText("100.0256");
  await expect(page.locator(".market-tape")).toContainText("Live executions");
  await expect(page.getByLabel("More timeframes")).toHaveValue("all");
  await expect(
    page.getByLabel("More timeframes").locator("option"),
  ).toHaveCount(15);
  for (const tf of ["1m", "3m", "5m", "14m"]) {
    await page.getByLabel("More timeframes").selectOption(tf);
    await expect(page.locator(".hunt-chart-heading")).toContainText(tf);
    await expect(
      page.getByRole("button", { name: "Inspect setup" }),
    ).toBeEnabled();
  }
  await page.getByLabel("Strategy family").selectOption("pullback");
  await expect(page.getByLabel("Strategy family")).toHaveValue("pullback");
  await expect(page.locator(".five-minute-chart canvas").first()).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(page.locator(".market-tape")).toContainText("Waiting / stale");
  await page.getByLabel("Pause hunt").click();
  await expect(page.locator(".market-tape")).toContainText("Paused");
  await expect(page.locator(".rail-heading")).toContainText("STALE");
});
test("New releases prompt a cache-busting reload and mobile controls stay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/version.json?*", (route) =>
    route.fulfill({ json: { revision: "abcdef123456" } }),
  );
  await fixture(page);
  await expect(
    page.getByRole("button", { name: "Update available · Reload" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update available · Reload" }).click();
  await expect(page).toHaveURL(/v=abcdef123456/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
