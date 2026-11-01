import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/wss:\/\//, (ws) => ws.close());
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sharpnex-profile", '"defensive"');
    localStorage.setItem("sharpnex-view", '"heatmap"');
  });
});
import { demoSnapshot, demoHistory } from "../../shared/demo.js";
import { markets } from "../../shared/markets.js";
import unlocks from "../../data/announced-unlocks.json" with { type: "json" };
async function feeds(page, { failCandles = false } = {}) {
  const now = Date.now(),
    end = Math.floor(now / 60000) * 60000;
  const rows = Array.from({ length: 900 }, (_, i) => {
    const time = end - (899 - i) * 60000,
      p = 100 + Math.sin(i * 0.4) * 3 + i * 0.01;
    return [
      time,
      String(p),
      String(p + 2),
      String(p - 2),
      String(p + 0.1),
      "100",
      time + 59999,
    ];
  });
  let count = 0;
  const limits = [];
  await page.route("https://data-api.binance.vision/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/time"))
      return route.fulfill({ json: { serverTime: Date.now() } });
    if (url.pathname.endsWith("/depth"))
      return route.fulfill({
        json: { bids: [["99", "2"]], asks: [["100", "2"]] },
      });
    if (url.pathname.endsWith("/klines")) {
      if (url.searchParams.get("interval") === "1m") {
        limits.push(url.searchParams.get("limit"));
        return failCandles
          ? route.fulfill({ status: 503, body: "unavailable" })
          : route.fulfill({
              json:
                url.searchParams.get("limit") === "5" ? rows.slice(-5) : rows,
            });
      }
      return route.fulfill({
        json: demoHistory(markets[0]).map((c) => [
          c.time * 1000,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
          c.time * 1000 + 299999,
        ]),
      });
    }
    if (url.pathname.endsWith("/exchangeInfo"))
      return route.fulfill({ json: { symbols: [] } });
    if (url.searchParams.get("type") === "MINI")
      return route.fulfill({ json: [] });
    count++;
    return route.fulfill({
      json: markets
        .filter((m) => m.provider === "Binance")
        .map((m) => ({
          symbol: m.id,
          lastPrice: String(m.samplePrice + count),
          priceChangePercent: "2",
          highPrice: String(m.samplePrice + 20),
          lowPrice: String(m.samplePrice - 10),
          quoteVolume: "1000",
          closeTime: now + count * 2000,
        })),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("announced-unlocks")
        ? unlocks
        : {
            quotes: demoSnapshot()
              .filter((m) => m.provider !== "Binance")
              .map((m) => ({ ...m, asOf: now, status: "snapshot" })),
            fetchedAt: now,
          },
    }),
  );
  await page.route("https://api.alternative.me/**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            value: "34",
            value_classification: "Fear",
            timestamp: String(Math.floor(now / 1000)),
          },
        ],
      },
    }),
  );
  return { limits, getCount: () => count };
}
test("two-second heatmap samples real changes, leaves global markets neutral and pauses", async ({
  page,
}) => {
  await page.clock.install();
  const mock = await feeds(page);
  await page.goto("/");
  await expect(page.locator(".asset-price")).toContainText("97,433.18");
  await page
    .getByLabel("Heatmap timeframe")
    .getByRole("button", { name: "2s", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Heatmap timeframe")
      .getByRole("button", { name: "2s", exact: true }),
  ).toHaveClass("active");
  await page.clock.fastForward(2100);
  await expect(page.locator(".heat-tile.flash-up")).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: /Bitcoin,.*View chart/ }),
  ).not.toContainText("—");
  await expect(
    page.getByRole("button", { name: /S&P 500,.*View chart/ }),
  ).toContainText("Delayed");
  await page.getByLabel("Pause auto refresh", { exact: true }).click();
  const count = mock.getCount();
  await page.clock.fastForward(10000);
  expect(mock.getCount()).toBe(count);
  await expect(
    page.getByRole("button", { name: /Bitcoin,.*View chart/ }),
  ).toContainText("—");
});
test("one-minute hunt and optional five-minute analysis use candles, incremental history and modal details", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = await feeds(page);
  await page.goto("/");
  await page.getByLabel("Trade hunt", { exact: true }).click();
  await expect(page.getByLabel("More timeframes")).toHaveValue("all");
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.locator(".five-minute-chart canvas").first()).toBeVisible();
  await expect(page.locator(".hunt-queue-foot")).toContainText("Quotes 1s");
  await expect
    .poll(() => mock.limits.includes("5"), { timeout: 25000 })
    .toBe(true);
  await page.getByLabel("Hunt ETHUSDT 5m", { exact: true }).click();
  await expect(page.locator(".hunt-chart-heading")).toContainText("ETHUSDT");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.locator(".hunt-modal-body")).toContainText(
    "October 2026 holdout",
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
test("unavailable candles suppress discovery and inspection", async ({
  page,
}) => {
  await feeds(page, { failCandles: true });
  await page.goto("/");
  await page.getByLabel("Trade hunt", { exact: true }).click();
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.locator(".hunt-chart-overlay")).toContainText(
    "Source unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Inspect setup" }),
  ).toBeDisabled();
  await expect(page.locator(".hunt-opportunity")).toContainText(
    "No entry call",
  );
});
test("only source-verified declared unlock dates appear and unknown coins stay absent", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T12:00:00Z"));
  await feeds(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Unlocks and market context", { exact: true }).click();
  await expect(page.locator(".unlock-row")).toHaveCount(5);
  await expect(page.locator(".unlock-row").first()).toContainText("15 Nov");
  await expect(
    page.locator(".unlock-row").first().getByRole("link"),
  ).toHaveAttribute("href", "https://docs.starknet.io/learn/protocol/strk");
  await page.getByLabel("Search announced unlocks").fill("SUI");
  await expect(page.locator(".unlock-row")).toHaveCount(0);
  await expect(page.locator(".context-empty")).toContainText("No verified");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
test("demo mode never generates an actionable RSI signal", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("atlas-mode", '"demo"'));
  await page.goto("/");
  await page.getByLabel("Trade hunt", { exact: true }).click();
  await expect(page.locator(".hunt-note")).toContainText("Live data required");
  await expect(page.locator(".hunt-opportunity")).toContainText(
    "No entry call",
  );
});
