import React, { useEffect, useState } from "react";
import { Clock3, ExternalLink, Info, Search } from "lucide-react";
import initial from "../data/announced-unlocks.json";
import { declaredUnlocks } from "../shared/unlocks.js";
import { getJSON } from "./trading-data.js";
export default function ContextPanel() {
  const [records, setRecords] = useState(initial),
    [search, setSearch] = useState(""),
    [sentiment, setSentiment] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    getJSON(
      "https://raw.githubusercontent.com/miku0027-ops/stock-screener/market-data/announced-unlocks.json",
      c.signal,
    )
      .then((d) => {
        if (Array.isArray(d.events)) setRecords(d);
      })
      .catch(() => {});
    getJSON("https://api.alternative.me/fng/?limit=1", c.signal)
      .then((d) => {
        const a = d.data?.[0];
        if (
          a &&
          Number.isFinite(+a.value) &&
          +a.value >= 0 &&
          +a.value <= 100 &&
          Number.isFinite(+a.timestamp)
        )
          setSentiment(a);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  const events = declaredUnlocks(records.events).filter((e) =>
    `${e.symbol} ${e.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const currentSentiment =
    sentiment && Date.now() - +sentiment.timestamp * 1000 < 48 * 3600000;
  return (
    <section className="context-panel">
      <div className="desk-heading">
        <div>
          <h2>Declared unlocks</h2>
          <p>Issuer-published dates only.</p>
        </div>
        <Clock3 size={25} />
      </div>
      <div className="unlock-toolbar">
        <h3>
          Declared upcoming unlocks <span>{events.length}</span>
        </h3>
        <label className="search-box">
          <Search size={14} />
          <input
            aria-label="Search announced unlocks"
            placeholder="Search announced coins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {events.length ? (
        <div className="unlock-list">
          {events.map((e) => (
            <article className="unlock-row" key={`${e.symbol}-${e.date}`}>
              <div className="unlock-date">
                <strong>
                  {new Date(e.date + "T12:00:00Z").toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                    day: "2-digit",
                    month: "short",
                  })}
                </strong>
                <small>{e.date.slice(0, 4)} · time not announced</small>
              </div>
              <div>
                <b>
                  {e.symbol} <span>{e.name}</span>
                </b>
                <details>
                  <summary>Schedule details</summary>
                  <p>{e.note}</p>
                </details>
              </div>
              <div className="unlock-amount">
                <strong>
                  Up to {(e.amount / 1e6).toLocaleString()}M {e.symbol}
                </strong>
                <small>Published maximum</small>
              </div>
              <a href={e.source} target="_blank" rel="noreferrer">
                Issuer source <ExternalLink size={12} />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className="context-empty">No verified upcoming dates match.</div>
      )}
      <p className="source-footnote">
        Source checked{" "}
        {new Date(records.checkedAt).toLocaleDateString("en-GB", {
          timeZone: "UTC",
        })}
        . Records older than 35 days without reverification are hidden. This
        catalog is not exhaustive.
      </p>
      <div className="macro-context-grid">
        <article>
          <span className="eyebrow">DAILY SENTIMENT</span>
          <h3>Crypto Fear & Greed</h3>
          <strong className="sentiment-value">
            {currentSentiment ? `${sentiment.value} / 100` : "Unavailable"}
          </strong>
          <p>
            {currentSentiment
              ? `${sentiment.value_classification} · published ${new Date(+sentiment.timestamp * 1000).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
              : "No fresh, verified sentiment response."}
          </p>
          <a
            href="https://alternative.me/crypto/fear-and-greed-index/"
            target="_blank"
            rel="noreferrer"
          >
            Source: Alternative.me <ExternalLink size={12} />
          </a>
          <small>Daily index · not an entry signal.</small>
        </article>
      </div>
    </section>
  );
}
