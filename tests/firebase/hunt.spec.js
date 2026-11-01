import { test, expect } from "@playwright/test";
import fixture from "../fixtures/hunt-candles.json" with { type: "json" };
import { markets } from "../../shared/markets.js";
import { demoSnapshot } from "../../shared/demo.js";
async function setup(page, { rateLimited = false, noCandidate = false } = {}) {
  await page.clock.install({ time: new Date(fixture.now) });
  await page.addInitScript(() =>
    localStorage.setItem("sharpnex-profile", '"defensive"'),
  );
  let failCandles = false;
  let quotes = 0,
    scans = 0;
  const paths = [];
  await page.route("https://data-api.binance.vision/**", async (route) => {
    const u = new URL(route.request().url());
    paths.push(u.pathname);
    if (u.pathname.endsWith("/time"))
      return route.fulfill({ json: { serverTime: fixture.now } });
    if (u.pathname.endsWith("/exchangeInfo"))
      return route.fulfill({ json: { symbols: [] } });
    if (u.pathname.endsWith("/ticker/bookTicker")) {
      quotes++;
      return rateLimited
        ? route.fulfill({ status: 429 })
        : route.fulfill({
            json: { bidPrice: "91856.14", askPrice: "91856.16" },
          });
    }
    if (u.pathname.endsWith("/klines")) {
      scans++;
      if (failCandles) return route.fulfill({ status: 503 });
      return route.fulfill({
        json: fixture.candles.map((c) =>
          noCandidate
            ? [c.time * 1000, 100, 101, 99, 100, 100, c.time * 1000 + 59999]
            : [
                c.time * 1000,
                c.open,
                c.high,
                c.low,
                c.close,
                c.volume,
                c.time * 1000 + 59999,
              ],
        ),
      });
    }
    return route.fulfill({
      json: markets
        .filter((m) => m.provider === "Binance")
        .map((m) => ({
          symbol: m.id,
          lastPrice: m.samplePrice,
          openPrice: m.samplePrice,
          priceChangePercent: 0,
          highPrice: m.samplePrice,
          lowPrice: m.samplePrice,
          quoteVolume: 100000,
          closeTime: fixture.now,
        })),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    if (route.request().url().includes("hunt-validation"))
      return route.fulfill({ status: 404 });
    if (route.request().url().includes("research.json"))
      return route.fulfill({
        json: {
          fetchedAt: fixture.now,
          articles: [],
          events: [],
          sources: ["bls-calendar", "fed-calendar"].map((id) => ({
            id,
            kind: "calendar",
            status: "ok",
            checkedAt: fixture.now,
          })),
        },
      });
    return route.fulfill({
      json: {
        fetchedAt: fixture.now,
        quotes: demoSnapshot()
          .filter((q) => q.provider !== "Binance")
          .map((q) => ({ ...q, asOf: fixture.now, status: "snapshot" })),
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Inspect setup" }),
  ).toBeEnabled();
  return {
    counts: () => ({ quotes, scans }),
    fail: () => {
      failCandles = true;
    },
    paths,
  };
}
test("A real historical divergence fixture produces a conditional plan modal, never a fabricated accuracy claim", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.getByRole("button", { name: "Inspect setup" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("Reference entry");
  await expect(modal).toContainText("91,856.15");
  await expect(modal).toContainText("Stop reference");
  await expect(modal).toContainText("Target reference");
  await expect(modal).toContainText("Net reward / risk");
  await expect(modal).toContainText("No qualified entry recommendation");
  await modal.getByText("Risk sizing", { exact: true }).click();
  await page.getByLabel("Equity in USD").fill("1000");
  await expect(modal).toContainText("$2.50");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(modal).toContainText("No demonstrated edge after costs");
  await expect(modal).toContainText("10.0%");
  await expect(modal).toContainText("10");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(modal).toContainText("Binance spot");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Inspect setup" }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
test("Quote polling targets two seconds, pausing stops it, and expired hunts cannot remain eligible in an open modal", async ({
  page,
}) => {
  const mock = await setup(page);
  await page.clock.fastForward(2100);
  await expect.poll(() => mock.counts().quotes).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Inspect setup" }).click();
  await page.clock.fastForward(9000);
  await expect(page.locator(".hunt-modal-status")).toContainText("Stale");
  await page.keyboard.press("Escape");
  await page.getByLabel("Pause hunt").click();
  const before = mock.counts();
  await page.clock.fastForward(90000);
  expect(mock.counts()).toEqual(before);
  await expect(page.locator(".hunt-title")).toContainText("Paused");
  await page.getByRole("button", { name: "Inspect setup" }).click();
  await expect(page.locator(".hunt-modal-status")).toContainText("0s left");
  await expect(page.getByRole("dialog")).toContainText(
    "No qualified entry recommendation",
  );
});
test("HTTP 429 backs off instead of hammering the quote API", async ({
  page,
}) => {
  const mock = await setup(page, { rateLimited: true });
  await expect.poll(() => mock.counts().quotes).toBe(1);
  await page.clock.fastForward(20000);
  expect(mock.counts().quotes).toBe(1);
  await expect(page.locator(".hunt-chart-bottom")).toContainText("quote stale");
});
test("Light theme preserves selected-control contrast and the trade modal fits a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByLabel("Switch to light theme").click();
  const colors = await page
    .getByRole("button", { name: "1m", exact: true })
    .evaluate((e) => ({
      color: getComputedStyle(e).color,
      background: getComputedStyle(e).backgroundColor,
    }));
  expect(colors.color).not.toBe(colors.background);
  await page.getByRole("button", { name: "Inspect setup" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box.width).toBeLessThan(390);
  expect(box.height).toBeLessThan(844);
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await page.keyboard.press("Tab");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.contains(document.activeElement)),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("An open empty-state modal survives a candle-feed outage without displaying a new entry", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = await setup(page, { noCandidate: true });
  await page.getByRole("button", { name: "Inspect setup" }).click();
  await expect(page.getByRole("dialog")).toContainText("No active setup");
  mock.fail();
  await page.clock.fastForward(16000);
  await expect(page.locator(".hunt-chart-overlay")).toContainText(
    "Source unavailable",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "No qualified entry recommendation",
  );
  expect(errors).toEqual([]);
});
