import React, { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { pricePrecision } from "./price-format.js";
import { heikinAshi } from "../shared/analysis.js";
export default function HuntChart({ data, kind, theme }) {
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
    const identity = `${data.symbol}:${data.venue}:${data.interval}`;
    if (h.identity !== identity) {
      h.first = true;
      h.identity = identity;
    }
    const last = data.candles.at(-1).close;
    const precision = pricePrecision(last);
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
        text: e.label
          ? `${e.direction === "bull" ? "Bull" : "Bear"} ${e.label === "RSI divergence" ? "RSI" : e.label === "Trend pullback" ? "pullback" : "breakout"}`
          : e.direction === "bull"
            ? "Bull div"
            : "Bear div",
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
      aria-label="Price candles and Wilder RSI chart"
    />
  );
}
