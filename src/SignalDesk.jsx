import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import {
  Activity,
  ArrowUpRight,
  Info,
  RefreshCw,
  Check,
  Minus,
  ShieldCheck,
  ExternalLink,
  Pause,
  Play,
} from "lucide-react";
import {
  getFiveMinuteContext,
  getPerpetualContext,
  getJSON,
} from "./trading-data.js";
import {
  heikinAshi,
  assessSetup,
  positionReference,
} from "../shared/analysis.js";
import { DATA_ROOT } from "./market-intelligence.js";
import { EventRibbon } from "./ResearchBoard.jsx";
const money = (v) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: v < 1 ? 6 : 2,
        maximumFractionDigits: v < 1 ? 8 : 2,
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
function FiveMinuteChart({ data, kind, theme }) {
  const ref = useRef(null),
    handle = useRef(null);
  useEffect(() => {
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: theme === "light" ? "#ffffff" : "#10191e" },
        textColor: theme === "light" ? "#526575" : "#8c99a7",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: theme === "light" ? "#e5ebee" : "#242c35" },
      },
      rightPriceScale: { borderColor: "#303a44" },
      timeScale: { timeVisible: true, borderColor: "#303a44" },
    });
    const price = chart.addSeries(
      CandlestickSeries,
      {
        upColor: theme === "light" ? "#168c6b" : "#7ad9ab",
        downColor: theme === "light" ? "#cf5268" : "#e28d95",
        wickUpColor: theme === "light" ? "#168c6b" : "#7ad9ab",
        wickDownColor: theme === "light" ? "#cf5268" : "#e28d95",
        borderVisible: false,
      },
      0,
    );
    const rsi = chart.addSeries(
      LineSeries,
      {
        color: theme === "light" ? "#097c68" : "#66e0bf",
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
  }, [theme]);
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
    const last = data.candles.at(-1).close;
    const precision =
      last < 1 ? Math.min(8, Math.max(4, Math.ceil(-Math.log10(last)) + 3)) : 2;
    h.price.applyOptions({
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
    h.price.setData(
      kind === "heikin" ? heikinAshi(data.candles) : data.candles,
    );
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
  }, [data, kind, theme]);
  return (
    <div
      ref={ref}
      className="five-minute-chart"
      aria-label="Five-minute price candles and Wilder RSI chart"
    />
  );
}
export default function SignalDesk({
  mode,
  paused,
  onConnect,
  onTogglePause,
  theme,
  profileId,
  onProfile,
  symbol = "BTCUSDT",
  onSymbol,
  research,
}) {
  const [instrument, setInstrument] = useState("spot"),
    [kind, setKind] = useState("candles"),
    [results, setResults] = useState({}),
    [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now()),
    [retry, setRetry] = useState(0),
    [equity, setEquity] = useState(""),
    [validation, setValidation] = useState(null);
  const key = `${instrument}:${symbol}`;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    getJSON(`${DATA_ROOT}/validation.json`, c.signal)
      .then((d) => {
        if (Array.isArray(d.models)) setValidation(d);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (mode !== "live" || paused) return;
    let dead = false,
      timer;
    const c = new AbortController();
    async function update() {
      if (dead) return;
      if (document.hidden) {
        timer = setTimeout(update, 2000);
        return;
      }
      setLoading(true);
      const start = Date.now();
      let delay = 2000;
      try {
        const d = await (
          instrument === "spot" ? getFiveMinuteContext : getPerpetualContext
        )(symbol, c.signal);
        if (!dead) setResults((p) => ({ ...p, [key]: d }));
      } catch (e) {
        if (e.status === 429) delay = 60000;
        else delay = 5000;
        if (!dead)
          setResults((p) => ({
            ...p,
            [key]: {
              status: "unavailable",
              reason:
                e.status === 429
                  ? "Exchange rate limit · Signals suspended for 60s"
                  : e.message.includes("supported Hyperliquid")
                    ? "No supported perpetual for this coin · Signals suspended"
                    : "Cannot verify exchange candles · Signals suspended",
              candles: [],
              events: [],
            },
          }));
      }
      if (!dead) {
        setLoading(false);
        timer = setTimeout(
          update,
          Math.max(1000, delay - (Date.now() - start)),
        );
      }
    }
    update();
    return () => {
      dead = true;
      c.abort();
      clearTimeout(timer);
    };
  }, [mode, paused, retry, key]);
  const data = results[key],
    usable =
      mode === "live" &&
      !paused &&
      data?.status === "ready" &&
      now - data.receivedAt <= 8000;
  const active = usable ? data.active : null,
    early = usable ? data.early : null;
  const assessment = assessSetup(
    usable ? data : null,
    profileId,
    instrument,
    research,
    now,
  );
  const headline = !usable
    ? mode === "demo"
      ? "LIVE DATA REQUIRED"
      : paused
        ? "PAUSED"
        : data?.reason ||
          (data?.receivedAt && now - data.receivedAt > 8000
            ? "STALE DATA · SIGNALS SUSPENDED"
            : "CHECKING EXCHANGE DATA")
    : assessment.eligible
      ? `${instrument === "spot" ? "SPOT" : "PERP"} ${active.direction === "bull" ? "LONG" : "SHORT"} SETUP`
      : active?.direction === "bear" && instrument === "spot"
        ? "BEARISH · NO SPOT ENTRY"
        : active?.state === "triggered"
          ? "WAIT · FILTERS NOT MET"
          : active
            ? "CONFIRMED DIVERGENCE · WAIT"
            : early
              ? "EARLY DIVERGENCE · WATCH"
              : "WAIT · NO CONFIRMED SETUP";
  const model = validation?.models.find((m) => m.symbol === symbol),
    validationFresh = validation && now - validation.fetchedAt < 48 * 3600000;
  const position =
    assessment.eligible && equity
      ? positionReference(
          Number(equity),
          assessment.reference,
          assessment.stop,
          profileId,
        )
      : null;
  const coin = symbol.replace(/USDT$/, ""),
    displaySymbol = instrument === "perp" ? `${coin}-PERP` : symbol;
  return (
    <section className="signal-desk">
      <div className="desk-heading">
        <div>
          <div className="eyebrow">
            <Activity size={13} /> DIVERGENCE INTELLIGENCE
          </div>
          <h2>See the setup. Know the evidence.</h2>
          <p>Early warnings, confirmed signals and explicit reasons to wait.</p>
        </div>
        <div className="desk-controls">
          <button className="outline-button" onClick={onProfile}>
            <ShieldCheck size={14} />
            {assessment.profile.label}
          </button>
          <button
            className="icon-button"
            aria-label={paused ? "Resume analysis" : "Pause analysis"}
            title={paused ? "Resume analysis" : "Pause analysis"}
            onClick={onTogglePause}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            className="icon-button"
            aria-label="Verify feed"
            title="Verify feed"
            disabled={loading || paused || mode !== "live"}
            onClick={() => setRetry((v) => v + 1)}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>
      <div className="desk-market-toolbar">
        <div className="signal-market-tabs">
          {[...new Set(["BTCUSDT", "ETHUSDT", symbol])].map((s) => (
            <button
              key={s}
              onClick={() => onSymbol(s)}
              className={symbol === s ? "active" : ""}
            >
              <b>{s}</b>
              <small>
                {instrument === "spot" ? "SPOT RESEARCH" : "PERPETUAL RESEARCH"}
              </small>
            </button>
          ))}
        </div>
        <div
          className="segmented instrument-switch"
          aria-label="Analysis instrument"
        >
          <button
            className={instrument === "spot" ? "active" : ""}
            onClick={() => setInstrument("spot")}
          >
            Spot
          </button>
          <button
            className={instrument === "perp" ? "active" : ""}
            onClick={() => setInstrument("perp")}
          >
            Perpetual
          </button>
        </div>
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
            <div>
              <b>{displaySymbol} · 5m</b>
              <span>
                {instrument === "spot"
                  ? "Binance spot · USDT"
                  : "Hyperliquid perpetual · USD"}{" "}
                · RSI(14)
              </span>
            </div>
            <div className="segmented" aria-label="Signal chart style">
              <button
                className={kind === "candles" ? "active" : ""}
                onClick={() => setKind("candles")}
              >
                Candlesticks
              </button>
              <button
                className={kind === "heikin" ? "active" : ""}
                onClick={() => setKind("heikin")}
              >
                Heikin-Ashi
              </button>
            </div>
          </div>
          <FiveMinuteChart
            key={key}
            data={mode === "live" ? data : null}
            theme={theme}
            kind={kind}
          />
          <div className="signal-chart-foot">
            {kind === "heikin"
              ? "Heikin-Ashi is synthetic display only. All signals and levels use real OHLC. "
              : "Real exchange OHLC. "}
            Price candles + RSI indicator. Confirmation arrows appear 3 closed
            bars after the pivot. Chart times UTC.
          </div>
          <div className={`early-observation ${early ? "observed" : ""}`}>
            <span>01 / EARLY WATCH</span>
            <b>
              {early
                ? `${early.direction === "bull" ? "Bullish" : "Bearish"} divergence developing`
                : "No developing divergence"}
            </b>
            <p>
              {early
                ? `One right-hand bar has closed. Price ${early.priceMove.toFixed(3)}%, RSI ${early.rsiMove > 0 ? "+" : ""}${early.rsiMove.toFixed(2)} points. It can invalidate before confirmation; not an entry signal.`
                : "The early detector compares swings after one closed right-hand bar. It never bypasses confirmation or risk filters."}
            </p>
          </div>
        </div>
        <aside
          className={`signal-decision ${assessment.eligible ? active.direction : "neutral"}`}
          aria-live="polite"
        >
          <div className="eyebrow">02 / CONFIRMATION & ENTRY RESEARCH</div>
          <h3>{headline}</h3>
          <p>
            {assessment.eligible
              ? "The technical setup passes this profile’s observable filters. Reference levels are not executable quotes or a probability forecast."
              : active?.state === "triggered"
                ? "A breakout occurred, but the required context checks do not all pass. Review the evidence below."
                : active
                  ? "Wait for a closed breakout and all profile checks."
                  : early
                    ? "A developing pattern is visible. Earlier information comes with more false positives."
                    : "Fresh data and a qualifying confirmed pattern are required."}
          </p>
          <dl className="signal-metrics">
            <div>
              <dt>RSI(14) · closed bar</dt>
              <dd>
                {usable && Number.isFinite(data.rsi?.at(-1))
                  ? data.rsi.at(-1).toFixed(2)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Actual closed price</dt>
              <dd>{usable ? money(data.lastClose) : "—"}</dd>
            </div>
            <div>
              <dt>Current exchange bar price</dt>
              <dd>{usable ? money(data.currentCandle?.close) : "—"}</dd>
            </div>
            <div>
              <dt>Breakout threshold</dt>
              <dd>{active ? money(active.trigger) : "—"}</dd>
            </div>
            <div>
              <dt>Observed breakout close</dt>
              <dd>{active?.entry ? money(active.entry) : "Not triggered"}</dd>
            </div>
            <div>
              <dt>Invalidation reference</dt>
              <dd>{active ? money(active.stop) : "—"}</dd>
            </div>
            <div>
              <dt>{assessment.profile.targetR}R target reference</dt>
              <dd>
                {assessment.target ? money(assessment.target) : "After trigger"}
              </dd>
            </div>
          </dl>
          <div className="filter-evidence">
            <h4>
              {assessment.passed} / {assessment.checks.length} checks passed{" "}
              <span>Not a confidence score</span>
            </h4>
            {assessment.checks.map((c) => (
              <div key={c.name} className={c.pass ? "passed" : "pending"}>
                <span>
                  {c.pass ? <Check size={12} /> : <Minus size={12} />}
                </span>
                <p>
                  <b>{c.name}</b>
                  <small>{c.detail}</small>
                </p>
              </div>
            ))}
          </div>
          <div className="signal-timing">
            <span>Closed: {date(data?.lastCandleAt)}</span>
            <span>
              Check:{" "}
              {data?.receivedAt
                ? `${Math.max(0, Math.floor((now - data.receivedAt) / 1000))}s ago · request ${data.latency}ms`
                : "—"}
            </span>
            <span>2s target · only closed candles confirm setups</span>
          </div>
        </aside>
      </div>
      <div className="context-metrics">
        {[
          ["ATR(14)", usable ? money(data.atr) : "—", "5m volatility"],
          [
            "5m EMA20 / 50",
            usable ? `${money(data.ema20)} / ${money(data.ema50)}` : "—",
            "Raw closing prices",
          ],
          [
            "1h close / EMA20",
            usable && data.hourly
              ? `${money(data.hourly.close)} / ${money(data.hourly.ema20)}`
              : "—",
            "Complete UTC hourly bars",
          ],
          [
            "Relative volume",
            usable ? `${data.relativeVolume?.toFixed(2) || "—"}×` : "—",
            "vs prior 20 bars",
          ],
          [
            "Spread",
            usable && data.depth
              ? `${data.depth.spreadBps.toFixed(3)} bps`
              : "—",
            instrument === "spot"
              ? "Spot top of book"
              : "Perpetual top of book",
          ],
          [
            "Book imbalance",
            usable && data.depth ? `${data.depth.imbalance.toFixed(1)}%` : "—",
            "Top 20 levels · can be spoofed",
          ],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      {instrument === "perp" && (
        <div className="perp-context">
          <div>
            <span>Funding / hour</span>
            <b>
              {usable && data.derivatives
                ? `${data.derivatives.fundingHourly.toFixed(5)}%`
                : "Unavailable"}
            </b>
          </div>
          <div>
            <span>Open interest · USD at mark</span>
            <b>
              {usable && data.derivatives
                ? `$${data.derivatives.openInterestUSD.toLocaleString("en-US", { notation: "compact" })}`
                : "Unavailable"}
            </b>
          </div>
          <div>
            <span>Mark / oracle basis</span>
            <b>
              {usable && data.derivatives
                ? `${data.derivatives.basisPct.toFixed(4)}%`
                : "Unavailable"}
            </b>
          </div>
          <p>
            Hyperliquid venue data only. Positive funding generally means longs
            pay shorts; the rate can change. No leverage, liquidation-price or
            order recommendations. A bearish spot signal is never relabeled as a
            perpetual signal.
          </p>
        </div>
      )}
      <EventRibbon research={research} />
      <div className="research-bottom-grid">
        <section className="risk-reference">
          <div className="eyebrow">03 / RISK REFERENCE</div>
          <h3>Size the risk, not the conviction.</h3>
          <p>
            {assessment.profile.risk}% illustrative risk budget ·{" "}
            {assessment.profile.targetR}R target. No return is assured.
          </p>
          <label>
            Optional reference equity (USD)
            <input
              aria-label="Reference equity in USD"
              type="number"
              min="0"
              inputMode="decimal"
              value={equity}
              placeholder="e.g. 10000"
              onChange={(e) => setEquity(e.target.value)}
            />
          </label>
          {position ? (
            <dl>
              <div>
                <dt>Budget at stop distance</dt>
                <dd>${money(position.riskBudget)}</dd>
              </div>
              <div>
                <dt>Units · no leverage assumed</dt>
                <dd>
                  {position.units.toFixed(6)} {coin}
                </dd>
              </div>
              <div>
                <dt>Required notional</dt>
                <dd>${money(position.notional)}</dd>
              </div>
              {position.notional > Number(equity) && (
                <p className="negative">
                  Exceeds reference equity. Reduce size; the platform does not
                  suggest borrowing.
                </p>
              )}
            </dl>
          ) : (
            <p className="muted">
              Sizing appears only for a setup passing all filters and positive
              equity.
            </p>
          )}
          <small>
            Equity × risk budget ÷ stop distance. Fees, funding, gaps and
            slippage can increase loss. No orders are placed.
          </small>
        </section>
        <section className="validation-card">
          <div className="eyebrow">04 / MEASURED EVIDENCE</div>
          <h3>Historical baseline, openly reported.</h3>
          {instrument === "spot" &&
          validationFresh &&
          model?.status === "ok" ? (
            <>
              <p>
                {model.n} completed hypothetical trades · {date(model.from)} –{" "}
                {date(model.to)}
              </p>
              <div className="validation-stats">
                <span>
                  Net expectancy
                  <strong>
                    {model.expectancyR == null
                      ? "—"
                      : `${model.expectancyR.toFixed(2)}R`}
                  </strong>
                </span>
                <span>
                  Peak-to-trough loss
                  <strong>{model.maxDrawdownR.toFixed(2)}R</strong>
                </span>
                <span>
                  Winning trades
                  <strong>
                    {model.wins} / {model.n}
                  </strong>
                </span>
              </div>
              <b className="validation-note">
                {model.n < 30
                  ? "Too few trades for a useful accuracy estimate."
                  : "Historical frequency is not the probability of the next trade."}
              </b>
            </>
          ) : (
            <p className="validation-note">
              No fresh historical evaluation is available for this market and
              instrument. No accuracy percentage is invented.
            </p>
          )}
          <p>
            Fixed RSI rules, spot longs only, next-bar-open entry. 10 bps fees +
            5 bps slippage per side. Stop wins ambiguous bars; adverse gaps fill
            at open. Recent seven-day evaluation after warmup.
          </p>
          <small>
            Excludes profile, news and macro filters. This does not validate the
            full platform or establish a predictive edge.
          </small>
        </section>
      </div>
      {validationFresh && validation.correlations?.length > 0 && (
        <section className="correlation-panel">
          <h3>
            Bitcoin & global markets{" "}
            <span>Descriptive correlation, not causation</span>
          </h3>
          <div>
            {validation.correlations.map((c) => (
              <article key={c.symbol}>
                <span>{c.label}</span>
                <b>
                  {c.pearson == null ? "Unavailable" : c.pearson.toFixed(2)}
                </b>
                <small>
                  {c.n} matched return intervals
                  {c.to ? ` · through ${c.to}` : ""}
                </small>
              </article>
            ))}
          </div>
          <p>
            Pearson correlation of log returns over up to 60 common UTC
            calendar-date intervals. Session close times differ; daily data is
            delayed. No directional signal is inferred.
          </p>
        </section>
      )}
      <details className="signal-method">
        <summary>Calculation rules & limitations</summary>
        <p>
          Wilder RSI(14) on real five-minute closes. Confirmed pivots need 3
          neighbors on each side: a 15-minute delay. Early watch uses only 1
          right-hand bar and is explicitly provisional. Adjacent pivots must be
          5–60 bars apart. Regular bullish divergence requires price ≥0.05%
          lower, RSI ≥3 points higher and one RSI ≤40; bearish is mirrored with
          RSI ≥60.
        </p>
        <p>
          A subsequent closed candle must break the confirmation bar.
          Invalidation is the pivot extreme ±0.25 ATR. Watch setups expire after
          6 bars and triggered setups after another 6. Profile targets are
          mathematical distances, not price forecasts. Spread, volume, 5m/1h
          trend, current-bar invalidation, entry proximity within 0.5 ATR, an
          unreached profile target and a fresh covered-event calendar control
          eligibility. Unknown calendar coverage prevents a setup from passing.
          News is shown with provenance, not turned into a made-up sentiment
          score.
        </p>
        <p>
          The historical panel evaluates only the original fixed spot baseline.
          Profile-filtered signals are not backtested and no win-rate claim is
          made for them. Funding and risk sizing are informational. Sources can
          be wrong, revised, delayed or incomplete; SHARPNEX cannot guarantee
          error-free information or profitable entries.
        </p>
      </details>
      <div className="signal-events">
        <h3>Recent confirmed divergences</h3>
        {mode === "live" && data?.events?.length ? (
          <div className="events-scroll">
            <table>
              <thead>
                <tr>
                  <th>Confirmed UTC</th>
                  <th>Direction</th>
                  <th>Price Δ</th>
                  <th>RSI Δ</th>
                  <th>Baseline lifecycle · 2R</th>
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
          <p>No qualifying confirmed divergence in the loaded window.</p>
        )}
      </div>
    </section>
  );
}
