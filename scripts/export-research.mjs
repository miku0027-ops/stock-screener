import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetch, EnvHttpProxyAgent } from "undici";
import {
  NEWS_SOURCES,
  BLS_URL,
  FED_URL,
  parseNews,
  parseBLS,
  parseFOMC,
  parseFRED,
} from "../shared/research.js";
const dir = path.resolve(process.argv[2] || "/tmp/atlas-market-data"),
  file = path.join(dir, "research.json"),
  now = Date.now(),
  dispatcher = new EnvHttpProxyAgent();
let previous = { articles: [], events: [], sources: [] };
try {
  previous = JSON.parse(await readFile(file, "utf8"));
} catch {}
const definitions = [
  ...NEWS_SOURCES.map((s) => ({
    ...s,
    kind: "news",
    parse: (t) => parseNews(t, s, now),
  })),
  {
    id: "bls-calendar",
    name: "BLS release calendar",
    url: BLS_URL,
    kind: "calendar",
    parse: (t) => parseBLS(t, now),
  },
  {
    id: "fed-calendar",
    name: "FOMC calendar",
    url: FED_URL,
    kind: "calendar",
    parse: (t) => parseFOMC(t, now),
  },
];
const results = await Promise.all(
  definitions.map(async (s) => {
    try {
      const r = await fetch(s.url, {
        dispatcher,
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent":
            "SHARPNEX/1.0 (+https://github.com/miku0027-ops/stock-screener)",
        },
      });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (text.length > 3000000) throw Error("Source too large");
      const items = s.parse(text);
      return {
        source: {
          id: s.id,
          name: s.name,
          url: s.url,
          kind: s.kind,
          checkedAt: now,
          status: "ok",
          count: items.length,
        },
        items,
      };
    } catch (e) {
      if (s.id === "bls-calendar") {
        try {
          const from = new Date(now).toISOString().slice(0, 10),
            to = new Date(now + 90 * 86400000).toISOString().slice(0, 10);
          const items = (
            await Promise.all(
              [10, 50].map(async (id) => {
                const url = `https://fred.stlouisfed.org/releases/calendar?rid=${id}&vs=${from}&ve=${to}`;
                const response = await fetch(url, {
                  dispatcher,
                  signal: AbortSignal.timeout(20000),
                  headers: {
                    "User-Agent":
                      "SHARPNEX/1.0 (+https://github.com/miku0027-ops/stock-screener)",
                  },
                });
                if (!response.ok) throw Error(`FRED HTTP ${response.status}`);
                return parseFRED(await response.text(), id, url, now);
              }),
            )
          ).flat();
          return {
            source: {
              id: s.id,
              name: "FRED · CPI and employment calendar",
              url: "https://fred.stlouisfed.org/releases/calendar",
              kind: "calendar",
              checkedAt: now,
              status: "ok",
              count: items.length,
              fallback: true,
              primaryError: e.message,
              coverage:
                "CPI and Employment Situation only; other BLS releases unavailable",
            },
            items,
          };
        } catch (fallbackError) {
          e = new Error(`${e.message}; ${fallbackError.message}`);
        }
      }
      const old = previous.sources?.find((v) => v.id === s.id);
      return {
        source: {
          id: s.id,
          name: s.name,
          url: s.url,
          kind: s.kind,
          checkedAt: old?.checkedAt || null,
          attemptedAt: now,
          status: "unavailable",
          error: e.message.slice(0, 120),
        },
        items:
          s.kind === "news"
            ? (previous.articles || []).filter(
                (a) => a.sourceId === s.id && now - a.at < 30 * 86400000,
              )
            : [],
      };
    }
  }),
);
const output = {
  fetchedAt: now,
  articles: [
    ...new Map(
      results
        .filter((r) => r.source.kind === "news")
        .flatMap((r) => r.items)
        .map((a) => [a.id, a]),
    ).values(),
  ].sort((a, b) => b.at - a.at),
  events: results
    .filter((r) => r.source.kind === "calendar")
    .flatMap((r) => r.items)
    .sort(
      (a, b) => (a.at || Date.parse(a.date)) - (b.at || Date.parse(b.date)),
    ),
  sources: results.map((r) => r.source),
};
await mkdir(dir, { recursive: true });
await writeFile(file, JSON.stringify(output) + "\n");
console.log(
  JSON.stringify({
    articles: output.articles.length,
    events: output.events.length,
    sources: output.sources.map((s) => ({
      name: s.name,
      status: s.status,
      count: s.count,
    })),
  }),
);
