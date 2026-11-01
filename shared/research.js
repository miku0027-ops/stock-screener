import { XMLParser } from "fast-xml-parser";
export const NEWS_SOURCES = [
  {
    id: "fed",
    name: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    host: "federalreserve.gov",
    topic: "Monetary policy",
    primary: true,
  },
  {
    id: "sec",
    name: "SEC",
    url: "https://www.sec.gov/news/pressreleases.rss",
    host: "sec.gov",
    topic: "Policy & enforcement",
    primary: true,
  },
  {
    id: "eia",
    name: "EIA",
    url: "https://www.eia.gov/rss/press_rss.xml",
    host: "eia.gov",
    topic: "Energy & oil",
    primary: true,
  },
  {
    id: "coindesk",
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    host: "coindesk.com",
    topic: "Crypto",
    primary: false,
  },
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    host: "cointelegraph.com",
    topic: "Crypto",
    primary: false,
  },
  {
    id: "bbc",
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    host: "bbc.co.uk",
    extraHost: "bbc.com",
    topic: "World & politics",
    primary: false,
  },
];
export const BLS_URL = "https://www.bls.gov/schedule/news_release/bls.ics";
export const FED_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});
const plain = (v) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function parseNews(xml, source, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Feed entity declarations rejected");
  const parsed = parser.parse(xml),
    raw = parsed.rss?.channel?.item;
  if (!raw) throw Error("No RSS items");
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap((item) => {
      const title = plain(item.title),
        at = Date.parse(item.pubDate || item["dc:date"]);
      let url;
      try {
        url = new URL(plain(item.link), source.url);
        if (url.protocol === "http:") url.protocol = "https:";
        const allowed = [source.host, source.extraHost].filter(Boolean);
        if (
          url.protocol !== "https:" ||
          !allowed.some(
            (h) => url.hostname === h || url.hostname.endsWith("." + h),
          )
        )
          return [];
      } catch {
        return [];
      }
      if (
        !title ||
        !Number.isFinite(at) ||
        at > now + 300000 ||
        now - at > 30 * 86400000
      )
        return [];
      const tags = [];
      if (/hack|scam|fraud|exploit|stolen|theft/i.test(title))
        tags.push("Security / enforcement");
      if (/war|missile|attack|military|conflict|sanction/i.test(title))
        tags.push("Conflict / sanctions");
      if (/oil|crude|energy|opec/i.test(title)) tags.push("Energy");
      if (/rate|inflation|federal reserve|fomc|cpi|monetary/i.test(title))
        tags.push("Monetary policy");
      return [
        {
          id: url.href,
          title,
          url: url.href,
          at,
          source: source.name,
          sourceId: source.id,
          topic: source.topic,
          primary: source.primary,
          tags,
        },
      ];
    })
    .slice(0, 25);
}
// Convert the BLS's explicit US-Eastern wall time using IANA DST rules, not a fixed offset.
export function easternToUTC(value, timeZone = "America/New_York") {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  const parts = m.slice(1).map(Number),
    wall = Date.UTC(
      parts[0],
      parts[1] - 1,
      parts[2],
      parts[3],
      parts[4],
      parts[5],
    );
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const fields = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(guess)
        .map((p) => [p.type, p.value]),
    );
    const viewed = Date.UTC(
      +fields.year,
      +fields.month - 1,
      +fields.day,
      +fields.hour,
      +fields.minute,
      +fields.second,
    );
    guess += wall - viewed;
  }
  return guess;
}
export function parseBLS(ics, now = Date.now()) {
  if (!ics.includes("BEGIN:VCALENDAR")) throw Error("Invalid BLS calendar");
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const events = [];
  for (const match of unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const block = match[1],
      time =
        /^DTSTART;TZID=(?:US-Eastern|America\/New_York):(\d{8}T\d{6})\r?$/m.exec(
          block,
        ),
      title = /^SUMMARY:(.+)\r?$/m.exec(block)?.[1]?.trim();
    if (
      !time ||
      !title ||
      !/^(Consumer Price Index|Producer Price Index|Employment Situation|Job Openings and Labor Turnover Survey|U.S. Import and Export Price Indexes)/.test(
        title,
      ) ||
      /STATUS:CANCELLED/.test(block)
    )
      continue;
    const at = easternToUTC(time[1]);
    if (
      !Number.isFinite(at) ||
      at < now - 86400000 ||
      at > now + 120 * 86400000
    )
      continue;
    events.push({
      id: `bls-${time[1]}-${title}`,
      title,
      at,
      date: new Date(at).toISOString().slice(0, 10),
      timePrecision: "minute",
      priority: /Consumer Price Index|Employment Situation/.test(title)
        ? "major"
        : "context",
      source: "Bureau of Labor Statistics",
      url: BLS_URL,
    });
  }
  return events;
}
export function parseFOMC(html, now = Date.now()) {
  const events = [],
    months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
  const sections = [
    ...html.matchAll(
      /(\d{4}) FOMC Meetings([\s\S]*?)(?=\d{4} FOMC Meetings|$)/g,
    ),
  ];
  if (!sections.length) throw Error("FOMC page format unrecognized");
  for (const [, year, body] of sections) {
    const re =
      /fomc-meeting__month[^>]*>\s*<strong>([A-Za-z]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([\d\-–*]+)</g;
    for (const m of body.matchAll(re)) {
      const month = months.indexOf(m[1]);
      if (month < 0) continue;
      const days = m[2].replaceAll("*", "").split(/[-–]/).map(Number);
      if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) continue;
      for (let d = days[0]; d <= days.at(-1); d++) {
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          at = Date.parse(date + "T00:00:00Z");
        if (at + 86400000 < now || at > now + 120 * 86400000) continue;
        events.push({
          id: `fomc-${date}`,
          title: "FOMC meeting · published calendar",
          date,
          at: null,
          timePrecision: "day",
          priority: "major",
          source: "Federal Reserve",
          url: FED_URL,
        });
      }
    }
  }
  return events;
}

