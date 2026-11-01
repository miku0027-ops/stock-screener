import { useEffect, useState } from "react";
import { getJSON } from "./trading-data.js";
export const DATA_ROOT =
  "https://raw.githubusercontent.com/miku0027-ops/stock-screener/market-data";
export function useResearch() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    let timer,
      dead = false;
    async function update() {
      if (!document.hidden) {
        try {
          const d = await getJSON(
            `${DATA_ROOT}/research.json?v=${Math.floor(Date.now() / 300000)}`,
            c.signal,
          );
          if (
            !dead &&
            Array.isArray(d.articles) &&
            Array.isArray(d.events) &&
            Array.isArray(d.sources)
          )
            setData(d);
        } catch {}
      }
      if (!dead) timer = setTimeout(update, 60000);
    }
    update();
    return () => {
      dead = true;
      c.abort();
      clearTimeout(timer);
    };
  }, []);
  return data;
}
let instruments = null,
  instrumentsAt = 0;
export async function coinUniverse(signal) {
  if (!instruments || Date.now() - instrumentsAt > 3600000) {
    const d = await getJSON(
      "https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT",
      signal,
    );
    if (!Array.isArray(d.symbols)) throw Error("Universe unavailable");
    instruments = d.symbols.filter(
      (s) =>
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        s.isSpotTradingAllowed !== false &&
        /^[A-Z0-9]{2,20}USDT$/.test(s.symbol),
    );
    instrumentsAt = Date.now();
  }
  const quotes = await getJSON(
    "https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI",
    signal,
  );
  if (!Array.isArray(quotes)) throw Error("Quotes unavailable");
  const byId = new Map(quotes.map((q) => [q.symbol, q]));
  return instruments
    .flatMap((s) => {
      const q = byId.get(s.symbol);
      if (
        !q ||
        ![q.lastPrice, q.openPrice, q.closeTime, q.quoteVolume].every(
          (v) => v !== null && v !== "" && Number.isFinite(+v),
        ) ||
        +q.lastPrice <= 0 ||
        +q.openPrice <= 0
      )
        return [];
      return [
        {
          id: s.symbol,
          symbol: s.baseAsset,
          price: +q.lastPrice,
          change: (+q.lastPrice / +q.openPrice - 1) * 100,
          volume: +q.quoteVolume,
          asOf: +q.closeTime,
        },
      ];
    })
    .sort((a, b) => b.volume - a.volume);
}
