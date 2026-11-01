import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  Pause,
  Play,
  X,
  Check,
  Minus,
  ChevronRight,
  ExternalLink,
  SlidersHorizontal,
  Search,
  ShieldCheck,
} from "lucide-react";
import { priceLabel as price } from "./price-format.js";
import HuntChart from "./HuntChart.jsx";
import { scanMarket, huntQuote, SCAN_SYMBOLS } from "./hunt-data.js";
import {
  DISCOVERY_PROTOCOL as PROTOCOL,
  BASE_RULES,
  TIMEFRAMES,
  FAMILY_NAMES,
} from "../shared/hunt/strategies.js";
import MarketTape from "./MarketTape.jsx";
import { assessHunt } from "../shared/hunt/assessment.js";
import { profileFor, eventWindow } from "../shared/analysis.js";
import { getJSON } from "./trading-data.js";
import { DATA_ROOT } from "./market-intelligence.js";
const num = (v, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        maximumFractionDigits:
          Math.abs(v) > 0 && Math.abs(v) < 0.01 && d === 2 ? 6 : d,
        minimumFractionDigits: Math.abs(v) < 0.01 && d === 2 ? 0 : d,
      })
    : "—";
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—");
const stamp = (t) =>
  t
    ? new Date(t).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      })
    : "—";
