import { useEffect, useState } from "react";
import { getJSON } from "./trading-data.js";
import { normalizeTicker, mergeTicker } from "../shared/live-quotes.js";
export const MARKET_STREAM =
  "wss://data-stream.binance.vision/ws/!miniTicker@arr";
const BASE = "https://data-api.binance.vision/api/v3";
export function useCryptoFeed(enabled) {
  const [state, setState] = useState({
    rows: [],
    status: "connecting",
    transport: null,
    receivedAt: 0,
  });
  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, status: "paused" }));
      return;
    }
    let dead = false,
      socket,
      retryTimer,
      seedTimer,
      lastPacket = 0,
      openedAt = 0,
      lastSnapshot = 0,
      retries = 0,
      restBusy = false,
      status = "connecting",
      transport = null;
    const abort = new AbortController(),
      quotes = new Map(),
      universe = new Map();
    function publish() {
      if (dead) return;
      const active = Date.now() - lastPacket < 6000 && socket?.readyState === 1;
      status = document.hidden
        ? "paused"
        : active
          ? "stream"
          : Date.now() - lastSnapshot < 15000
            ? "fallback"
            : "stale";
      const rows = [...universe.values()].flatMap((m) => {
        const q = quotes.get(m.id);
        return q
          ? [
              {
                ...m,
                ...q,
                flash: Date.now() - q.flashAt < 1100 ? q.flash : null,
              },
            ]
          : [
              {
                ...m,
                price: null,
                change: null,
                volume: 0,
                asOf: null,
                flash: null,
              },
            ];
      });
      // Stable order during ticks; refresh ranking with REST snapshots, not on every price change.
      rows.sort((a, b) => a.rank - b.rank);
      setState({
        rows,
        status,
        transport: active ? "WebSocket" : transport,
        receivedAt: Math.max(lastPacket, lastSnapshot),
      });
    }
    function apply(raw) {
      const now = Date.now();
      for (const r of raw) {
        const q = normalizeTicker(r, now);
        if (q && universe.has(q.id))
          quotes.set(q.id, mergeTicker(quotes.get(q.id), q, now));
      }
    }
    async function seed() {
      if (dead || document.hidden || restBusy) return;
      restBusy = true;
      let delay = 60000;
      try {
        if (!universe.size) {
          const info = await getJSON(
            `${BASE}/exchangeInfo?permissions=SPOT`,
            abort.signal,
          );
          if (!Array.isArray(info.symbols)) throw Error("Universe unavailable");
          for (const m of info.symbols)
            if (
              m.status === "TRADING" &&
              m.quoteAsset === "USDT" &&
              m.isSpotTradingAllowed !== false &&
              /^[A-Z0-9]{2,20}USDT$/.test(m.symbol)
            )
              universe.set(m.symbol, {
                id: m.symbol,
                symbol: m.baseAsset,
                name: m.baseAsset,
                rank: universe.size,
              });
        }
        const rows = await getJSON(
          `${BASE}/ticker/24hr?type=MINI`,
          abort.signal,
        );
        if (!Array.isArray(rows)) throw Error("Invalid ticker snapshot");
        apply(rows);
        lastSnapshot = Date.now();
        [...quotes.values()]
          .sort((a, b) => b.volume - a.volume)
          .forEach((q, i) => {
            if (universe.has(q.id)) universe.get(q.id).rank = i;
          });
        if (Date.now() - lastPacket > 6000) {
          transport = "REST · 5s fallback";
          delay = 5000;
        }
        publish();
      } catch (e) {
        delay = e.status === 429 ? 60000 : 10000;
      } finally {
        restBusy = false;
        if (!dead) seedTimer = setTimeout(seed, delay);
      }
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
        socket = new WebSocket(MARKET_STREAM);
        const owned = socket;
        socket.onopen = () => {
          openedAt = Date.now();
          retries = 0;
          transport = "WebSocket";
        };
        socket.onmessage = (e) => {
          try {
            const rows = JSON.parse(e.data);
            if (!Array.isArray(rows)) return;
            lastPacket = Date.now();
            apply(rows);
          } catch {}
        };
        socket.onerror = () => owned.close();
        socket.onclose = () => {
          if (socket !== owned) return;
          if (!dead && !document.hidden) {
            retryTimer = setTimeout(
              connect,
              Math.min(30000, 1000 * 2 ** Math.min(++retries, 5)),
            );
            clearTimeout(seedTimer);
            seedTimer = setTimeout(seed, 1000);
          }
        };
      } catch {
        retryTimer = setTimeout(connect, 10000);
      }
    }
    const visibility = () => {
      if (document.hidden) {
        clearTimeout(retryTimer);
        clearTimeout(seedTimer);
        socket?.close();
        publish();
      } else {
        clearTimeout(seedTimer);
        seed();
        connect();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    seed();
    connect();
    const tick = setInterval(() => {
      publish();
      if (
        !document.hidden &&
        socket?.readyState === 1 &&
        Date.now() - Math.max(lastPacket, openedAt) > 10000
      ) {
        socket.close();
      }
    }, 1000);
    return () => {
      dead = true;
      abort.abort();
      clearInterval(tick);
      clearTimeout(seedTimer);
      clearTimeout(retryTimer);
      socket?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);
  return state;
}
