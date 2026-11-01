import React, { useEffect, useMemo, useState } from "react";
import { Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { priceLabel as num } from "./price-format.js";
import { coinUniverse } from "./market-intelligence.js";
export default function CoinRail({ quotes, mode, paused, selected, onSelect }) {
  const [all, setAll] = useState([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("loading"),
    [received, setReceived] = useState(0),
    [now, setNow] = useState(Date.now()),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (mode !== "live" || paused) return;
    const c = new AbortController();
    let dead = false,
      timer;
    async function update() {
      if (!document.hidden) {
        try {
          const d = await coinUniverse(c.signal);
          if (!dead) {
            setAll(d);
            setReceived(Date.now());
            setStatus("ready");
          }
        } catch {
          if (!dead) setStatus("unavailable");
        }
      }
      if (!dead) timer = setTimeout(update, 30000);
    }
    update();
    return () => {
      dead = true;
      c.abort();
      clearTimeout(timer);
    };
  }, [mode, paused]);
  const known = quotes.filter((q) => q.provider === "Binance");
  const rows = useMemo(() => {
    const raw = mode === "live" && all.length ? all : known;
    return raw
      .map((r) => {
        const q = known.find((q) => q.id === r.id);
        return q?.price != null && mode === "live" && q.status === "live"
          ? { ...r, price: q.price, asOf: q.asOf }
          : r;
      })
      .filter((r) =>
        `${r.symbol} ${r.id} ${r.name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      );
  }, [all, quotes, search, mode]);
  const stale =
    mode === "live" && (paused || status !== "ready" || now - received > 45000);
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
            {mode === "demo" ? "DEMO" : stale ? "LIMITED / STALE" : "30s FEED"}
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
              className={`coin-row ${selected === q.id ? "selected" : ""}`}
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
              : "Sorted by 24h volume"}
        </div>
      </div>
    </aside>
  );
}
