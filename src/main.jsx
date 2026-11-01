import React, { useEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { createChart, CandlestickSeries, ColorType } from "lightweight-charts";
import {
  Activity,
  Sun,
  Moon,
  Newspaper,
  UserRound,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Expand,
  Globe2,
  Grid2X2,
  Layers,
  Maximize2,
  PanelRightClose,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Wifi,
  X,
  Zap,
  ExternalLink,
  Pause,
  Play,
  Check,
  Info,
} from "lucide-react";
import { markets, groups, marketContext } from "../shared/markets";
import { demoSnapshot, demoHistory } from "../shared/demo";
import "./styles.css";
import { useCryptoFeed } from "./crypto-feed.js";
import ReleaseNotice from "./ReleaseNotice.jsx";
import Brand from "./Brand.jsx";
import CoinRail from "./CoinRail.jsx";
import TraderProfile from "./TraderProfile.jsx";
import ResearchBoard from "./ResearchBoard.jsx";
import { useResearch } from "./market-intelligence.js";
import { heikinAshi, PROFILES } from "../shared/analysis.js";
import HuntDesk from "./HuntDesk.jsx";
import ContextPanel from "./ContextPanel.jsx";
import { sampleChange } from "../shared/signals.js";
import { loadHistory, loadMarkets, staticHosting } from "./data-client.js";

const readStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const putStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const formatPrice = (n, currency = "USD") =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        minimumFractionDigits: n < 1 ? 4 : 2,
        maximumFractionDigits: n < 1 ? 8 : 2,
      }).format(n) + (currency === "%" ? "%" : "");
const pct = (n, digits = 2) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
const compact = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(n);
const timeLabel = (n) =>
  n
    ? new Date(n).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        timeZone: "UTC",
      }) + " UTC"
    : "Illustrative snapshot";
