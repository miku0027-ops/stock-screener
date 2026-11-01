import React, { useState } from "react";
import { ExternalLink, CalendarDays, Newspaper, Radio } from "lucide-react";
import { eventWindow } from "../shared/analysis.js";
const date = (t) =>
  new Date(t).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
export function EventRibbon({ research }) {
  const now = Date.now(),
    events = (research?.events || [])
      .filter((e) => (e.at || Date.parse(e.date) + 86400000) > now)
      .slice(0, 3);
  return (
    <div className="event-ribbon">
      <span>
        <CalendarDays size={14} />{" "}
        {eventWindow(research).fresh ? "NEXT EVENTS" : "CALENDAR STALE"}
      </span>
      {events.length ? (
        events.map((e) => (
          <a key={e.id} href={e.url} target="_blank" rel="noreferrer">
            <b>{e.title.replace(" · published calendar", "")}</b>
            <small>
              {e.timePrecision === "day"
                ? `${e.date} · time unspecified`
                : date(e.at)}
            </small>
            <small>{e.source}</small>
          </a>
        ))
      ) : (
        <p>Calendar unavailable. No event assumptions are made.</p>
      )}
    </div>
  );
}
export default function ResearchBoard({ research, quotes }) {
  const [filter, setFilter] = useState("All"),
    now = Date.now(),
    fresh = research && now - research.fetchedAt < 30 * 60000;
  const articles = (research?.articles || []).filter(
    (a) => filter === "All" || a.topic === filter || a.tags?.includes(filter),
  );
  const categories = [
    "All",
    "Crypto",
    "Monetary policy",
    "World & politics",
    "Energy & oil",
    "Policy & enforcement",
    "Security / enforcement",
  ];
  return (
    <section className="research-board">
      <div className="desk-heading">
        <div>
          <h2>World monitor</h2>
        </div>
        <span className={`research-status ${fresh ? "positive" : "negative"}`}>
          {fresh ? "SOURCES CHECKED" : "STALE / UNAVAILABLE"}
        </span>
      </div>
      <EventRibbon research={research} />
      <div className="macro-strip">
        {["^GSPC", "DX-Y.NYB", "GC=F", "CL=F", "^VIX", "^TNX"].map((id) => {
          const q = quotes.find((q) => q.id === id);
          return (
            q && (
              <div key={id}>
                <span>{q.symbol}</span>
                <b>
                  {q.price?.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  }) || "—"}
                </b>
                <small className={q.change >= 0 ? "positive" : "negative"}>
                  {q.change != null
                    ? `${q.change > 0 ? "+" : ""}${q.change.toFixed(2)}%`
                    : "Unavailable"}
                </small>
                <em>
                  {q.status} · {q.asOf ? date(q.asOf) : "No timestamp"}
                </em>
              </div>
            )
          );
        })}
      </div>
      <div className="news-layout">
        <div>
          <div className="news-filters">
            {categories.map((c) => (
              <button
                key={c}
                className={filter === c ? "active" : ""}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="headline-list">
            {articles.slice(0, 70).map((a) => (
              <article key={a.id}>
                <div>
                  <span>{a.source}</span>
                  <small>{date(a.at)}</small>
                  <em>{a.primary ? "PRIMARY SOURCE" : "PUBLISHER REPORT"}</em>
                </div>
                <a href={a.url} target="_blank" rel="noreferrer">
                  {a.title}
                  <ExternalLink size={13} />
                </a>
              </article>
            ))}
            {!articles.length && (
              <p className="context-empty">
                No source-backed headlines are available in this category.
              </p>
            )}
          </div>
        </div>
        <details className="source-monitor">
          <summary>Sources & coverage</summary>

          {(research?.sources || []).map((s) => (
            <div key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
                <ExternalLink size={11} />
              </a>
              <span
                className={
                  s.status === "ok" && now - s.checkedAt < 30 * 60000
                    ? "positive"
                    : "negative"
                }
              >
                {s.status === "ok" && now - s.checkedAt < 30 * 60000
                  ? "Fetched"
                  : "Unavailable / stale"}
              </span>
              <small>{s.checkedAt ? date(s.checkedAt) : "Not checked"}</small>
              {s.fallback && <small>Fallback coverage · {s.coverage}</small>}
            </div>
          ))}
          {!research && <p>Source status unavailable.</p>}
          <p>
            Feeds are requested every five minutes by the free data pipeline.
            GitHub scheduling and source outages may delay publication. An empty
            feed does not mean there is no market-moving news.
          </p>
          <p>
            Publisher-reported headlines. Topic labels do not predict price
            impact.
          </p>
        </details>
      </div>
    </section>
  );
}
