import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markets, periodConfig } from "../shared/markets.js";
import { snapshot, history } from "./providers.js";
export const app = express();
app.disable("x-powered-by");
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", service: "sharpnex" }),
);
app.get("/api/markets", async (req, res) => {
  const period = req.query.period || "1D";
  if (!periodConfig[period])
    return res.status(400).json({ error: "Unsupported timeframe" });
  try {
    res.json(await snapshot(period));
  } catch {
    res
      .status(502)
      .json({ error: "Market providers are unavailable. Try again shortly." });
  }
});
app.get("/api/history", async (req, res) => {
  const market = markets.find((m) => m.id === req.query.symbol),
    period = req.query.period || "1D";
  if (!market || !periodConfig[period])
    return res.status(400).json({ error: "Unknown symbol or timeframe" });
  try {
    res.json(await history(market, period));
  } catch {
    res.status(502).json({
      error:
        "This free data feed is currently unavailable. Please retry later.",
    });
  }
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Endpoint not found" });
  res.sendFile(path.join(root, "dist", "index.html"));
});
if (process.argv[1] === fileURLToPath(import.meta.url))
  app.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
    console.log("SHARPNEX API listening on port " + (process.env.PORT || 3001)),
  );
