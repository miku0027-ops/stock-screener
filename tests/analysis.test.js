import test from "node:test";
import assert from "node:assert/strict";
import {
  heikinAshi,
  enrichment,
  profileFor,
  assessSetup,
  eventWindow,
  positionReference,
  alignedCorrelation,
  backtestSpot,
} from "../shared/analysis.js";
import {
  parseNews,
  NEWS_SOURCES,
  easternToUTC,
  parseBLS,
  parseFOMC,
  parseFRED,
} from "../shared/research.js";
const now = Date.parse("2026-11-01T12:00:00Z");
const calendar = {
  sources: [
    { id: "bls-calendar", kind: "calendar", status: "ok", checkedAt: now },
    { id: "fed-calendar", kind: "calendar", status: "ok", checkedAt: now },
  ],
  events: [],
};
const valid = {
  status: "ready",
  receivedAt: now,
  active: { direction: "bull", state: "triggered", entry: 100, stop: 98 },
  hourly: { close: 101, ema20: 99 },
  ema20: 100,
  ema50: 99,
  relativeVolume: 1.5,
  depth: { spreadBps: 1 },
  atr: 2,
  lastCandleAt: 999,
  currentCandle: { time: 1, open: 100, high: 101, low: 99, close: 100 },
};
test("Heikin-Ashi uses recursive synthetic opens without mutating raw prices", () => {
  const c = [
    { time: 1, open: 10, high: 14, low: 8, close: 12 },
    { time: 2, open: 12, high: 17, low: 11, close: 16 },
  ];
  const ha = heikinAshi(c);
  assert.equal(ha[0].open, 11);
  assert.equal(ha[0].close, 11);
  assert.equal(ha[1].open, 11);
  assert.equal(ha[1].close, 14);
  assert.equal(ha[1].low, 11);
  assert.equal(c[1].open, 12);
});
test("Profile checks reject stale data, missing calendars, bearish spot and missing perpetual context", () => {
  assert.equal(
    assessSetup(valid, "defensive", "spot", calendar, now).eligible,
    true,
  );
  assert.equal(
    assessSetup(
      { ...valid, receivedAt: now - 9000 },
      "active",
      "spot",
      calendar,
      now,
    ).eligible,
    false,
  );
  assert.equal(assessSetup(valid, "active", "spot", null, now).eligible, false);
  assert.equal(
    assessSetup(
      { ...valid, active: { ...valid.active, direction: "bear" } },
      "active",
      "spot",
      calendar,
      now,
    ).eligible,
    false,
  );
  assert.equal(
    assessSetup(valid, "active", "perp", calendar, now).eligible,
    false,
  );
  assert.equal(
    assessSetup(
      { ...valid, derivatives: { asOf: now } },
      "active",
      "perp",
      calendar,
      now,
    ).eligible,
    true,
  );
  assert.equal(
    assessSetup({ ...valid, depth: null }, "active", "spot", calendar, now)
      .eligible,
    false,
  );
});
test("Risk preferences change filters and targets without promising a win rate", () => {
  assert.equal(profileFor("patient").targetR, 3);
  assert.equal(profileFor("patient").risk, 0.5);
  const a = assessSetup(valid, "patient", "spot", calendar, now);
  assert.equal(a.target, 106);
  assert.equal(a.riskPct, 2);
  assert.deepEqual(positionReference(10000, 100, 98, "patient"), {
    riskBudget: 50,
    units: 25,
    notional: 2500,
  });
  assert.equal(positionReference(10000, 100, 100, "patient"), null);
});
test("Official event windows block entries and stale calendar coverage fails closed", () => {
  const r = {
    ...calendar,
    events: [
      {
        priority: "major",
        timePrecision: "minute",
        at: now + 20 * 60000,
        title: "CPI",
      },
    ],
  };
  assert.equal(eventWindow(r, now).events.length, 1);
  assert.equal(assessSetup(valid, "active", "spot", r, now).eligible, false);
  assert.equal(eventWindow(calendar, now + 31 * 60000).fresh, false);
});
test("Hourly trend excludes incomplete buckets; early candidates never become eligible by themselves", () => {
  const candles = Array.from({ length: 251 }, (_, i) => ({
    time: i * 300,
    open: 100,
    high: 102,
    low: 98,
    close: 100 + i * 0.1,
    volume: 10,
  }));
  const a = enrichment({ status: "ready", candles, rsi: Array(251).fill(50) });
  assert.equal(a.hourly.bars, 20);
  assert.equal(a.hourly.time, 19 * 3600);
  assert.equal(
    assessSetup(
      { ...valid, active: null, early: { direction: "bull" } },
      "active",
      "spot",
      calendar,
      now,
    ).eligible,
    false,
  );
});
test("Correlation aligns common dates and refuses an undersized sample", () => {
  const a = Array.from({ length: 70 }, (_, i) => ({
    time: i * 86400,
    close: 100 + Math.sin(i) * 2 + i,
  }));
  assert.ok(Math.abs(alignedCorrelation(a, a).pearson - 1) < 1e-10);
  assert.equal(alignedCorrelation(a.slice(0, 10), a).pearson, null);
  const b = a.filter((_, i) => i % 7 < 5);
  assert.equal(alignedCorrelation(a, b).n, b.length - 1);
  assert.equal(alignedCorrelation(a, b).pearson, 1);
});
test("RSS records retain publisher wording and reject future dates, foreign links and executable markup", () => {
  const xml = `<rss><channel><item><title><![CDATA[<b>Bitcoin scam allegation</b>]]></title><link>https://www.coindesk.com/story</link><pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link><pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Wrong publisher</title><link>https://evil.example/x</link><pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const r = parseNews(
    xml,
    NEWS_SOURCES.find((s) => s.id === "coindesk"),
    now,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].title, "Bitcoin scam allegation");
  assert.equal(r[0].primary, false);
  assert.deepEqual(r[0].tags, ["Security / enforcement"]);
  assert.throws(() => parseNews("<!DOCTYPE x><rss/>", NEWS_SOURCES[0], now));
});
test("BLS calendar respects New York daylight saving and explicit source times", () => {
  assert.equal(
    new Date(easternToUTC("20260310T083000")).toISOString(),
    "2026-03-10T12:30:00.000Z",
  );
  assert.equal(
    new Date(easternToUTC("20261106T083000")).toISOString(),
    "2026-11-06T13:30:00.000Z",
  );
  const ics =
    "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261106T083000\nSUMMARY:Employment Situation\nEND:VEVENT\nEND:VCALENDAR";
  const [e] = parseBLS(ics, now);
  assert.equal(e.at, Date.parse("2026-11-06T13:30:00Z"));
  assert.equal(e.timePrecision, "minute");
  assert.equal(e.priority, "major");
});
test("FOMC parser retains date-only precision rather than inventing a decision time", () => {
  const html =
    '2026 FOMC Meetings<div class="fomc-meeting__month"><strong>December</strong></div><div class="fomc-meeting__date">8-9*</div>';
  const r = parseFOMC(html, now);
  assert.deepEqual(
    r.map((e) => e.date),
    ["2026-12-08", "2026-12-09"],
  );
  assert.ok(r.every((e) => e.at === null && e.timePrecision === "day"));
});
test("Flat historical prices generate no fabricated trades or win rate", () => {
  const c = Array.from({ length: 300 }, (_, i) => ({
    time: i * 300,
    closeTime: (i + 1) * 300000 - 1,
    open: 100,
    close: 100,
    high: 101,
    low: 99,
    volume: 100,
  }));
  const r = backtestSpot(c);
  assert.equal(r.n, 0);
  assert.equal(r.winRate, null);
  assert.equal(r.expectancyR, null);
});
test("Chronological baseline enters after the signal, charges costs and handles adverse gaps", () => {
  const closes = [
    ...Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i) * 0.1),
    ...Array.from({ length: 20 }, (_, i) => 100 - (i + 1) * 0.5),
    ...Array.from({ length: 15 }, (_, i) => 90 + i + 1),
    ...Array.from({ length: 10 }, (_, i) => 105 - (i + 1) * 1.6),
    ...Array.from({ length: 30 }, (_, i) => 89 + (i + 1) * 2),
  ];
  const cs = closes.map((c, i) => ({
    time: i * 300,
    closeTime: (i + 1) * 300000 - 1,
    open: c - 0.5,
    high: c + 0.5,
    low: c - 1,
    close: c,
    volume: 100,
  }));
  const result = backtestSpot(cs),
    trade = result.trades[0];
  assert.equal(result.n, 1);
  assert.equal(trade.at, cs[169].time * 1000);
  assert.equal(trade.entry, cs[169].open * 1.0005);
  assert.equal(trade.exit, cs[174].close * 0.9995);
  assert.ok(
    Math.abs(
      trade.r -
        (trade.exit - trade.entry - (trade.entry + trade.exit) * 0.001) /
          (trade.entry - trade.stop),
    ) < 1e-12,
  );
  assert.deepEqual(backtestSpot(cs.slice(0, 175)).trades[0], trade);
  assert.equal(backtestSpot(cs.slice(0, 169)).n, 0);
  const gap = cs.map((c) => ({ ...c }));
  gap[170] = { ...gap[170], open: 80, high: 130, low: 79, close: 100 };
  const loss = backtestSpot(gap).trades[0];
  assert.equal(loss.reason, "stop");
  assert.equal(loss.exit, 80 * 0.9995);
  assert.ok(loss.r < -1);
});

test("Current-bar invalidation and distance prevent stale entry references becoming eligible", () => {
  assert.equal(
    assessSetup(
      {
        ...valid,
        currentCandle: { time: 1, open: 100, high: 101, low: 97, close: 100 },
      },
      "active",
      "spot",
      calendar,
      now,
    ).eligible,
    false,
  );
  assert.equal(
    assessSetup(
      {
        ...valid,
        currentCandle: { time: 1, open: 102, high: 104, low: 102, close: 103 },
      },
      "active",
      "spot",
      calendar,
      now,
    ).eligible,
    false,
  );
});

test("An already touched profile target cannot become a new eligible entry", () => {
  const data = {
    ...valid,
    currentCandle: { time: 1, open: 100, high: 104, low: 99, close: 100 },
  };
  assert.equal(
    assessSetup(data, "defensive", "spot", calendar, now).eligible,
    false,
  );
  assert.equal(
    assessSetup(data, "patient", "spot", calendar, now).eligible,
    true,
  );
});

test("FRED fallback preserves official attribution and converts explicitly labeled Central time", () => {
  const html =
    '<table><tr><td><span>Tuesday November 10, 2026</span></td></tr><tr><td>7:30 am</td><td><a href="/release?rid=10">Consumer Price Index</a></td></tr></table>All times are US Central Time';
  const [event] = parseFRED(
    html,
    10,
    "https://fred.stlouisfed.org/releases/calendar?rid=10",
    now,
  );
  assert.equal(event.at, Date.parse("2026-11-10T13:30:00Z"));
  assert.match(event.source, /FRED/);
  assert.equal(event.timePrecision, "minute");
  assert.throws(() =>
    parseFRED(
      html.replace("US Central", "unknown"),
      10,
      "https://fred.stlouisfed.org",
      now,
    ),
  );
  const [dateOnly] = parseFRED(
    html.replace("7:30 am", "N/A"),
    10,
    "https://fred.stlouisfed.org",
    now,
  );
  assert.equal(dateOnly.at, null);
  assert.equal(dateOnly.timePrecision, "day");
});