const tones = [
  "#683137",
  "#813a40",
  "#99434b",
  "#b45057",
  "#253b36",
  "#246952",
  "#268364",
  "#2b9c73",
];
function tileColor(n, fast = false) {
  if (n == null || n === 0) return "#242931";
  if (fast) n *= 60;
  if (n < 0) return tones[Math.min(3, Math.floor(Math.abs(n) / 1.2))];
  return tones[4 + Math.min(3, Math.floor(n / 0.9))];
}
function Spark() {
  return null;
}
function MarketChart({ asset, period, mode, kind, theme }) {
  const host = useRef(null),
    [status, setStatus] = useState("loading");
  useEffect(() => {
    let dead = false,
      chart,
      series,
      timer;
    const abort = new AbortController();
    setStatus("loading");
    async function draw() {
      try {
        let candles;
        if (mode === "demo")
          candles = demoHistory(
            markets.find((m) => m.id === asset.id),
            period,
          );
        else {
          candles = (await loadHistory(asset, period, abort.signal)).candles;
        }
        if (dead) return;
        if (!candles?.length) throw new Error();
        const first = !chart;
        if (first) {
          chart = createChart(host.current, {
            autoSize: true,
            layout: {
              background: {
                type: ColorType.Solid,
                color: theme === "light" ? "#ffffff" : "#10191e",
              },
              textColor: "#737d89",
              fontSize: 10,
              attributionLogo: true,
            },
            grid: {
              vertLines: { visible: false },
              horzLines: { color: theme === "light" ? "#e3eaee" : "#222e34" },
            },
            rightPriceScale: { borderVisible: false },
            timeScale: {
              borderVisible: false,
              timeVisible: period === "1D",
              secondsVisible: false,
            },
            crosshair: {
              vertLine: { color: "#7b848e", labelBackgroundColor: "#30383d" },
              horzLine: { color: "#7b848e", labelBackgroundColor: "#30383d" },
            },
          });
          series = chart.addSeries(CandlestickSeries, {
            upColor: "#3db99b",
            downColor: "#e57183",
            borderVisible: false,
            wickUpColor: "#3db99b",
            wickDownColor: "#e57183",
          });
          series.applyOptions({
            priceFormat: {
              type: "price",
              precision:
                (asset.price ??
                  markets.find((m) => m.id === asset.id).samplePrice) < 1
                  ? 4
                  : 2,
              minMove:
                (asset.price ??
                  markets.find((m) => m.id === asset.id).samplePrice) < 1
                  ? 0.0001
                  : 0.01,
            },
          });
        }
        series.setData(kind === "heikin" ? heikinAshi(candles) : candles);
        if (first) chart.timeScale().fitContent();
        setStatus("ready");
      } catch (e) {
        if (!dead && e.name !== "AbortError") setStatus("error");
      } finally {
        if (!dead && mode === "live") timer = setTimeout(draw, 30000);
      }
    }
    draw();
    return () => {
      dead = true;
      abort.abort();
      clearTimeout(timer);
      chart?.remove();
    };
  }, [asset.id, period, mode, kind, theme]);
  return (
    <div className="chart-wrap">
      <div className="chart-host" ref={host} />
      {status === "loading" && (
        <div className="chart-message">
          <RefreshCw size={16} className="spin" /> Loading chart
        </div>
      )}
      {status === "error" && (
        <div className="chart-message">
          <Wifi size={19} />
          <span>Historical feed unavailable</span>
          <small>Switch to demo to explore the chart.</small>
        </div>
      )}
    </div>
  );
}
function HeatGroup({ name, items, selected, onSelect, sizeBy, flashes, fast }) {
  const ref = useRef(null),
    [bounds, setBounds] = useState({ width: 300, height: 230 });
  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setBounds({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const nodes = useMemo(() => {
    const root = hierarchy({ children: items })
      .sum((d) =>
        d.id
          ? sizeBy === "equal"
            ? 1
            : sizeBy === "movement"
              ? Math.max(0.5, Math.abs(d.change ?? 0))
              : d.weight
          : 0,
      )
      .sort((a, b) => b.value - a.value);
    treemap()
      .tile(treemapSquarify.ratio(1.25))
      .size([bounds.width, bounds.height])
      .paddingInner(3)
      .round(true)(root);
    return root.leaves();
  }, [items, bounds, sizeBy]);
  return (
    <section className="heat-group">
      <div className="group-label">
        <span>
          <i className={`group-dot dot-${groups.indexOf(name)}`} />
          {name}
        </span>
        <span>
          {items.length}
          <ChevronRight size={11} />
        </span>
      </div>
      <div ref={ref} className="group-map">
        {nodes.map((n) => {
          const a = n.data,
            w = n.x1 - n.x0,
            h = n.y1 - n.y0,
            large = w > 105 && h > 95,
            medium = w > 75 && h > 65;
          return (
            <button
              key={a.id}
              className={`heat-tile ${selected === a.id ? "selected" : ""} ${large ? "large" : medium ? "medium" : "small"} ${flashes[a.id] ? "flash-" + flashes[a.id] : ""}`}
              onClick={() => onSelect(a.id)}
              style={{
                left: n.x0,
                top: n.y0,
                width: w,
                height: h,
                backgroundColor: tileColor(a.change, fast),
              }}
              aria-label={`${a.name}, ${pct(a.change, fast ? 6 : 2)}. View chart`}
              title={`${a.name} · ${a.price == null ? "Unavailable" : formatPrice(a.price, a.currency) + " " + a.currency} · ${pct(a.change, fast ? 6 : 2)}${fast && a.sampleInterval ? ` · ${(a.sampleInterval / 1000).toFixed(3)}s between provider snapshots` : ""}`}
            >
              <div className="tile-main">
                <b>{a.symbol}</b>
                {h > 38 && (
                  <span>
                    {fast && a.provider !== "Binance"
                      ? "Delayed"
                      : pct(a.change, fast ? 6 : 2)}
                  </span>
                )}
                {large && <small>{a.name}</small>}
              </div>
              {large && a.spark?.length > 1 && (
                <Spark values={a.spark} positive={a.change >= 0} />
              )}{" "}
              {large && (
                <span className="tile-price">
                  {formatPrice(a.price, a.currency)}
                </span>
              )}
              {selected === a.id && w > 90 && (
                <span className="tile-selected">
                  <ArrowUpRight size={13} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
function App() {
  const [theme, setTheme] = useState(() => readStore("sharpnex-theme", "dark"));
  const [profileId, setProfileId] = useState(() => {
    const v = readStore("sharpnex-profile", null);
    return PROFILES.some((p) => p.id === v) ? v : null;
  });
  const [profileOpen, setProfileOpen] = useState(
    () => !PROFILES.some((p) => p.id === readStore("sharpnex-profile", null)),
  );
  const [signalSymbol, setSignalSymbol] = useState("BTCUSDT");
  const research = useResearch();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    putStore("sharpnex-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b1318" : "#f3f6f8");
  }, [theme]);
  const [mode, setMode] = useState(() => readStore("atlas-mode", "live"));
  const [quotes, setQuotes] = useState(() =>
    mode === "demo"
      ? demoSnapshot()
      : markets.map((m) => ({
          ...m,
          price: null,
          change: null,
          status: "loading",
          spark: [],
        })),
  );
  const [colorWindow, setColorWindow] = useState(
    mode === "demo" ? "period" : "tick",
  );
  const [period, setPeriod] = useState("1D"),
    [chartPeriod, setChartPeriod] = useState("1D"),
    [selected, setSelected] = useState("BTCUSDT");
  const [category, setCategory] = useState("All markets"),
    [search, setSearch] = useState(""),
    [view, setView] = useState(() => readStore("sharpnex-view", "signals")),
    [sizeBy, setSizeBy] = useState("importance");
  const [watchlist, setWatchlist] = useState(() =>
    readStore("atlas-watchlist", ["BTCUSDT", "GC=F", "^GSPC", "DX-Y.NYB"]),
  );
  const [modal, setModal] = useState(null),
    [paused, setPaused] = useState(false),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0),
    [fallback, setFallback] = useState(false),
    [error, setError] = useState(""),
    [fetchedAt, setFetchedAt] = useState(null),
    [kind, setKind] = useState("candles"),
    [flashes, setFlashes] = useState({}),
    [clock, setClock] = useState(new Date()),
    [expanded, setExpanded] = useState(false);
  const cryptoFeed = useCryptoFeed(mode === "live" && !paused);
  const feedRef = useRef(cryptoFeed);
  feedRef.current = cryptoFeed;
  const previous = useRef({}),
    searchRef = useRef(null),
    modalRef = useRef(null);
  useEffect(() => {
    const i = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setModal(null);
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement;
    modalRef.current?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const list = modalRef.current?.querySelectorAll(
        'button,a,input,select,[tabindex="0"]',
      );
      if (!list?.length) return;
      const first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prev?.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (mode === "demo") {
      setQuotes(demoSnapshot(period));
      setLoading(false);
      setFetchedAt(null);
      return;
    }
    if (paused) {
      setLoading(false);
      return;
    }
    let stopped = false,
      timer,
      flashTimer;
    const controller = new AbortController();
    setQuotes(
      markets.map((m) => ({
        ...m,
        price: null,
        change: null,
        status: "loading",
        spark: [],
      })),
    );
    previous.current = {};
    async function refresh() {
      const started = Date.now();
      let delay = 2000;
      if (document.hidden) {
        timer = setTimeout(refresh, 2000);
        return;
      }
      setLoading(true);
      try {
        const data = await loadMarkets(
          period,
          controller.signal,
          feedRef.current.status === "stream" ? feedRef.current.rows : null,
        );
        if (stopped) return;
        if (data.available === 0) {
          setFallback(true);
          setMode("demo");
          setError(
            "Live feeds could not be reached. You’re viewing illustrative demo data.",
          );
          return;
        }
        delay = data.retryAfterMs || 2000;
        const changes = {};
        data.quotes = data.quotes.map((q) => {
          const old = previous.current[q.id];
          const sampled =
            q.provider === "Binance"
              ? sampleChange(old, q)
              : { change: null, interval: null };
          if (
            old &&
            q.price != null &&
            q.price !== old.price &&
            sampled.change !== null
          )
            changes[q.id] = q.price > old.price ? "up" : "down";
          if (q.price != null && q.provider === "Binance")
            previous.current[q.id] = { price: q.price, asOf: q.asOf };
          else delete previous.current[q.id];
          return {
            ...q,
            twoSecondChange: sampled.change,
            sampleInterval: sampled.interval,
          };
        });
        setFlashes(changes);
        flashTimer = setTimeout(() => setFlashes({}), 1100);
        setQuotes(data.quotes);
        setFetchedAt(data.fetchedAt);
        setError(
          data.available < data.total
            ? `${data.total - data.available} feeds unavailable. Available quotes are shown with their provider timestamps.`
            : "",
        );
      } catch (e) {
        if (!stopped && e.name !== "AbortError") {
          delay = e.status === 429 ? 60000 : 5000;
          setQuotes((prev) =>
            prev.map((q) => ({
              ...q,
              twoSecondChange: null,
              status: q.price != null ? "stale" : q.status,
            })),
          );
          setError(
            "Could not reach the market server. Check the connection and retry.",
          );
        }
      } finally {
        if (!stopped) {
          setLoading(false);
          if (!paused)
            timer = setTimeout(
              refresh,
              Math.max(0, delay - (Date.now() - started)),
            );
        }
      }
    }
    refresh();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(flashTimer);
    };
  }, [mode, period, paused, retry]);
  function changeMode(next) {
    setPaused(false);
    setMode(next);
    putStore("atlas-mode", next);
    setFallback(false);
    setError("");
    setRetry((x) => x + 1);
  }
  function toggleWatch(id) {
    setWatchlist((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      putStore("atlas-watchlist", next);
      return next;
    });
  }
  const feedById = new Map(cryptoFeed.rows.map((q) => [q.id, q]));
  const liveQuotes = quotes.map((q) => {
    const v = mode === "live" && !paused ? feedById.get(q.id) : null;
    if (!v || !(v.price > 0) || q.asOf > v.asOf) return q;
    return {
      ...q,
      price: v.price,
      asOf: v.asOf,
      high: v.high ?? q.high,
      low: v.low ?? q.low,
      volume: v.volume,
      status:
        ["stream", "fallback"].includes(cryptoFeed.status) &&
        Date.now() - v.asOf < 120000
          ? "live"
          : "stale",
      change:
        period === "1D"
          ? v.change
          : q.price > 0 && Number.isFinite(q.change)
            ? (v.price / (q.price / (1 + q.change / 100)) - 1) * 100
            : null,
      tickChange: v.tickChange,
      tickInterval: v.tickInterval,
    };
  });
  const expandedCrypto =
    mode === "live" &&
    (category === "Crypto" ||
      search ||
      view === "watchlist" ||
      view === "movers");
  const extras = expandedCrypto
    ? cryptoFeed.rows
        .filter((r) => !liveQuotes.some((q) => q.id === r.id))
        .map((r) => ({
          ...r,
          name: r.symbol,
          provider: "Binance",
          group: "Crypto",
          type: "Cryptocurrency",
          currency: "USDT",
          weight: Math.max(1, Math.log10(Math.max(10, r.volume)) - 3),
          sampleInterval: r.tickInterval,
          status:
            ["stream", "fallback"].includes(cryptoFeed.status) &&
            Date.now() - r.asOf < 120000
              ? "live"
              : "stale",
          spark: [],
          change: period === "1D" ? r.change : null,
        }))
    : [];
  const allQuotes = [
    ...liveQuotes.filter(
      (q) =>
        category !== "Crypto" ||
        !cryptoFeed.rows.length ||
        q.provider !== "Binance" ||
        feedById.has(q.id),
    ),
    ...extras,
  ];
  const asset = allQuotes.find((q) => q.id === selected) || liveQuotes[0];
  const liveFlashes = {
    ...flashes,
    ...Object.fromEntries(
      cryptoFeed.rows
        .filter((q) => !paused && q.flash)
        .map((q) => [q.id, q.flash]),
    ),
  };
  const displayedQuotes = allQuotes.map((q) => ({
    ...q,
    sampleInterval: colorWindow === "tick" ? q.tickInterval : q.sampleInterval,
    change:
      colorWindow === "tick"
        ? mode === "live" &&
          !paused &&
          cryptoFeed.status === "stream" &&
          Date.now() - q.asOf < 6000
          ? (q.tickChange ?? null)
          : null
        : colorWindow === "2s"
          ? mode === "live" && !paused && Date.now() - (fetchedAt || 0) < 8000
            ? (q.twoSecondChange ?? null)
            : null
          : q.change,
  }));
  const filtered = displayedQuotes.filter(
    (q) =>
      (category === "All markets" ||
        (category === "Indices"
          ? q.type === "Market index"
          : category === "Stocks"
            ? q.type === "Stock"
            : category === "Currencies"
              ? q.group === "FX & macro"
              : q.group === category)) &&
      (view !== "watchlist" || watchlist.includes(q.id)) &&
      `${q.symbol} ${q.name} ${q.group}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const gainers = filtered.filter((q) => q.change > 0).length,
    losers = filtered.filter((q) => q.change < 0).length,
    unchanged = filtered.filter((q) => q.change === 0).length;
  const movers = [...filtered]
    .filter((q) => q.change !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5);
  const shownGroups = groups.filter((g) => filtered.some((q) => q.group === g));
  const summaries = ["BTCUSDT", "^GSPC", "GC=F", "DX-Y.NYB", "^VIX"].map((id) =>
    quotes.find((q) => q.id === id),
  );
  const selectAsset = (id) => {
    setSelected(id);
    setChartPeriod(period);
  };
  const exportCsv = () => {
    const rows = [
      [
        "Symbol",
        "Name",
        "Price",
        "Currency",
        ["2s", "tick"].includes(colorWindow)
          ? "Sample change (%)"
          : "Change (%)",
        "Sample interval (ms)",
        "Source",
        "Status",
        "Timestamp",
      ],
      ...filtered.map((q) => [
        q.symbol,
        q.name,
        q.price ?? "",
        q.currency,
        q.change ?? "",
        ["2s", "tick"].includes(colorWindow) ? (q.sampleInterval ?? "") : "",
        q.provider,
        q.status,
        q.asOf ? new Date(q.asOf).toISOString() : "DEMO",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sharpnex-${mode}-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={`app-shell view-${view}`}>
      <div className="workspace">
        <header className="topbar">
          <Brand />
          <ReleaseNotice />
          <div className="top-nav">
            <button
              aria-label="Trade hunt"
              className={view === "signals" ? "current" : ""}
              onClick={() => setView("signals")}
            >
              Hunt
            </button>
            <button
              aria-label="Market heatmap"
              className={view === "heatmap" ? "current" : ""}
              onClick={() => setView("heatmap")}
            >
              Map
            </button>
            <button
              aria-label="World monitor"
              className={view === "news" ? "current" : ""}
              onClick={() => setView("news")}
            >
              News
            </button>
            <button
              aria-label="Unlocks and market context"
              className={view === "context" ? "current" : ""}
              onClick={() => setView("context")}
            >
              Unlocks
            </button>
          </div>
          <div className="top-right">
            <button
              className="icon-button"
              aria-label="My watchlist"
              title="My watchlist"
              onClick={() => setView("watchlist")}
            >
              <Star size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Market movers"
              title="Market movers"
              onClick={() => setView("movers")}
            >
              <TrendingUp size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={theme === "dark" ? "Light theme" : "Dark theme"}
              onClick={() => setTheme((v) => (v === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="icon-button profile-button"
              aria-label="Trader profile"
              title="Trader profile"
              onClick={() => setProfileOpen(true)}
            >
              <UserRound size={17} />
            </button>
            <div className={`feed-pill ${mode === "demo" ? "demo" : ""}`}>
              <i />
              {mode === "demo"
                ? "DEMO DATA"
                : loading && !fetchedAt
                  ? "CONNECTING"
                  : paused
                    ? "PAUSED"
                    : error
                      ? "PARTIAL / ERROR"
                      : "FREE FEEDS"}
            </div>
            <button
              className="icon-button"
              title="Data sources"
              aria-label="Data sources"
              onClick={() => setModal("feeds")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        <div className="terminal-body">
          <CoinRail
            quotes={quotes}
            feed={cryptoFeed}
            mode={mode}
            paused={paused}
            selected={signalSymbol}
            onSelect={(id) => {
              setSignalSymbol(id);
              setView("signals");
            }}
          />
          <main>
            {(mode === "demo" || error) && (
              <div className={`notice ${mode === "demo" ? "" : "warning"}`}>
                <Info size={14} />
                <span>
                  {mode === "demo"
                    ? fallback
                      ? error
                      : "Demo mode · Illustrative prices and charts. Switch to live for current provider data."
                    : error}
                </span>
                <button onClick={() => changeMode("live")}>
                  {loading ? "Connecting…" : "Connect live"}
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            {view === "signals" ? (
              <HuntDesk
                mode={mode}
                paused={paused}
                onConnect={() => changeMode("live")}
                onTogglePause={() => setPaused((v) => !v)}
                theme={theme}
                profileId={profileId}
                onProfile={() => setProfileOpen(true)}
                symbol={signalSymbol}
                onSymbol={setSignalSymbol}
                research={research}
                feed={cryptoFeed}
              />
            ) : view === "news" ? (
              <ResearchBoard research={research} quotes={quotes} />
            ) : view === "context" ? (
              <ContextPanel />
            ) : (
              <>
                <section className="workspace-heading">
                  <div className="workspace-title">
                    <Globe2 size={19} />
                    <h2>
                      {view === "watchlist"
                        ? "Your watchlist"
                        : view === "movers"
                          ? "Market movers"
                          : "Global market map"}
                    </h2>
                    <span className="count-badge">
                      {filtered.length} assets
                    </span>
                  </div>
                  <div className="workspace-actions">
                    <button
                      className="icon-button"
                      title={
                        paused ? "Resume auto refresh" : "Pause auto refresh"
                      }
                      aria-label={
                        paused ? "Resume auto refresh" : "Pause auto refresh"
                      }
                      onClick={() => setPaused((v) => !v)}
                    >
                      {paused ? <Play size={15} /> : <Pause size={15} />}
                    </button>
                    <button
                      className="refresh-button"
                      disabled={loading}
                      onClick={() => setRetry((x) => x + 1)}
                    >
                      <RefreshCw size={13} className={loading ? "spin" : ""} />
                      <span>
                        {loading
                          ? "Fetching"
                          : mode === "demo"
                            ? "Demo snapshot"
                            : paused
                              ? "Paused"
                              : "Crypto · 2s"}
                      </span>
                    </button>
                    <div className="thin-divider" />
                    <button
                      className="icon-button"
                      title={expanded ? "Exit expanded map" : "Expand map"}
                      aria-label={expanded ? "Exit expanded map" : "Expand map"}
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? (
                        <PanelRightClose size={17} />
                      ) : (
                        <Expand size={17} />
                      )}
                    </button>
                  </div>
                </section>
                <div className="filter-bar">
                  <div className="category-tabs">
                    {[
                      "All markets",
                      "Crypto",
                      "Indices",
                      "Stocks",
                      "Commodities",
                      "Currencies",
                    ].map((c) => (
                      <button
                        key={c}
                        className={category === c ? "active" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={14} />
                    <input
                      ref={searchRef}
                      aria-label="Search markets"
                      placeholder="Find an asset…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={13} />
                      </button>
                    ) : (
                      <kbd>⌘ K</kbd>
                    )}
                  </label>
                </div>
                <div className={`dashboard-grid ${expanded ? "expanded" : ""}`}>
                  <section className="map-panel">
                    <div className="map-toolbar">
                      <div
                        className="period-switch"
                        aria-label="Heatmap timeframe"
                      >
                        <button
                          className={colorWindow === "tick" ? "active" : ""}
                          onClick={() => {
                            setColorWindow("tick");
                            setPeriod("1D");
                          }}
                        >
                          Live tick
                        </button>
                        <button
                          className={colorWindow === "2s" ? "active" : ""}
                          onClick={() => {
                            setColorWindow("2s");
                            setPeriod("1D");
                          }}
                        >
                          2s
                        </button>
                        {["1D", "1W", "1M"].map((p) => (
                          <button
                            key={p === "tick" ? "Live tick" : p}
                            className={
                              colorWindow === "period" && period === p
                                ? "active"
                                : ""
                            }
                            onClick={() => {
                              setColorWindow("period");
                              setPeriod(p);
                            }}
                          >
                            {p === "tick" ? "Live tick" : p}
                          </button>
                        ))}
                      </div>
                      <span className="toolbar-note">
                        {colorWindow === "tick"
                          ? "1s crypto stream · changes only when traded"
                          : colorWindow === "2s"
                            ? "2s crypto samples · global feeds neutral"
                            : period === "1D"
                              ? "Session change"
                              : "Period change"}{" "}
                        <button
                          className="inline-icon"
                          title="How changes are calculated"
                          aria-label="How changes are calculated"
                          onClick={() => setModal("about")}
                        >
                          <Info size={12} />
                        </button>
                      </span>
                      <label className="size-select">
                        <Layers size={13} />
                        <span>Size by</span>
                        <select
                          aria-label="Tile size"
                          value={sizeBy}
                          onChange={(e) => setSizeBy(e.target.value)}
                        >
                          <option value="importance">Importance</option>
                          <option value="movement">Price movement</option>
                          <option value="equal">Equal weight</option>
                        </select>
                        <ChevronDown size={12} />
                      </label>
                    </div>
                    {filtered.length === 0 ? (
                      <div className="empty-state">
                        <Search size={29} />
                        <h3>No assets here yet</h3>
                        <p>
                          {view === "watchlist"
                            ? "Star assets in the detail panel to build your watchlist."
                            : "Try a different symbol or market category."}
                        </p>
                        <button
                          className="outline-button"
                          onClick={() => {
                            setSearch("");
                            setCategory("All markets");
                            setView("heatmap");
                          }}
                        >
                          View all markets
                        </button>
                      </div>
                    ) : view === "movers" ? (
                      <div className="movers-table">
                        <div className="table-header">
                          <span>ASSET</span>
                          <span>PRICE</span>
                          <span>CHANGE</span>
                          <span>MARKET</span>
                        </div>
                        {[...filtered]
                          .sort(
                            (a, b) =>
                              Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0),
                          )
                          .map((a) => (
                            <button
                              key={a.id}
                              className="table-row"
                              onClick={() => selectAsset(a.id)}
                            >
                              <span>
                                <b>{a.symbol}</b>
                                <small>{a.name}</small>
                              </span>
                              <span>{formatPrice(a.price, a.currency)}</span>
                              <span
                                className={
                                  a.change >= 0 ? "positive" : "negative"
                                }
                              >
                                {pct(a.change)}
                              </span>
                              <span>{a.group}</span>
                            </button>
                          ))}
                      </div>
                    ) : (
                      <div className={`heatmap groups-${shownGroups.length}`}>
                        {shownGroups.map((g) => (
                          <HeatGroup
                            key={g}
                            name={g}
                            items={filtered.filter((q) => q.group === g)}
                            selected={selected}
                            onSelect={selectAsset}
                            sizeBy={sizeBy}
                            flashes={liveFlashes}
                            fast={["2s", "tick"].includes(colorWindow)}
                          />
                        ))}
                      </div>
                    )}
                    <div className="map-bottom">
                      <span>
                        <span className="mouse-icon">↖</span> Select any asset
                        to explore
                      </span>
                      <div className="heat-legend">
                        <span>{colorWindow === "2s" ? "−0.05%" : "−3%"}</span>
                        <i style={{ background: "#b45057" }} />
                        <i style={{ background: "#813a40" }} />
                        <i style={{ background: "#493139" }} />
                        <i style={{ background: "#283330" }} />
                        <i style={{ background: "#246952" }} />
                        <i style={{ background: "#268364" }} />
                        <i style={{ background: "#2b9c73" }} />
                        <span>{colorWindow === "2s" ? "+0.05%" : "+3%"}</span>
                      </div>
                    </div>
                  </section>
                  {!expanded && (
                    <aside className="detail-panel">
                      <div className="detail-heading">
                        <div
                          className={`asset-avatar ${asset.group === "Crypto" ? "crypto" : ""}`}
                        >
                          {asset.icon || asset.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <h2>{asset.name}</h2>
                          <span>
                            {asset.symbol} <i>·</i> {asset.group}
                          </span>
                        </div>
                        <button
                          className={`icon-button star-button ${watchlist.includes(asset.id) ? "saved" : ""}`}
                          title={
                            watchlist.includes(asset.id)
                              ? "Remove from watchlist"
                              : "Add to watchlist"
                          }
                          aria-label={
                            watchlist.includes(asset.id)
                              ? "Remove from watchlist"
                              : "Add to watchlist"
                          }
                          onClick={() => toggleWatch(asset.id)}
                        >
                          <Star
                            size={18}
                            fill={
                              watchlist.includes(asset.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </div>
                      <div className="asset-price">
                        <span>
                          {asset.currency === "USD" || asset.currency === "USDT"
                            ? "$"
                            : ""}
                          {formatPrice(asset.price, asset.currency)}
                        </span>
                        <small>{asset.currency}</small>
                      </div>
                      <div className="asset-change">
                        <span
                          className={
                            asset.change >= 0 ? "positive" : "negative"
                          }
                        >
                          {asset.change >= 0 ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownRight size={14} />
                          )}{" "}
                          {pct(asset.change)}
                        </span>
                        <span>
                          {period === "1D"
                            ? "today"
                            : `past ${period === "1W" ? "week" : "month"}`}
                        </span>
                        <span className="detail-status">
                          {mode === "demo"
                            ? "DEMO"
                            : asset.status === "snapshot"
                              ? "SNAPSHOT"
                              : asset.status === "stale"
                                ? "STALE"
                                : asset.status === "delayed"
                                  ? "DELAYED"
                                  : asset.status === "live"
                                    ? "LIVE"
                                    : asset.status === "loading"
                                      ? "LOADING"
                                      : "UNAVAILABLE"}
                        </span>
                      </div>
                      <MarketChart
                        asset={asset}
                        period={chartPeriod}
                        mode={mode}
                        kind={kind}
                        theme={theme}
                      />
                      <div className="chart-controls">
                        <div className="chart-periods">
                          {["1D", "1W", "1M", "3M", "1Y"].map((p) => (
                            <button
                              className={chartPeriod === p ? "active" : ""}
                              key={p === "tick" ? "Live tick" : p}
                              onClick={() => setChartPeriod(p)}
                            >
                              {p === "tick" ? "Live tick" : p}
                            </button>
                          ))}
                        </div>
                        <div
                          className="segmented chart-kind"
                          aria-label="Market chart style"
                        >
                          <button
                            aria-label="Show candlesticks"
                            className={kind === "candles" ? "active" : ""}
                            onClick={() => setKind("candles")}
                          >
                            Candles
                          </button>
                          <button
                            aria-label="Show Heikin-Ashi"
                            className={kind === "heikin" ? "active" : ""}
                            onClick={() => setKind("heikin")}
                          >
                            HA
                          </button>
                        </div>
                      </div>
                      {kind === "heikin" && (
                        <p className="ha-note">
                          Heikin-Ashi is a synthetic view. Prices and analysis
                          use real exchange OHLC.
                        </p>
                      )}
                      <div className="stat-grid">
                        <div>
                          <span>{period === "1D" ? "Day" : "Period"} high</span>
                          <b>{formatPrice(asset.high, asset.currency)}</b>
                        </div>
                        <div>
                          <span>{period === "1D" ? "Day" : "Period"} low</span>
                          <b>{formatPrice(asset.low, asset.currency)}</b>
                        </div>
                        <div>
                          <span>
                            {asset.group === "Crypto"
                              ? "24h quote volume"
                              : "Session volume"}
                          </span>
                          <b>{compact(asset.volume)}</b>
                        </div>
                        <div>
                          <span>Data provider</span>
                          <b>
                            {mode === "demo" ? "Illustrative" : asset.provider}
                          </b>
                        </div>
                      </div>
                      <div className="context-box">
                        <div>
                          <Zap size={13} />
                          <span>THE BIGGER PICTURE</span>
                        </div>
                        <p>{marketContext[asset.group]}</p>
                      </div>
                      <div className="detail-timestamp">
                        <Clock3 size={11} />
                        {timeLabel(asset.asOf)}
                      </div>
                    </aside>
                  )}
                </div>
                <section className="bottom-grid">
                  <div className="breadth-card">
                    <div className="section-label">
                      <Activity size={14} />
                      Market breadth<span>{period}</span>
                    </div>
                    <div className="breadth-counts">
                      <span>
                        <i className="positive-dot" />
                        <b>{gainers}</b> advancing
                      </span>
                      <span>
                        <i className="negative-dot" />
                        <b>{losers}</b> declining
                      </span>
                    </div>
                    <div className="breadth-bar">
                      <i style={{ flex: gainers || 0.01 }} />
                      <i style={{ flex: unchanged || 0.01 }} />
                      <i style={{ flex: losers || 0.01 }} />
                    </div>
                    <small>
                      Across {filtered.filter((q) => q.change !== null).length}{" "}
                      available assets in this view
                    </small>
                  </div>
                  <div className="movers-card">
                    <div className="section-label">
                      <Zap size={14} />
                      Biggest moves<span>BY ABSOLUTE CHANGE</span>
                      <button onClick={() => setView("movers")}>
                        View all
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                    <div className="mover-items">
                      {movers.map((a) => (
                        <button key={a.id} onClick={() => selectAsset(a.id)}>
                          <span>
                            {a.symbol}
                            <ArrowUpRight size={12} />
                          </span>
                          <strong
                            className={a.change >= 0 ? "positive" : "negative"}
                          >
                            {pct(a.change)}
                          </strong>
                          <small>{a.name}</small>
                        </button>
                      ))}
                      {!movers.length && (
                        <p className="muted">Waiting for market data</p>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
            {view !== "signals" && (
              <footer>
                <span>
                  <i
                    className={mode === "demo" ? "demo-dot" : "positive-dot"}
                  />
                  {mode === "demo"
                    ? "Illustrative demo data"
                    : `Last fetched ${fetchedAt ? new Date(fetchedAt).toLocaleTimeString("en-GB", { timeZone: "UTC" }) + " UTC" : "—"}`}
                </span>
                <div>
                  <button onClick={exportCsv}>
                    Export CSV <ArrowUpRight size={11} />
                  </button>
                  <button onClick={() => setModal("about")}>
                    About the data <ExternalLink size={11} />
                  </button>
                </div>
              </footer>
            )}
          </main>
        </div>
      </div>
      {profileOpen && (
        <TraderProfile
          value={profileId}
          onClose={() => setProfileOpen(false)}
          onSave={(id) => {
            setProfileId(id);
            putStore("sharpnex-profile", id);
            setProfileOpen(false);
          }}
        />
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
            ref={modalRef}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <div className="modal-icon">
              {modal === "feeds" ? <Radio size={25} /> : <Globe2 size={25} />}
            </div>
            <h2 id="modal-title">
              {modal === "feeds"
                ? "Your window to the markets"
                : "A wider perspective."}
            </h2>
            <p>
              {modal === "feeds"
                ? "Public market data. No subscriptions, paid APIs, or API keys."
                : "SHARPNEX combines source-backed market context with transparent RSI divergence research. It provides no trade execution or guaranteed predictions."}
            </p>
            {modal === "feeds" ? (
              <>
                <div className="mode-options">
                  <button
                    className={mode === "live" ? "active" : ""}
                    onClick={() => changeMode("live")}
                  >
                    <Wifi size={18} />
                    <b>Live feeds</b>
                    <small>Fetch real provider quotes</small>
                    {mode === "live" && <Check size={16} />}
                  </button>
                  <button
                    className={mode === "demo" ? "active" : ""}
                    onClick={() => changeMode("demo")}
                  >
                    <Layers size={18} />
                    <b>Demo mode</b>
                    <small>Illustrative data, works offline</small>
                    {mode === "demo" && <Check size={16} />}
                  </button>
                </div>
                <div className="provider-row">
                  <div>
                    <b>Binance public market data</b>
                    <span>
                      10 map pairs · 2s target; full USDT rail · 30s target
                    </span>
                  </div>
                  <span className="free-badge">FREE</span>
                </div>
                <div className="provider-row">
                  <div>
                    <b>Yahoo Finance</b>
                    <span>
                      {staticHosting
                        ? "Global markets · Scheduled ~5min snapshots"
                        : "Global markets · Cached 60s"}
                    </span>
                  </div>
                  <span className="free-badge">FREE</span>
                </div>
                <div className="provider-row">
                  <div>
                    <b>Hyperliquid public market data</b>
                    <span>
                      Separate perpetual candles, funding and open interest
                    </span>
                  </div>
                  <span className="free-badge">FREE</span>
                </div>
                <div className="provider-row">
                  <div>
                    <b>Official calendars & publisher feeds</b>
                    <span>
                      Fed, BLS, SEC, EIA, CoinDesk, Cointelegraph and BBC
                    </span>
                  </div>
                  <span className="free-badge">FREE</span>
                </div>
                <div className="modal-note">
                  <Info size={16} />
                  <p>
                    Yahoo’s public feed is unofficial and may be delayed,
                    rate-limited, or unavailable. Binance availability varies by
                    region. Empty quotes stay empty; demo data is always
                    labeled.{" "}
                    {staticHosting &&
                      "Global quotes refresh through scheduled GitHub Actions; schedules can be delayed. Browser access to raw.githubusercontent.com is required. "}
                    Live access requires network access to{" "}
                    <code>data-api.binance.vision</code> and{" "}
                    <code>query1.finance.yahoo.com</code>.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="about-block">
                  <b>How to read the map</b>
                  <p>
                    Green means up, red means down. Tile size defaults to
                    editorial importance for this dashboard, not market cap or a
                    measured relationship to Bitcoin. Use the size menu to
                    switch to equal weight or absolute price movement.
                  </p>
                  <b>Two-second mode</b>
                  <p>
                    Crypto prices are requested on a two-second target cadence
                    while this tab is visible. Returns compare consecutive
                    exchange snapshots only when their timestamps are 1.5–3.5
                    seconds apart. Network delays, exchange limits and browser
                    throttling can prevent this cadence. Invalid intervals and
                    delayed global markets remain neutral in 2s mode. Flashes
                    require an actual changed quote. No sample means no inferred
                    price movement.
                  </p>
                  <b>Timeframes & coverage</b>
                  <p>
                    1D uses a rolling 24 hours for crypto and change from the
                    provider’s previous close for other markets. Longer periods
                    use the first available candle in the requested window.
                    Closed markets retain their last quote. SGX / STI represents
                    Singapore’s Straits Times Index; commodities are futures,
                    not spot prices.
                  </p>
                  <b>Charts & sources</b>
                  <p>
                    Charts use the open-source{" "}
                    <a
                      href="https://www.tradingview.com/lightweight-charts/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      TradingView Lightweight Charts
                    </a>{" "}
                    library. Data comes from Binance and Yahoo Finance public
                    endpoints. Review providers’ terms before redistribution or
                    commercial use. Cross-market notes are context, not
                    predictions or financial advice.
                  </p>
                </div>
              </>
            )}
            <button className="primary-button" onClick={() => setModal(null)}>
              Back to markets <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
