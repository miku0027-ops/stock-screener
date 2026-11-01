import { test, expect } from "@playwright/test";
import { demoSnapshot, demoHistory } from "../../shared/demo.js";
import { markets } from "../../shared/markets.js";
async function sources(page, stale = false) {
  const now = Date.now();
  await page.route("https://data-api.binance.vision/**", (route) => {
    if (route.request().url().includes("/klines"))
      return route.fulfill({
        json: demoHistory(markets[0]).map((c) => [
          c.time * 1000,
          String(c.open),
          String(c.high),
          String(c.low),
          String(c.close),
          String(c.volume),
        ]),
      });
    return route.fulfill({
      json: markets
        .filter((m) => m.provider === "Binance")
        .map((m) => ({
          symbol: m.id,
          lastPrice: String(m.samplePrice + 100),
          priceChangePercent: "1.50",
          highPrice: String(m.samplePrice + 150),
          lowPrice: String(m.samplePrice),
          quoteVolume: "1234",
          closeTime: now,
        })),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/history/")
        ? { candles: demoHistory(markets.find((m) => m.symbol === "SPX")) }
        : {
            fetchedAt: stale ? now - 3600000 : now,
            quotes: demoSnapshot()
              .filter((m) => m.provider !== "Binance")
              .map((m) => ({
                ...m,
                price: m.price + 50,
                asOf: now,
                status: "snapshot",
              })),
          },
    }),
  );
}
test("Firebase build serves real-mode data and charts without an API server", async ({
  page,
}) => {
  const errors = [],
    apiCalls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/markets") || r.url().includes("/api/history"))
      apiCalls.push(r.url());
  });
  await sources(page);
  await page.goto("/");
  await expect(page.locator(".heat-tile")).toHaveCount(49);
  await expect(page.locator(".asset-price")).toContainText("97,532.18");
  await expect(page.locator(".detail-status")).toHaveText("LIVE");
  await page.getByRole("button", { name: /S&P 500,.*View chart/ }).click();
  await expect(page.locator(".detail-status")).toHaveText("SNAPSHOT");
  await expect(page.locator(".asset-price")).toContainText("6,164.63");
  await expect(page.locator(".chart-host canvas").first()).toBeVisible();
  await page
    .locator(".chart-periods")
    .getByRole("button", { name: "1Y", exact: true })
    .click();
  await expect(page.locator(".chart-host canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
});
test("overdue global snapshots are labeled stale rather than live", async ({
  page,
}) => {
  await sources(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: /S&P 500,.*View chart/ }).click();
  await expect(page.locator(".detail-status")).toHaveText("STALE");
});
test("missing static feed does not insert demo data into live crypto", async ({
  page,
}) => {
  await sources(page);
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/");
  await expect(page.locator(".notice")).toContainText("39 feeds unavailable");
  await page.getByRole("button", { name: /S&P 500,.*View chart/ }).click();
  await expect(page.locator(".asset-price")).toContainText("—");
  await expect(page.locator(".detail-status")).toHaveText("UNAVAILABLE");
});
