import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/wss:\/\//, (ws) => ws.close());
});
import { markets } from "../../shared/markets.js";
import { demoSnapshot } from "../../shared/demo.js";
async function feeds(page) {
  const now = Date.now(),
    end = Math.floor(now / 300000) * 300000,
    requests = [];
  const bars = (base = 100, interval = "1m") =>
    Array.from({ length: 500 }, (_, i) => {
      const step = interval === "1m" ? 60000 : 300000,
        t = Math.floor(now / step) * step - (499 - i) * step,
        p = base + Math.sin(i * 0.3) * 2 + i * 0.01;
      return {
        t,
        T: t + (interval === "1m" ? 59999 : 299999),
        o: String(p),
        h: String(p + 2),
        l: String(p - 2),
        c: String(p + 0.1),
        v: "100",
      };
    });
  const coins = [
    "BTC",
    "ETH",
    "SOL",
    "PEPE",
    ...Array.from({ length: 55 }, (_, i) => `COIN${i}`),
  ];
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
    if (u.pathname.endsWith("/depth"))
      return route.fulfill({
        json: { bids: [["100", "5"]], asks: [["100.01", "5"]] },
      });
    if (u.pathname.endsWith("/klines"))
      return route.fulfill({
        json: bars(100, u.searchParams.get("interval")).map((c) => [
          c.t,
          c.o,
          c.h,
          c.l,
          c.c,
          c.v,
          c.T,
        ]),
      });
    return route.fulfill({
      json: (u.searchParams.get("type") === "MINI"
        ? coins.map((c) => ({ id: c + "USDT", samplePrice: 100 }))
        : markets.filter((m) => m.provider === "Binance")
      ).map((m) => ({
        symbol: m.id,
        lastPrice: String(m.samplePrice),
        openPrice: String(m.samplePrice - 1),
        priceChangePercent: "1",
        highPrice: String(m.samplePrice + 2),
        lowPrice: String(m.samplePrice - 2),
        quoteVolume: "100000",
        closeTime: now,
      })),
    });
  });
  await page.route("https://api.hyperliquid.xyz/info", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body.type);
    if (body.type === "metaAndAssetCtxs")
      return route.fulfill({
        json: [
          { universe: [{ name: "BTC" }, { name: "ETH" }] },
          [0, 1].map(() => ({
            funding: "0.0000125",
            openInterest: "1000",
            markPx: "1000",
            oraclePx: "999",
          })),
        ],
      });
    if (body.type === "l2Book")
      return route.fulfill({
        json: {
          time: now,
          levels: [[{ px: "1000", sz: "10" }], [{ px: "1000.1", sz: "10" }]],
        },
      });
    if (body.type === "candleSnapshot")
      return route.fulfill({ json: bars(1000, body.req.interval) });
    return route.fulfill({ status: 400 });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("/research.json"))
      return route.fulfill({
        json: {
          fetchedAt: now,
          sources: ["bls-calendar", "fed-calendar"].map((id) => ({
            id,
            name: id,
            kind: "calendar",
            status: "ok",
            checkedAt: now,
            url: "https://www.federalreserve.gov/",
          })),
          events: [
            {
              id: "cpi",
              title: "Consumer Price Index",
              at: now + 86400000,
              timePrecision: "minute",
              priority: "major",
              source: "BLS",
              url: "https://www.bls.gov/schedule/",
            },
          ],
          articles: [
            {
              id: "news1",
              title: "Source-reported policy announcement",
              source: "Federal Reserve",
              sourceId: "fed",
              primary: true,
              at: now,
              topic: "Monetary policy",
              tags: [],
              url: "https://www.federalreserve.gov/newsevents/pressreleases.htm",
            },
          ],
        },
      });
    if (url.includes("/validation.json"))
      return route.fulfill({
        json: { fetchedAt: now, models: [], correlations: [] },
      });
    return route.fulfill({
      json: {
        fetchedAt: now,
        quotes: demoSnapshot()
          .filter((q) => q.provider !== "Binance")
          .map((q) => ({ ...q, status: "snapshot", asOf: now })),
      },
    });
  });
  return requests;
}
async function open(page) {
  await feeds(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start hunting" }).click();
  await expect(page.locator(".hunt-opportunity")).toContainText("Waiting");
}
test("SHARPNEX profile choices and theme persist, and price charts have only candle styles", async ({
  page,
}) => {
  await feeds(page);
  await page.goto("/");
  await expect(page).toHaveTitle("SHARPNEX — Divergence Research");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(5);
  await page.getByRole("radio", { name: /Low risk · high return/ }).check();
  await page.getByRole("button", { name: "Start hunting" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Switch to light theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".five-minute-chart canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Heikin-Ashi", exact: true }).click();
  await expect(page.locator(".hunt-chart-bottom")).toContainText(
    "HA synthetic display",
  );
  await expect(page.getByRole("button", { name: /line chart/i })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Trader profile", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Low risk · high return/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Searchable coin rail supports non-curated markets, mobile scrolling and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: /Markets 59/ }).click();
  await expect(page.locator(".coin-row")).toHaveCount(59);
  const dimensions = await page
    .locator(".coin-scroll")
    .evaluate((e) => ({ height: e.clientHeight, scroll: e.scrollHeight }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
  await page.getByLabel("Search all coins").fill("PEPE");
  await expect(page.locator(".coin-row")).toHaveCount(1);
  await page.getByLabel("Analyze PEPEUSDT", { exact: true }).click();
  await expect(page.locator(".hunt-chart-heading")).toContainText("PEPEUSDT");
  await expect(page.locator(".hunt-opportunity")).toContainText("Waiting");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
test("Perpetual analysis uses independent venue candles and read-only requests, and missing contracts fail closed", async ({
  page,
}) => {
  const requests = await feeds(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start hunting" }).click();
  await expect(page.locator(".hunt-opportunity")).toContainText("Waiting");
  await page.getByRole("button", { name: "Perpetual", exact: true }).click();
  await expect(page.locator(".hunt-chart-heading")).toContainText("BTC-PERP");
  await expect(page.locator(".hunt-price")).toContainText("1,000");
  await expect(
    page.getByRole("button", { name: "Inspect setup" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Inspect setup" }).click();
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.locator(".hunt-modal-body")).toContainText("0.00125%");
  await page.keyboard.press("Escape");
  expect(requests).toContain("candleSnapshot");
  expect(
    requests.every((v) =>
      ["metaAndAssetCtxs", "l2Book", "candleSnapshot", "recentTrades"].includes(
        v,
      ),
    ),
  ).toBe(true);
  await page.getByLabel("Search all coins").fill("PEPE");
  await page.getByLabel("Analyze PEPEUSDT", { exact: true }).click();
  await expect(page.locator(".hunt-chart-overlay")).toContainText(
    "No supported perpetual",
  );
  await expect(
    page.getByRole("button", { name: "Inspect setup" }),
  ).toBeDisabled();
});
test("World monitor retains attribution and calendar links rather than invented news interpretation", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("World monitor", { exact: true }).click();
  await expect(page.locator(".headline-list article")).toHaveCount(1);
  await expect(page.locator(".headline-list")).toContainText(
    "Source-reported policy announcement",
  );
  await expect(page.locator(".headline-list a")).toHaveAttribute(
    "href",
    "https://www.federalreserve.gov/newsevents/pressreleases.htm",
  );
  await expect(page.locator(".event-ribbon")).toContainText(
    "Consumer Price Index",
  );
  await page.getByText("Sources & coverage", { exact: true }).click();
  await expect(page.locator(".source-monitor")).toContainText(
    "Publisher-reported headlines",
  );
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(page.locator(".headline-list")).toContainText(
    "No source-backed headlines",
  );
});
