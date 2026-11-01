import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { Activity, ArrowUpRight, Info, RefreshCw } from "lucide-react";
import { getFiveMinuteContext } from "./trading-data.js";
const money = (v) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
const date = (v) =>
  v
    ? new Date(v).toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " UTC"
    : "—";
function FiveMinuteChart({ data }) {
  const ref = useRef(null),
    handle = useRef(null);
  useEffect(() => {
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: "#12161b" },
        textColor: "#8c99a7",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#242c35" } },
      rightPriceScale: { borderColor: "#303a44" },
      timeScale: { timeVisible: true, borderColor: "#303a44" },
    });
    const price = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#7ad9ab",
        downColor: "#e28d95",
        wickUpColor: "#7ad9ab",
        wickDownColor: "#e28d95",
        borderVisible: false,
      },
      0,
    );
    const rsi = chart.addSeries(
      LineSeries,
      {
        color: "#cceca0",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      },
      1,
    );
    rsi.createPriceLine({
      price: 70,
      color: "#c27b83",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "70",
    });
    rsi.createPriceLine({
      price: 30,
      color: "#72b695",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "30",
    });
    const markers = createSeriesMarkers(price, []);
    handle.current = { chart, price, rsi, markers, first: true };
    return () => {
      chart.remove();
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    if (!data?.candles?.length) {
      h.price.setData([]);
      h.rsi.setData([]);
      h.markers.setMarkers([]);
      h.first = true;
      return;
    }
    h.price.setData(data.candles);
    h.rsi.setData(
      data.candles.flatMap((c, i) =>
        Number.isFinite(data.rsi[i])
          ? [{ time: c.time, value: data.rsi[i] }]
          : [],
      ),
    );
    h.markers.setMarkers(
      data.events.map((e) => ({
        time: data.candles[e.confirmed].time,
        position: e.direction === "bull" ? "belowBar" : "aboveBar",
        color: e.direction === "bull" ? "#a6e6b5" : "#f2a0a7",
        shape: e.direction === "bull" ? "arrowUp" : "arrowDown",
        text:
          e.direction === "bull" ? "Bull div confirmed" : "Bear div confirmed",
      })),
    );
    if (h.first) {
      h.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.candles.length - 100),
        to: data.candles.length + 3,
      });
      h.first = false;
    }
  }, [data]);
  return (
    <div
      ref={ref}
      className="five-minute-chart"
      aria-label="Five-minute price candles and Wilder RSI chart"
    />
  );
}
export default function SignalDesk({ mode, paused, onConnect, onTogglePause }) {
  const [selected, setSelected] = useState("BTCUSDT"),
    [results, setResults] = useState({}),
    [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now()),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (mode !== "live" || paused) return;
    let dead = false,
      timer,
      busy = false;
    const controller = new AbortController();
    async function update() {
      if (dead || busy) return;
      if (document.hidden) {
        timer = setTimeout(update, 2000);
        return;
      }
      busy = true;
      setLoading(true);
      let delay = 2000;
      const started = Date.now();
      await Promise.all(
        ["BTCUSDT", "ETHUSDT"].map(async (symbol) => {
          try {
            const data = await getFiveMinuteContext(symbol, controller.signal);
            if (!dead) setResults((p) => ({ ...p, [symbol]: data }));
          } catch (e) {
            if (e.status === 429) delay = 60000;
            if (!dead)
              setResults((p) => ({
                ...p,
                [symbol]: {
                  status: "unavailable",
                  reason:
                    e.status === 429
                      ? "Exchange rate limit; retrying in 60s"
                      : "Cannot verify the exchange feed. Signals suspended.",
                  candles: [],
                  events: [],
                },
              }));
          }
        }),
      );
      busy = false;
      if (!dead) {
        setLoading(false);
        timer = setTimeout(
          update,
          Math.max(1000, delay - (Date.now() - started)),
        );
      }
    }
    update();
    return () => {
      dead = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [mode, paused, retry]);
  const data = results[selected];
  const usable =
    mode === "live" &&
    !paused &&
    data?.status === "ready" &&
    now - data.receivedAt <= 8000;
  const active = usable ? data.active : null;
  const headline = !usable
    ? mode === "demo"
      ? "LIVE DATA REQUIRED"
      : paused
        ? "PAUSED"
        : data?.reason ||
          (data?.receivedAt && now - data.receivedAt > 8000
            ? "STALE DATA · SIGNALS SUSPENDED"
            : "CHECKING EXCHANGE DATA")
    : active
      ? active.state === "triggered"
        ? `${active.direction === "bull" ? "BULL" : "BEAR"} SIGNAL`
        : `${active.direction === "bull" ? "BULLISH" : "BEARISH"} DIVERGENCE · WAIT`
      : "WAIT · NO CONFIRMED SETUP";
  const lastRSI = data?.rsi?.at(-1);
  return (
    <section className="signal-desk">
      <div className="desk-heading">
        <div>
          <div className="eyebrow">CLOSED CANDLES. EXPLICIT RULES.</div>
          <h2>5-minute signal desk</h2>
          <p>BTCUSDT & ETHUSDT · Binance spot · Wilder RSI(14)</p>
        </div>
        <div className="desk-controls">
          <button className="outline-button" onClick={onTogglePause}>
            {paused ? "Resume analysis" : "Pause analysis"}
          </button>
          <button
            className="outline-button"
            onClick={() => setRetry((v) => v + 1)}
            disabled={loading || paused || mode !== "live"}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Verify
            feed
          </button>
        </div>
      </div>
      <div className="signal-market-tabs">
        {["BTCUSDT", "ETHUSDT"].map((symbol) => {
          const r = results[symbol],
            ok =
              mode === "live" &&
              !paused &&
              r?.status === "ready" &&
              now - r.receivedAt <= 8000;
          return (
            <button
              key={symbol}
              onClick={() => setSelected(symbol)}
              className={selected === symbol ? "active" : ""}
            >
              <b>{symbol}</b>
              <span>
                {ok
                  ? `RSI ${r.rsi.at(-1).toFixed(2)}`
                  : "Waiting for verified data"}
              </span>
              <small>
                {ok
                  ? r.active?.state === "triggered"
                    ? `${r.active.direction.toUpperCase()} SIGNAL`
                    : r.active
                      ? "Divergence · wait"
                      : "No setup"
                  : "No actionable signal"}
              </small>
            </button>
          );
        })}
      </div>
      {mode === "demo" && (
        <div className="notice">
          <Info size={15} />
          <span>Demo prices never generate trade signals.</span>
          <button onClick={onConnect}>
            Connect live <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="signal-layout">
        <div className="signal-chart-panel">
          <div className="signal-chart-heading">
            <b>{selected} · 5m</b>
            <span>Price + RSI(14) · closed candles only</span>
          </div>
          <FiveMinuteChart data={mode === "live" ? data : null} />
          <div className="signal-chart-foot">
            Divergence arrows mark confirmation, three closed candles after the
            swing. Chart times are UTC.
          </div>
        </div>
        <aside
          className={`signal-decision ${active?.direction || "neutral"}`}
          aria-live="polite"
        >
          <div className="eyebrow">
            <Activity size={13} /> RULE-BASED ANALYSIS
          </div>
          <h3>{headline}</h3>
          <p>
            {!usable
              ? "No trade signal is shown without fresh, complete exchange data."
              : active?.state === "triggered"
                ? `A closed 5m candle broke the confirmation level. This is a technical signal, not a prediction.`
                : active
                  ? `Confirmed regular ${active.direction === "bull" ? "bullish" : "bearish"} RSI divergence. Wait for a subsequent candle to close ${active.direction === "bull" ? "above" : "below"} ${money(active.trigger)}.`
                  : "No qualifying confirmed RSI divergence is active. Waiting is a valid result."}
          </p>
          <dl className="signal-metrics">
            <div>
              <dt>RSI(14), last closed bar</dt>
              <dd>{Number.isFinite(lastRSI) ? lastRSI.toFixed(2) : "—"}</dd>
            </div>
            <div>
              <dt>Closed-candle price</dt>
              <dd>{money(data?.lastClose)}</dd>
            </div>
            <div>
              <dt>Breakout level</dt>
              <dd>{active ? money(active.trigger) : "—"}</dd>
            </div>
            <div>
              <dt>Observed signal close</dt>
              <dd>{active?.entry ? money(active.entry) : "Not triggered"}</dd>
            </div>
            <div>
              <dt>Setup invalidation</dt>
              <dd>{active ? money(active.stop) : "—"}</dd>
            </div>
            <div>
              <dt>Illustrative 2R level</dt>
              <dd>{active?.target ? money(active.target) : "After trigger"}</dd>
            </div>
          </dl>
          <div className="signal-timing">
            <span>Closed: {date(data?.lastCandleAt)}</span>
            <span>
              Last check:{" "}
              {data?.receivedAt
                ? `${Math.max(0, Math.floor((now - data.receivedAt) / 1000))}s ago · request ${data.latency}ms`
                : "—"}
            </span>
            <span>
              Signals checked every 2s; only new closed bars can change
              confirmation.
            </span>
          </div>
        </aside>
      </div>
      <div className="context-metrics">
        {[
          ["ATR(14)", money(data?.atr), "5m volatility"],
          [
            "EMA 20 / 50",
            `${money(data?.ema20)} / ${money(data?.ema50)}`,
            "Closed-candle trend",
          ],
          [
            "Session VWAP",
            money(data?.vwap),
            "UTC day · typical-price approximation",
          ],
          [
            "Relative volume",
            data?.relativeVolume != null
              ? `${data.relativeVolume.toFixed(2)}×`
              : "—",
            "Last closed bar / prior 20 bars",
          ],
          [
            "Spot spread",
            data?.depth ? `${data.depth.spreadBps.toFixed(4)} bps` : "—",
            "Best bid / ask at last check",
          ],
          [
            "Book imbalance",
            data?.depth ? `${data.depth.imbalance.toFixed(1)}%` : "—",
            "Top 20 bid vs ask levels · spoofable",
          ],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <details className="signal-method">
        <summary>Calculation rules & limitations</summary>
        <p>
          RSI uses Wilder’s 14-period smoothing on five-minute closes, seeded
          from at least 100 consecutive closed candles. A swing needs 3
          lower/higher neighbors on each side; confirmation therefore arrives 15
          minutes after the pivot. Compare adjacent same-type pivots 5–60 bars
          apart. Regular bullish divergence requires price at least 0.05% lower,
          RSI at least 3 points higher and one pivot RSI ≤40. Bearish is the
          reverse with RSI ≥60.
        </p>
        <p>
          A subsequent closed candle must break the confirmation bar’s high
          (bull) or low (bear). Invalidation is the pivot extreme plus a 0.25×
          ATR buffer. An untriggered setup expires after 6 bars; a triggered
          setup also expires after 6 further bars. If both an illustrative
          target and invalidation could have been hit in one candle,
          invalidation wins conservatively. The 2R level excludes fees, spread,
          slippage and execution delay. Signals are not backtested and no
          accuracy or win-rate claim is made. Check your exchange before
          trading; these levels are analytical references, not guaranteed
          outcomes.
        </p>
      </details>
      <div className="signal-events">
        <h3>Recent confirmed divergences</h3>
        {data?.events?.length ? (
          <div className="events-scroll">
            <table>
              <thead>
                <tr>
                  <th>Confirmed UTC</th>
                  <th>Direction</th>
                  <th>Price Δ</th>
                  <th>RSI Δ</th>
                  <th>Current outcome</th>
                </tr>
              </thead>
              <tbody>
                {[...data.events].reverse().map((e) => (
                  <tr key={`${e.confirmed}-${e.direction}`}>
                    <td>{date(e.confirmedAt)}</td>
                    <td
                      className={
                        e.direction === "bull" ? "positive" : "negative"
                      }
                    >
                      {e.direction.toUpperCase()}
                    </td>
                    <td>{e.priceMove.toFixed(3)}%</td>
                    <td>{e.rsiMove.toFixed(2)}</td>
                    <td>{e.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No qualifying divergence in the loaded window.</p>
        )}
      </div>
    </section>
  );
}