// FRED explicitly labels release times as US Central. Keep provenance distinct from BLS.
export function parseFRED(html, releaseId, sourceURL, now = Date.now()) {
  if (!html.includes("All times are US Central Time"))
    throw Error("FRED calendar timezone unrecognized");
  const expected = { 10: "Consumer Price Index", 50: "Employment Situation" }[
    releaseId
  ];
  if (!expected) throw Error("Unsupported FRED release");
  let day = null;
  const events = [];
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const text = plain(row),
      dm =
        /(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/.exec(
          text,
        );
    if (dm) {
      const stamp = Date.parse(`${dm[1]} ${dm[2]}, ${dm[3]} 00:00:00 GMT`);
      day = Number.isFinite(stamp)
        ? new Date(stamp).toISOString().slice(0, 10)
        : null;
      continue;
    }
    const release = /href="\/release\?rid=(\d+)"[^>]*>([^<]+)</.exec(row);
    if (
      !day ||
      !release ||
      +release[1] !== releaseId ||
      plain(release[2]) !== expected
    )
      continue;
    const time = /\b(\d{1,2}):(\d{2}) (am|pm)\b/i.exec(text);
    let at = null;
    if (time) {
      const hour = (+time[1] % 12) + (time[3].toLowerCase() === "pm" ? 12 : 0);
      if (+time[1] < 1 || +time[1] > 12 || +time[2] > 59)
        throw Error("Invalid FRED time");
      at = easternToUTC(
        `${day.replaceAll("-", "")}T${String(hour).padStart(2, "0")}${time[2]}00`,
        "America/Chicago",
      );
    }
    const boundary = at || Date.parse(day + "T00:00:00Z");
    if (boundary < now - 86400000 || boundary > now + 120 * 86400000) continue;
    events.push({
      id: `fred-${releaseId}-${day}`,
      title: expected,
      date: day,
      at,
      timePrecision: at ? "minute" : "day",
      priority: "major",
      source: "Federal Reserve Bank of St. Louis · FRED",
      url: sourceURL,
    });
  }
  if (!events.length) throw Error("No upcoming FRED release dates verified");
  return events;
}

export const WEEKLY_CALENDAR_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
export function parseWeeklyCalendar(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500)
    throw Error("Invalid publisher calendar");
  const dated = rows
    .filter(
      (r) =>
        typeof r.date === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(
          r.date,
        ),
    )
    .map((r) => ({ ...r, at: Date.parse(r.date) }))
    .filter((r) => Number.isFinite(r.at));
  if (
    !dated.length ||
    Math.min(...dated.map((r) => r.at)) > now + 36 * 3600000 ||
    Math.max(...dated.map((r) => r.at)) < now ||
    Math.max(...dated.map((r) => r.at)) > now + 9 * 86400000
  )
    throw Error("Publisher calendar does not cover the current week");
  return dated
    .filter(
      (r) =>
        r.country === "USD" && r.impact === "High" && r.at >= now - 86400000,
    )
    .map((r) => ({
      id: `ff-${r.at}-${plain(r.title)}`,
      title: plain(r.title),
      at: r.at,
      date: new Date(r.at).toISOString().slice(0, 10),
      timePrecision: "minute",
      priority: "major",
      source: "Forex Factory / Fair Economy · publisher-reported",
      url: WEEKLY_CALENDAR_URL,
    }));
}
