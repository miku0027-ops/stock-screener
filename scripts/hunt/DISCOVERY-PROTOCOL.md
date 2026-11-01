# Discovery v2: frozen before new holdout inspection

Three causal signal families: confirmed RSI divergence, EMA20/50 trend pullback with RSI recovery, and a 20-bar range breakout with volume/body confirmation. The existing divergence study was negative. Its January–September 2026 evaluation has already been inspected and is not a new holdout.

New study: same verified BTC/ETH spot and USD-M archive history, 2023–24 training, 2025 validation. A new, fixed holdout is **October 1–30, 2026**, downloaded separately after this protocol is frozen. No parameters or timeframe are selected by that holdout. One-minute source candles are aggregated on continuous UTC epoch boundaries into every integer timeframe from 1m through 14m; incomplete/gapped buckets are excluded. Models are separate per family, timeframe, symbol and venue; the blend of families has no portfolio validation.

Eight fixed candidates per family: target 2/3R, relative volume 0.8/1.2, and right-pivot confirmation 1/2 bars (divergence) or stop 1.5/2 ATR (pullback/breakout). Divergence RSI difference stays 3. Top three rules with >=100 training trades compete by 2025 net expectancy with >=30 validation trades. Insufficient selection data uses the predeclared base rule and is labeled. Selection never uses Jan–Sep 2026 or October outcomes.

Execution uses next-bar open within 0.5 ATR, net reward/risk >=1, original fixed stop/target, one position per asset/family, adverse gap fills and stop-first ambiguous candles. Time exit after min(10, ceil(30 / timeframe)) bars, with a minimum of 2 bars. Costs and separate entry/exit notionals match v1: spot fees 10bps/side, perp 5bps/side, slippage 2bps/side, half-spread .5bps/side, and 1bp perp funding reserve/trade. Double-cost stress applies to the same trades. No leverage, account fees, fill queue, liquidation, historical macro/news/profile or dynamic-universe simulation.

A positive-sample badge requires >=100 holdout trades and positive training, validation, holdout and double-cost expectancy. This is descriptive evidence, not statistical significance: 168 model combinations are reported and no multiple-testing correction or forward live track record establishes predictive accuracy. All live opportunities remain research candidates. Hyperliquid is not venue-matched to Binance perpetual results. Other scanned coins have no matched backtest. No profitable outcome is required or guaranteed.

## Observed data coverage and result

The archive audit verified 298 ZIPs. Two daily perpetual archives (BTCUSDT and ETHUSDT, October 28) returned HTTP 404; the manifest retains those missing dates. No substitute prices were inserted. Missing buckets and subsequent indicator warmup are excluded. October spot has 43,200 minutes per asset; perpetuals have 41,760 per asset. Alongside the original 7,885,280 candles, this is 8,055,200 unique source bars.

All 168 family/timeframe/symbol/venue models are published. Thirteen had positive October sample expectancy, with only 1–7 trades each. None met the predeclared evidence threshold. No live candidate is presented as having demonstrated predictive accuracy. The next strategy revision will need another untouched evaluation period; October has now been inspected.

Reproduction:

```
node scripts/hunt/download.mjs /tmp/sharpnex-history
python scripts/hunt/convert.py /tmp/sharpnex-history
node scripts/hunt/download-october.mjs /tmp/sharpnex-october
python scripts/hunt/convert.py /tmp/sharpnex-october --allow-missing
node scripts/hunt/research-discovery.mjs /tmp/sharpnex-history /tmp/sharpnex-october public/research/discovery-validation.json
```