function useReport() {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    let dead = false;
    (async () => {
      for (const url of [
        `${DATA_ROOT}/discovery-validation.json`,
        `${import.meta.env.BASE_URL}research/discovery-validation.json`,
      ])
        try {
          const d = await getJSON(url, c.signal);
          if (d.protocol === PROTOCOL && Array.isArray(d.models)) {
            if (!dead) setValue({ ...d, reportUrl: url });
            break;
          }
        } catch {}
    })();
    return () => {
      dead = true;
      c.abort();
    };
  }, []);
  return value;
}
function useFocusModal(ref, onClose) {
  useEffect(() => {
    const old = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = [
            ...ref.current.querySelectorAll("button,a[href],input,select"),
          ].filter((e) => !e.disabled),
          first = all[0],
          last = all.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, []);
}
function Evidence({ report, model, interval, venue }) {
  if (!model)
    return (
      <div className="hunt-empty small">
        <ShieldCheck size={22} />
        <b>No matched backtest</b>
        <span>
          Research only · {interval}{" "}
          {venue === "perp" ? "Hyperliquid" : "this asset"} has no validated
          historical result.
        </span>
      </div>
    );
  const s = model.test;
  return (
    <>
      <h3 className="evidence-family">
        {FAMILY_NAMES[model.family]} · {interval} · Binance {venue}
      </h3>
      <div className="hunt-note">
        <ShieldCheck size={16} />
        <span>
          {model.verdict === "positive-sample"
            ? "Positive historical sample · not a forecast"
            : "No demonstrated edge after costs"}
          {venue === "perp" ? " · Binance proxy, not Hyperliquid" : ""}
        </span>
      </div>
      <div className="hunt-stats">
        <span>
          Held-out trades<b>{s.trades}</b>
        </span>
        <span>
          Win rate<b>{pct(s.winRate)}</b>
        </span>
        <span>
          Net expectancy
          <b className={s.expectancyR > 0 ? "positive" : "negative"}>
            {num(s.expectancyR, 3)}R
          </b>
        </span>
        <span>
          Max drawdown<b>{num(s.maxDrawdownR)}R</b>
        </span>
      </div>
      <p className="muted">
        October 2026 holdout · 95% win-rate interval{" "}
        {s.winInterval
          ? `${pct(s.winInterval[0])}–${pct(s.winInterval[1])}`
          : "unavailable"}
        . Historical frequency, not next-trade probability.
      </p>
      <div className="hunt-facts">
        <span>
          2023–24 training
          <b>
            {model.train.trades} trades · {num(model.train.expectancyR, 3)}R
          </b>
        </span>
        <span>
          2025 validation
          <b>
            {model.validation.trades} trades ·{" "}
            {num(model.validation.expectancyR, 3)}R
          </b>
        </span>
        <span>
          Double-cost stress<b>{num(model.stress.expectancyR, 3)}R / trade</b>
        </span>
        <span>
          Rule selection
          <b>
            {model.selectionAdequate
              ? "8 candidates / family"
              : "Insufficient sample · fixed default"}
          </b>
        </span>
        <span>
          Training / development bars
          <b>
            {model.rows.toLocaleString()} · {model.missingDays?.length || 0}{" "}
            missing holdout day(s)
          </b>
        </span>
      </div>
      <details>
        <summary>Method & limits</summary>
        <p>
          {model.family === "divergence"
            ? "Wilder RSI(14) divergence with confirmed pivots and a subsequent closed breakout."
            : model.family === "pullback"
              ? "EMA20/50 trend alignment, a pullback to EMA20, a closed reclaim and at least a two-point RSI recovery."
              : "A closed break of the previous 20-bar range, EMA20/50 trend alignment, volume and at least 50% candle body."}{" "}
          Relative-volume threshold {model.rule.volume}×; target{" "}
          {model.rule.targetR}R. Entries use the next bar's open, within 0.5
          ATR. Stops and targets stay fixed; stops win ambiguous candles. The
          time limit is{" "}
          {Math.max(
            2,
            Math.min(10, Math.ceil(30 / Number(interval.slice(0, -1)))),
          )}{" "}
          bars. Top three training rules compete on 2025 validation only.
          October does not select the rule.
        </p>
        <p>
          Costs per side: {report.costs[venue].feeBps} bps fee +{" "}
          {report.costs[venue].slippageBps} bps slippage +{" "}
          {report.costs[venue].halfSpreadBps} bps half-spread. Perpetual funding
          reserve: {report.costs[venue].fundingBps} bps per trade. Actual fills,
          gaps and fees can be worse.
        </p>
        {report.limitations.map((s) => (
          <p key={s}>{s}</p>
        ))}
        <a href={report.reportUrl} target="_blank" rel="noreferrer">
          Full report & archive checksums <ExternalLink size={12} />
        </a>
      </details>
    </>
  );
}
function HuntModal({
  snapshot,
  current,
  quote,
  report,
  research,
  profileId,
  now,
  paused,
  onClose,
}) {
  const ref = useRef(null),
    [tab, setTab] = useState("Plan"),
    [equity, setEquity] = useState("");
  useFocusModal(ref, onClose);
  const sameCandidate =
    !snapshot.candidate ||
    (current?.candidate?.confirmedAt === snapshot.candidate.confirmedAt &&
      current?.candidate?.direction === snapshot.candidate.direction &&
      current?.candidate?.family === snapshot.candidate.family);
  const data =
    current && sameCandidate ? current : { ...snapshot, status: "stale" };
  const model = report?.models.find(
      (m) =>
        m.symbol === data.symbol &&
        m.venue === data.venue &&
        m.interval === data.interval &&
        m.family === (data.candidate?.family || "divergence"),
    ),
    a = assessHunt(data, quote, research, profileId, model, now, paused),
    c = data.candidate,
    p = a.plan,
    profile = profileFor(profileId);
  const changed = !!snapshot.candidate && current && !sameCandidate;
  const eligible = a.eligible && !changed,
    budget = Number(equity) > 0 ? (Number(equity) * profile.risk) / 100 : null,
    units = budget && p?.risk > 0 ? budget / p.risk : null;
  const cost = report?.costs?.[data.venue];
  return (
    <div
      className="modal-backdrop hunt-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="hunt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hunt-title"
        ref={ref}
        tabIndex={-1}
      >
        <header>
          <div className="hunt-symbol">
            <span
              className={`hunt-direction ${c?.direction === -1 ? "negative" : "positive"}`}
            >
              {c?.direction === -1 ? <ArrowDownRight /> : <Crosshair />}
            </span>
            <div>
              <h2 id="hunt-title">
                {data.symbol.replace("USDT", "")}{" "}
                <small>
                  {data.venue === "spot" ? "USDT · Spot" : "USD · Perpetual"}
                </small>
              </h2>
              <span>
                {data.interval} · {FAMILY_NAMES[c?.family] || "Combined hunt"}
              </span>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Close hunt details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="hunt-modal-status">
          <b className={eligible ? "positive" : "muted"}>
            {changed ? "Expired" : a.stage}
          </b>
          <span>
            {c
              ? `${c.direction === 1 ? "Long" : "Short"} · ${Math.max(0, Math.ceil((c.expiresAt - now) / 1000))}s left`
              : "Waiting for a new setup"}
          </span>
        </div>
        <div className="hunt-tabs" role="tablist" aria-label="Hunt details">
          {["Plan", "Evidence", "Sources"].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="hunt-modal-body" role="tabpanel">
          {tab === "Plan" && (
            <>
              {p ? (
                <>
                  <div className="hunt-plan-grid">
                    <span>
                      {c.stage === "watch"
                        ? "Breakout level"
                        : "Reference entry"}
                      <b>{price(c.entry)}</b>
                      <small>
                        {c.stage === "watch"
                          ? "Wait for candle close"
                          : "Do not chase beyond 0.5 ATR"}
                      </small>
                    </span>
                    <span>
                      Stop reference<b className="negative">{price(p.stop)}</b>
                      <small>Not a guaranteed fill</small>
                    </span>
                    <span>
                      Target reference
                      <b className="positive">{price(p.target)}</b>
                      <small>{data.rule.targetR}R gross</small>
                    </span>
                    <span>
                      Net reward / risk<b>{num(p.netR)}R</b>
                      <small>Includes assumed costs</small>
                    </span>
                  </div>
                  <div className="hunt-facts">
                    <span>
                      Executable-side quote
                      <b>
                        {price(c.direction === 1 ? quote?.ask : quote?.bid)}
                      </b>
                    </span>
                    <span>
                      Entry distance
                      <b>
                        {quote
                          ? `${num(Math.abs(quote.price - c.entry) / c.atr)} ATR`
                          : "—"}
                      </b>
                    </span>
                    <span>
                      Round-trip cost estimate<b>{price(p.cost)} / unit</b>
                    </span>
                    <span>
                      Expiry<b>{stamp(c.expiresAt)}</b>
                    </span>
                  </div>
                </>
              ) : (
                <div className="hunt-empty small">
                  <Crosshair />
                  <b>No active setup</b>
                  <span>Waiting for a confirmed setup.</span>
                </div>
              )}
              <details open={!c}>
                <summary>
                  Entry checks{" "}
                  <span>
                    {a.checks.filter((c) => c.ok).length}/{a.checks.length}
                  </span>
                </summary>
                <div className="hunt-checks">
                  {a.checks.map((x) => (
                    <span key={x.label} className={x.ok ? "positive" : "muted"}>
                      {x.ok ? <Check size={13} /> : <Minus size={13} />}{" "}
                      {x.label}
                    </span>
                  ))}
                </div>
              </details>
              {p && (
                <details>
                  <summary>Risk sizing</summary>
                  <label className="hunt-equity">
                    Equity (USD)
                    <input
                      aria-label="Equity in USD"
                      type="number"
                      min="0"
                      placeholder="e.g. 1000"
                      value={equity}
                      onChange={(e) => setEquity(e.target.value)}
                    />
                  </label>
                  <div className="hunt-facts">
                    <span>
                      Risk budget · {profile.risk}%
                      <b>{budget ? `$${num(budget)}` : "—"}</b>
                    </span>
                    <span>
                      Illustrative units<b>{units ? num(units, 6) : "—"}</b>
                    </span>
                    <span>
                      Notional<b>{units ? `$${num(units * p.entry)}` : "—"}</b>
                    </span>
                  </div>
                  <p>
                    Position sizing includes estimated costs. Venue size limits,
                    leverage, available margin and liquidation are not modeled.
                  </p>
                </details>
              )}
              <p className="hunt-footnote">
                Conditional research levels · no orders.{" "}
                {eligible
                  ? "Historical results do not guarantee the next outcome."
                  : "Conditional research · not an execution instruction."}
              </p>
            </>
          )}
          {tab === "Evidence" && (
            <Evidence
              report={report}
              model={model}
              interval={data.interval}
              venue={data.venue}
            />
          )}
          {tab === "Sources" && (
            <>
              <div className="hunt-facts">
                <span>
                  Market venue
                  <b>
                    {data.venue === "spot"
                      ? "Binance spot"
                      : "Hyperliquid perpetual"}
                  </b>
                </span>
                <span>
                  Quote timestamp<b>{stamp(quote?.asOf)}</b>
                </span>
                <span>
                  Candles fetched<b>{stamp(data.receivedAt)}</b>
                </span>
                <span>
                  Last closed candle<b>{stamp(data.lastCloseAt)}</b>
                </span>
                <span>
                  Spread<b>{num(quote?.spreadBps)} bps</b>
                </span>
                <span>
                  Relative volume<b>{num(data.relativeVolume)}×</b>
                </span>
                {data.derivatives && (
                  <>
                    <span>
                      Hourly funding
                      <b>{num(data.derivatives.fundingHourly, 5)}%</b>
                    </span>
                    <span>
                      Open interest
                      <b>${num(data.derivatives.openInterestUSD, 0)}</b>
                    </span>
                    <span>
                      Mark / oracle basis
                      <b>{num(data.derivatives.basisPct, 4)}%</b>
                    </span>
                  </>
                )}
              </div>
              <p>
                Quotes target 1s; candle scans run 10s after completion for spot
                and 20s for perpetuals. Provider latency and limits can delay
                updates. Signals use completed raw candles; Heikin-Ashi only
                changes the display.
              </p>
              <p>
                Cost assumptions:{" "}
                {cost
                  ? `${cost.feeBps} bps fees + ${cost.slippageBps} bps slippage per side`
                  : "see evidence report"}
                ; live spread replaces the backtest spread. These are estimates,
                not account-specific fees.
              </p>
              <details open>
                <summary>Scheduled event risk</summary>
                <p>
                  {a.calendar.fresh
                    ? a.calendar.events.length > 0
                      ? "Event window · entries blocked"
                      : "Outside the checked event windows"
                    : "Calendar unavailable or stale · entries blocked"}
                </p>
                {(research?.events || [])
                  .filter((e) => (e.at || Date.parse(e.date) + 86400000) > now)
                  .slice(0, 3)
                  .map((e) => (
                    <a
                      className="hunt-source"
                      key={e.id}
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {e.title}
                      <small>
                        {e.at ? stamp(e.at) : e.date} · {e.source}
                      </small>
                    </a>
                  ))}
                <p>
                  Calendars and news coverage are partial. Unscheduled
                  announcements, conflicts and scams are not predictable from
                  candle data.
                </p>
              </details>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
export default function HuntDesk({
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
  feed,
}) {
  const [venue, setVenue] = useState("spot"),
    [interval, setIntervalValue] = useState("1m"),
    [scope, setScope] = useState("all"),
    [tickBar, setTickBar] = useState(null),
    [family, setFamily] = useState("blend"),
    [kind, setKind] = useState("candles"),
    [results, setResults] = useState({}),
    [quote, setQuote] = useState(null),
    [now, setNow] = useState(Date.now()),
    [modal, setModal] = useState(null),
    [onlySetups, setOnlySetups] = useState(false),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState({});
  const report = useReport();
  const liquid = (feed?.rows || [])
    .filter(
      (r) =>
        ![
          "USDC",
          "USDE",
          "USD1",
          "FDUSD",
          "TUSD",
          "DAI",
          "USDP",
          "USDD",
          "AEUR",
          "EURI",
        ].includes(r.symbol),
    )
    .slice(0, 24)
    .map((r) => r.id);
  const universeKey = (
    venue === "spot" && liquid.length ? liquid : SCAN_SYMBOLS
  ).join("|");
  const names = useMemo(
    () =>
      [symbol, ...universeKey.split("|").filter((s) => s !== symbol)].slice(
        0,
        venue === "spot" ? 24 : 8,
      ),
    [symbol, universeKey, venue],
  );
  const key = `${venue}:${interval}:${symbol}`;
  const modelFor = (s, tf, f) =>
    report?.models.find(
      (m) =>
        m.symbol === s &&
        m.venue === venue &&
        m.interval === tf &&
        m.family === f,
    );
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (mode !== "live" || paused) return;
    const controller = new AbortController();
    let dead = false,
      timer;
    async function update() {
      let rateLimited = false;
      if (!document.hidden) {
        setBusy(true);
        let cursor = 0;
        await Promise.all(
          [0, 1].map(async () => {
            while (
              cursor < names.length &&
              !dead &&
              !rateLimited &&
              !document.hidden
            ) {
              const s = names[cursor++],
                intervals = scope === "all" ? TIMEFRAMES : [scope];
              try {
                for (const tf of intervals) {
                  const k = `${venue}:${tf}:${s}`;
                  const rules = Object.fromEntries(
                    Object.keys(BASE_RULES).map((f) => [
                      f,
                      modelFor(s, tf, f)?.rule || BASE_RULES[f],
                    ]),
                  );
                  const d = await scanMarket(
                    s,
                    venue,
                    tf,
                    rules,
                    controller.signal,
                    family,
                  );
                  if (!dead) {
                    setResults((p) => ({ ...p, [k]: d }));
                    setErrors((p) => ({ ...p, [k]: null }));
                  }
                }
              } catch (e) {
                if (e.status === 429) rateLimited = true;
                if (!dead) {
                  for (const tf of intervals) {
                    const k = `${venue}:${tf}:${s}`;
                    setErrors((p) => ({ ...p, [k]: e.message }));
                    setResults((p) => ({ ...p, [k]: null }));
                  }
                }
              }
            }
          }),
        );
        if (!dead) setBusy(false);
      }
      if (!dead)
        timer = setTimeout(
          update,
          rateLimited ? 60000 : venue === "spot" ? 10000 : 20000,
        );
    }
    update();
    return () => {
      dead = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [mode, paused, venue, scope, family, names, report]);
  useEffect(() => {
    setQuote(null);
    if (mode !== "live" || paused) return;
    const c = new AbortController();
    let dead = false,
      timer;
    async function update() {
      let delay = 1000;
      if (!document.hidden) {
        const start = Date.now();
        try {
          const q = await huntQuote(symbol, venue, c.signal);
          if (!dead) setQuote(q);
        } catch (e) {
          if (!dead) setQuote(null);
          if (e.status === 429) delay = 60000;
        }
        delay = Math.max(100, delay - (Date.now() - start));
      }
      if (!dead) timer = setTimeout(update, delay);
    }
    update();
    return () => {
      dead = true;
      c.abort();
      clearTimeout(timer);
    };
  }, [mode, paused, symbol, venue]);
  const onPrint = useCallback(
    (t) => {
      const bucket =
        Math.floor(t.time / (Number(interval.slice(0, -1)) * 60000)) *
        Number(interval.slice(0, -1)) *
        60;
      setTickBar((old) =>
        old?.key === key && old.id === t.id
          ? old
          : old?.key === key && old.time === bucket
            ? {
                ...old,
                id: t.id,
                high: Math.max(old.high, t.price),
                low: Math.min(old.low, t.price),
                close: t.price,
              }
            : {
                key,
                id: t.id,
                time: bucket,
                high: t.price,
                low: t.price,
                close: t.price,
              },
      );
    },
    [key, interval],
  );
  const stored = results[key],
    forming = stored?.currentCandle;
  const data =
      stored && forming && tickBar?.key === key && tickBar.time === forming.time
        ? {
            ...stored,
            currentCandle: {
              ...forming,
              high: Math.max(forming.high, tickBar.high),
              low: Math.min(forming.low, tickBar.low),
              close: tickBar.close,
            },
          }
        : stored,
    model = report?.models.find(
      (m) =>
        m.symbol === symbol &&
        m.venue === venue &&
        m.interval === interval &&
        m.family === (data?.candidate?.family || "divergence"),
    ),
    assessment = assessHunt(
      data,
      quote,
      research,
      profileId,
      model,
      now,
      paused || mode !== "live",
    );
  const rows = names
    .flatMap((s) =>
      (scope === "all" ? TIMEFRAMES : [scope]).map((tf) => ({
        symbol: s,
        interval: tf,
        data: results[`${venue}:${tf}:${s}`],
        error: errors[`${venue}:${tf}:${s}`],
      })),
    )
    .map((r) => ({
      ...r,
      active:
        !paused &&
        mode === "live" &&
        r.data?.candidate &&
        r.data.candidate.netR >= 1 &&
        r.data.status === "ready" &&
        now - r.data.receivedAt < 45000 &&
        now < r.data.candidate.expiresAt,
    }))
    .sort(
      (a, b) =>
        Number(!!b.active) - Number(!!a.active) ||
        (b.data?.candidate?.netR || -100) - (a.data?.candidate?.netR || -100),
    );
  const visible = onlySetups
      ? rows.filter((r) => r.active)
      : scope === "all"
        ? [
            ...rows.filter((r) => r.active),
            ...rows.filter((r) => !r.active && r.interval === interval),
          ]
        : rows,
    active = rows.filter((r) => r.active).length,
    fresh = rows.filter(
      (r) =>
        r.data?.status === "ready" &&
        now - r.data.receivedAt < 45000 &&
        !paused,
    ).length,
    calendar = eventWindow(research, now);
  const chartData = data
    ? {
        ...data,
        candles:
          data.currentCandle &&
          data.currentCandle.time > data.candles.at(-1)?.time
            ? [...data.candles, data.currentCandle]
            : data.candles,
      }
    : null;
  function inspect(d) {
    if (d) {
      onSymbol(d.symbol);
      setIntervalValue(d.interval);
      setModal(d);
    }
  }
  return (
    <section className="hunt-desk">
      <div className="hunt-toolbar">
        <div className="hunt-title">
          <Crosshair size={18} />
          <h1>Trade hunt</h1>
          <span className="hunt-live">
            <i className={!paused && fresh ? "on" : ""} />
            {paused
              ? "Paused"
              : busy
                ? "Scanning"
                : `${fresh}/${names.length * (scope === "all" ? 14 : 1)} fresh`}
          </span>
        </div>
        <div className="hunt-controls">
          <div className="hunt-segment" aria-label="Analysis timeframe">
            {["1m", "3m", "5m"].map((v) => (
              <button
                key={v}
                aria-pressed={scope === v}
                className={scope === v ? "active" : ""}
                onClick={() => {
                  setIntervalValue(v);
                  setScope(v);
                  setModal(null);
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <select
            className="hunt-select"
            aria-label="More timeframes"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              if (e.target.value !== "all") setIntervalValue(e.target.value);
              setModal(null);
            }}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="all">All &lt;15m</option>
          </select>
          <select
            className="hunt-select"
            aria-label="Strategy family"
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setModal(null);
            }}
          >
            <option value="blend">Combined hunt</option>
            {Object.entries(FAMILY_NAMES).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <div className="hunt-segment" aria-label="Market type">
            {["spot", "perp"].map((v) => (
              <button
                key={v}
                aria-pressed={venue === v}
                className={venue === v ? "active" : ""}
                onClick={() => {
                  setVenue(v);
                  setModal(null);
                }}
              >
                {v === "spot" ? "Spot" : "Perpetual"}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            onClick={onProfile}
            title="Trader profile"
            aria-label="Hunt filters"
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="icon-button"
            onClick={onTogglePause}
            aria-label={paused ? "Resume hunt" : "Pause hunt"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      </div>
      {mode !== "live" && (
        <div className="hunt-note">
          Live data required for trade discovery.
          <button onClick={onConnect}>Connect live</button>
        </div>
      )}
      <div className="hunt-workspace">
        <aside className="hunt-list">
          <div className="hunt-list-title">
            <b>
              Watch queue <span>{active}</span>
            </b>
            <button
              aria-label="Show active setups only"
              aria-pressed={onlySetups}
              className={onlySetups ? "active" : ""}
              onClick={() => setOnlySetups((v) => !v)}
            >
              <Search size={14} />
            </button>
          </div>
          <div className="hunt-queue">
            {visible.map((r) => {
              const c = r.active ? r.data.candidate : null;
              return (
                <button
                  key={`${r.symbol}:${r.interval}`}
                  aria-label={`Hunt ${r.symbol} ${r.interval}`}
                  className={`hunt-row ${symbol === r.symbol ? "selected" : ""}`}
                  onClick={() => {
                    onSymbol(r.symbol);
                    if (r.data) inspect(r.data);
                  }}
                >
                  <span className="hunt-row-main">
                    <b>
                      {r.symbol.replace("USDT", "")} <em>{r.interval}</em>
                    </b>
                    <small
                      className={
                        c?.direction === 1
                          ? "positive"
                          : c?.direction === -1
                            ? "negative"
                            : ""
                      }
                    >
                      {c
                        ? `${c.direction === 1 ? "Long" : "Short"} · ${c.stage === "triggered" ? FAMILY_NAMES[c.family] : "Divergence watch"}`
                        : r.error
                          ? "Unavailable"
                          : paused
                            ? "Paused"
                            : r.data?.status === "ready" &&
                                now - r.data.receivedAt < 45000
                              ? "No setup"
                              : "Waiting"}
                    </small>
                  </span>
                  <span className="hunt-row-right">
                    <b>{c ? `${num(c.netR)}R` : price(r.data?.price)}</b>
                    <small>
                      {c ? "net · est." : venue === "spot" ? "USDT" : "USD"}
                    </small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              );
            })}
            {!visible.length && (
              <div className="hunt-empty small">
                <Crosshair size={24} />
                <b>No active setups</b>
                <span>Scanning for the next divergence.</span>
              </div>
            )}
          </div>
          <div className="hunt-queue-foot">
            {names.length} pairs · scans ~{venue === "spot" ? 10 : 20}s
            <br />
            Quotes 1s · completed-bar signals
          </div>
        </aside>
        <div className="hunt-chart-panel">
          <div className="hunt-chart-heading">
            <div>
              <h2>
                {venue === "spot"
                  ? symbol
                  : `${symbol.replace("USDT", "")}-PERP`}{" "}
                <span>{interval}</span>
              </h2>
              <span className="hunt-price">
                {price(
                  quote?.symbol === symbol && quote?.venue === venue
                    ? quote.price
                    : data?.price,
                )}{" "}
                <small>
                  {data?.rsiNow != null
                    ? `RSI ${num(data.rsiNow, 1)}`
                    : "RSI —"}
                </small>
              </span>
            </div>
            <div className="hunt-segment">
              {["candles", "heikin"].map((v) => (
                <button
                  key={v}
                  className={kind === v ? "active" : ""}
                  onClick={() => setKind(v)}
                >
                  {v === "candles" ? "Candles" : "Heikin-Ashi"}
                </button>
              ))}
            </div>
          </div>
          <div className="hunt-chart-wrap">
            <HuntChart data={chartData} kind={kind} theme={theme} />
            {!data && (
              <div className="hunt-chart-overlay">
                {errors[key] || "Connecting to candle feed…"}
              </div>
            )}
          </div>
          <div className="hunt-chart-bottom">
            <span>
              {venue === "spot" ? "Binance spot" : "Hyperliquid perpetual"} ·{" "}
              {kind === "heikin" ? "HA synthetic display" : "Raw OHLC"} ·{" "}
              {quote && now - quote.receivedAt < 8000 && !paused
                ? "quote fresh"
                : "quote stale"}
            </span>
            <button
              className="hunt-inspect"
              onClick={() => inspect(data)}
              disabled={!data}
            >
              Inspect setup <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="hunt-opportunity">
            <div>
              <span className={assessment.eligible ? "positive" : "muted"}>
                {assessment.stage}
              </span>
              <b>
                {data?.candidate
                  ? `${data.candidate.direction === 1 ? "Long" : "Short"} · ${FAMILY_NAMES[data.candidate.family]}`
                  : "Waiting for the next setup"}
              </b>
            </div>
            <span>
              {data?.candidate
                ? `${num(assessment.plan?.netR)}R net`
                : "No entry call"}
            </span>
          </div>
          <MarketTape
            symbol={symbol}
            venue={venue}
            enabled={mode === "live" && !paused}
            onPrint={onPrint}
          />
        </div>
      </div>
      <div className="hunt-statusbar">
        <span>
          <i
            className={
              calendar.fresh && calendar.events.length === 0 ? "on" : ""
            }
          />
          {!calendar.fresh
            ? "Calendar stale"
            : calendar.events.length > 0
              ? "Event window · blocked"
              : "Calendar checked"}
        </span>
        <button
          onClick={() => {
            if (data) {
              inspect(data);
            }
          }}
          disabled={!data}
        >
          <ShieldCheck size={12} />
          {!model
            ? "Unvalidated asset"
            : model.verdict === "positive-sample"
              ? "Historical sample available"
              : "No demonstrated edge"}
        </button>
        <span>
          {profileFor(profileId).risk}% risk preference · research only
        </span>
      </div>
      {modal && (
        <HuntModal
          snapshot={modal}
          current={
            modal.venue === venue &&
            modal.interval === interval &&
            modal.symbol === symbol
              ? data
              : results[`${modal.venue}:${modal.interval}:${modal.symbol}`]
          }
          quote={
            quote?.symbol === modal.symbol && quote.venue === modal.venue
              ? quote
              : null
          }
          report={report}
          research={research}
          profileId={profileId}
          now={now}
          paused={paused}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
