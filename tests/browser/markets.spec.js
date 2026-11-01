import { test, expect } from "@playwright/test";
import { demoSnapshot, demoHistory } from "../../shared/demo.js";
import { markets } from "../../shared/markets.js";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("atlas-mode", '"demo"'));
});
test("heatmap, category filters, search, chart selection and sizes work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".heat-tile")).toHaveCount(49);
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(page.locator(".heat-tile")).toHaveCount(10);
  await page.getByLabel("Search markets").fill("solana");
  await expect(page.locator(".heat-tile")).toHaveCount(1);
  await page.locator(".heat-tile").click();
  await expect(page.locator(".detail-heading h2")).toHaveText("Solana");
  await page
    .locator(".chart-periods")
    .getByRole("button", { name: "1M", exact: true })
    .click();
  await page.getByRole("button", { name: "Show candlesticks" }).click();
  await expect(page.locator(".chart-host canvas").first()).toBeVisible();
  await page.getByLabel("Clear search").click();
  await page.getByRole("button", { name: "All markets", exact: true }).click();
  await page.getByLabel("Tile size").selectOption("equal");
  await expect(page.locator(".heat-tile")).toHaveCount(49);
  await page
    .getByLabel("Heatmap timeframe")
    .getByRole("button", { name: "1W", exact: true })
    .click();
  await expect(page.locator(".toolbar-note")).toContainText("Period");
  await page.getByLabel("Search markets").fill("no-such-market");
  await expect(page.getByText("No assets here yet")).toBeVisible();
  expect(errors).toEqual([]);
});
test("watchlist persists and CSV exports the current view", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Solana,.*View chart/ }).click();
  await page.getByLabel("Add to watchlist").click();
  await page.reload();
  await page.getByLabel("My watchlist", { exact: true }).click();
  await expect(page.locator(".heat-tile")).toHaveCount(5);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe("atlas-demo-1D.csv");
  const stream = await file.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk;
  expect(csv).toContain("Solana");
  expect(csv).toContain("DEMO");
  expect(csv.split("\n")).toHaveLength(6);
});
test("all-unavailable live feeds fall back with explicit demo labeling", async ({
  page,
}) => {
  await page.route("**/api/markets?*", (route) =>
    route.fulfill({
      json: { quotes: [], available: 0, total: 49, fetchedAt: Date.now() },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Connect live" }).click();
  await expect(page.locator(".notice")).toContainText("illustrative demo data");
  await expect(page.locator(".feed-pill")).toHaveText("DEMO DATA");
  await expect(page.locator(".heat-tile")).toHaveCount(49);
});
test("partial live results keep unavailable quotes empty and load actual API candles", async ({
  page,
}) => {
  const quotes = demoSnapshot().map((q, i) => ({
    ...q,
    status: i === 0 ? "live" : "unavailable",
    price: i === 0 ? 101234 : null,
    change: i === 0 ? 1.4 : null,
    asOf: i === 0 ? Date.now() : null,
    spark: [],
  }));
  await page.route("**/api/markets?*", (route) =>
    route.fulfill({
      json: { quotes, available: 1, total: 49, fetchedAt: Date.now() },
    }),
  );
  await page.route("**/api/history?*", (route) =>
    route.fulfill({ json: { candles: demoHistory(markets[0]) } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Connect live" }).click();
  await expect(page.locator(".asset-price")).toContainText("101,234");
  await expect(page.locator(".notice")).toContainText("48 feeds unavailable");
  await expect(page.locator(".detail-status")).toHaveText("LIVE");
  await page.getByRole("button", { name: /Ethereum,.*View chart/ }).click();
  await expect(page.locator(".asset-price")).toContainText("—");
  await expect(page.locator(".detail-status")).toHaveText("UNAVAILABLE");
});
test("mobile fits viewport and dialogs support keyboard dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".heat-tile")).toHaveCount(49);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByLabel("Data sources", { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Expand map", { exact: true }).click();
  await expect(page.locator(".detail-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".detail-panel")).toBeVisible();
});

test("live price changes flash and pausing stops scheduled requests", async ({
  page,
}) => {
  await page.clock.install();
  let requests = 0;
  const sampleBase = Date.now();
  await page.route("**/api/markets?*", (route) => {
    requests++;
    const quotes = demoSnapshot().map((q) => ({
      ...q,
      price: q.price + requests,
      status: "live",
      asOf: sampleBase + requests * 2000,
    }));
    return route.fulfill({
      json: { quotes, available: 49, total: 49, fetchedAt: Date.now() },
    });
  });
  await page.route("**/api/history?*", (route) =>
    route.fulfill({ json: { candles: demoHistory(markets[0]) } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Connect live" }).click();
  await expect(page.locator(".detail-status")).toHaveText("LIVE");
  expect(requests).toBe(1);
  await page.clock.fastForward(2100);
  await expect(page.locator(".heat-tile.flash-up")).toHaveCount(10);
  await page.getByLabel("Pause auto refresh", { exact: true }).click();
  const pausedRequests = requests;
  await page.clock.fastForward(90000);
  expect(requests).toBe(pausedRequests);
  await page.getByLabel("Resume auto refresh", { exact: true }).click();
  await expect.poll(() => requests).toBe(pausedRequests + 1);
});
