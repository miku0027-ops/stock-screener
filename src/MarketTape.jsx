import React, { useEffect, useState, useRef } from "react";
import { getJSON, hyperJSON } from "./trading-data.js";
import { priceLabel } from "./price-format.js";
export default function MarketTape({ symbol, venue, enabled, onPrint }) {
  const notifyRef = useRef(onPrint);
  notifyRef.current = onPrint;
  const [state, setState] = useState({ rows: [], fresh: false });
  useEffect(() => {
    setState({ rows: [], fresh: false });
    if (!enabled) return;
    const c = new AbortController(),
      trades = new Map();
    let socket,
      dead = false,
      last = 0,
      retry,
      timer;
    function add(rows) {
      for (const r of rows) {
        const t =
          venue === "spot"
            ? { id: r.a, price: +r.p, size: +r.q, time: +r.T, buy: !r.m }
            : {
                id: r.tid,
                price: +r.px,
                size: +r.sz,
                time: +r.time,
                buy: r.side === "B",
              };
        if (
          t.id != null &&
          [t.price, t.size, t.time].every(Number.isFinite) &&
          t.price > 0 &&
          t.size > 0 &&
          Date.now() - t.time < 120000 &&
          t.time <= Date.now() + 1000
        ) {
          trades.set(t.id, t);
          last = Date.now();
        }
      }
      if (trades.size > 150) {
        const latest = [...trades.values()]
          .sort((a, b) => b.time - a.time)
          .slice(0, 80);
        trades.clear();
        for (const t of latest) trades.set(t.id, t);
      }
    }
    async function seed() {
      if (dead || document.hidden) return;
      try {
        const rows =
          venue === "spot"
            ? await getJSON(
                `https://data-api.binance.vision/api/v3/aggTrades?symbol=${symbol}&limit=20`,
                c.signal,
              )
            : await hyperJSON(
                { type: "recentTrades", coin: symbol.replace(/USDT$/, "") },
                c.signal,
              );
        if (Array.isArray(rows)) add(rows);
      } catch {}
      if (!dead)
        timer = setTimeout(
          seed,
          socket?.readyState === 1 && Date.now() - last < 10000 ? 30000 : 5000,
        );
    }
    function connect() {
      if (
        dead ||
        document.hidden ||
        socket?.readyState === 0 ||
        socket?.readyState === 1
      )
        return;
      try {
        socket = new WebSocket(
          venue === "spot"
            ? `wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@aggTrade`
            : "wss://api.hyperliquid.xyz/ws",
        );
        const owned = socket;
        socket.onopen = () => {
          if (venue === "perp")
            socket.send(
              JSON.stringify({
                method: "subscribe",
                subscription: {
                  type: "trades",
                  coin: symbol.replace(/USDT$/, ""),
                },
              }),
            );
        };
        socket.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (venue === "spot" && d.e === "aggTrade") add([d]);
            else if (
              venue === "perp" &&
              d.channel === "trades" &&
              Array.isArray(d.data)
            )
              add(d.data);
          } catch {}
        };
        socket.onerror = () => owned.close();
        socket.onclose = () => {
          if (socket !== owned) return;
          if (!dead && !document.hidden) retry = setTimeout(connect, 5000);
        };
      } catch {
        retry = setTimeout(connect, 10000);
      }
    }
    const visibility = () => {
      clearTimeout(retry);
      clearTimeout(timer);
      if (document.hidden) socket?.close();
      else {
        seed();
        connect();
      }
    };
    connect();
    seed();
    document.addEventListener("visibilitychange", visibility);
    const tick = setInterval(() => {
      if (dead) return;
      const rows = [...trades.values()]
          .sort((a, b) => b.time - a.time)
          .slice(0, 8),
        fresh =
          !document.hidden &&
          Date.now() - last < 15000 &&
          Date.now() - (rows[0]?.time || 0) < 15000;
      setState({ rows, fresh });
      if (fresh && rows[0]) notifyRef.current?.(rows[0]);
    }, 1000);
    return () => {
      dead = true;
      c.abort();
      socket?.close();
      clearTimeout(retry);
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [symbol, venue, enabled]);
  return (
    <div className="market-tape" aria-label="Live market prints">
      <span>
        <b>Market prints</b>
        <small>
          {!enabled
            ? "Paused"
            : state.fresh
              ? "Live executions"
              : "Waiting / stale"}
        </small>
      </span>
      <div>
        {state.rows.length ? (
          state.rows.map((t) => (
            <span
              key={t.id}
              className={t.buy ? "positive" : "negative"}
              title={`${t.buy ? "Buyer" : "Seller"} initiated · ${t.size} units · ${new Date(t.time).toLocaleTimeString()}`}
            >
              <b>
                {t.buy ? "↗" : "↘"} {priceLabel(t.price)}
              </b>
              <small>{new Date(t.time).toLocaleTimeString("en-GB")}</small>
            </span>
          ))
        ) : (
          <small>Waiting for provider-reported trades</small>
        )}
      </div>
    </div>
  );
}
