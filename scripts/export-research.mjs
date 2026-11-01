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
