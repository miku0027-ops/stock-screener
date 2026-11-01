import React, { useState } from "react";
import { Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { priceLabel as num } from "./price-format.js";
export default function CoinRail({
  quotes,
  mode,
  paused,
  selected,
  onSelect,
  feed,
}) {
  const [search, setSearch] = useState(""),
    [open, setOpen] = useState(false);
  const rows = (
    mode === "live" && feed?.rows.length
      ? feed.rows
      : quotes.filter((q) => q.provider === "Binance")
  ).filter((r) =>
    `${r.symbol} ${r.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const stale =
    mode === "live" &&
    (paused || !["stream", "fallback"].includes(feed?.status));
  return (
    <aside
      className={`coin-rail ${open ? "rail-open" : ""}`}
      aria-label="Coin market rail"
    >
      <button className="rail-mobile-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{" "}
        Markets <span>{rows.length}</span>
      </button>
      <div className="rail-content">
        <div className="rail-heading">
          <b>Markets</b>
          <span>
            {mode === "demo"
              ? "DEMO"
              : stale
                ? "LIMITED / STALE"
                : feed?.status === "stream"
                  ? "1s STREAM"
                  : "5s FALLBACK"}
          </span>
        </div>
        <p className="rail-subtitle">Binance spot · USDT</p>
        <label className="rail-search">
          <Search size={13} />
          <input
            aria-label="Search all coins"
            placeholder="Search any coin"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="rail-columns">
          <span>COIN / {rows.length}</span>
          <span>PRICE · 24H</span>
        </div>
        <div
          className="coin-scroll"
          tabIndex={0}
          aria-label="Scrollable coin list"
        >
          {rows.map((q, i) => (
            <button
              key={q.id}
              className={`coin-row ${selected === q.id ? "selected" : ""} ${!paused && q.flash ? `coin-flash-${q.flash}` : ""} ${!q.asOf || Date.now() - q.asOf > 120000 ? "coin-quiet" : ""}`}
              title={`${q.id} · updated ${q.asOf ? new Date(q.asOf).toLocaleTimeString() : "—"} · 24h change${!q.asOf || Date.now() - q.asOf > 120000 ? " · no recent price update" : ""}`}
              aria-label={`Analyze ${q.id}`}
              onClick={() => {
                onSelect(q.id);
                setOpen(false);
              }}
            >
              <span className={`coin-glyph coin-glyph-${i % 5}`}>
                {q.symbol.slice(0, 1)}
              </span>
              <span className="coin-name">
                <b>{q.symbol}</b>
                <small>USDT</small>
              </span>
              <span className="coin-numbers">
                <b>{num(q.price)}</b>
                <small className={q.change >= 0 ? "positive" : "negative"}>
                  {Number.isFinite(q.change)
                    ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`
                    : "—"}
                </small>
              </span>
            </button>
          ))}
          {!rows.length && (
            <p className="rail-empty">No matching supported coin.</p>
          )}
        </div>
        <div className="rail-foot">
          {mode === "demo"
            ? "Illustrative catalog"
            : stale
              ? "Last known prices · stale"
              : feed?.status === "stream"
                ? "1s stream · real changes only"
                : "REST fallback · 5s snapshots"}
        </div>
      </div>
    </aside>
  );
}
