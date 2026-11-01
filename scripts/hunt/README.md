# SHARPNEX one-minute research protocol v1

This is a measured negative result, not a profitable trading strategy. The UI shows conditional watches; no model in this study qualifies for entry recommendations.

## Reproduce

Node 24, Python 3.12+ and NumPy 2.3.5; no API key or paid service.

```
node scripts/hunt/download.mjs /tmp/sharpnex-history
python scripts/hunt/convert.py /tmp/sharpnex-history
node scripts/hunt/research.mjs /tmp/sharpnex-history public/research/hunt-validation.json
npm test
```

The manually dispatched **Reproduce multi-year hunt research** GitHub workflow runs the same commands and publishes its report to `market-data` using GitHub's ephemeral token. It requires no Google CLI authentication. Raw archives stay outside the repository and are cached in Actions. The app bundles the measured report as a fallback and accepts only reports matching its protocol identifier.

## Data and splits

180 Binance monthly archives: BTCUSDT and ETHUSDT, spot and USD-M perpetuals, January 2023–September 2026. Each ZIP is verified against Binance's SHA-256 checksum before parsing. ZIP members are read without path extraction. Spot microsecond timestamps from 2025 are normalized to seconds; duplicate/non-finite rows fail the run. Each spot dataset has one 80-minute gap; indicators reset and entries wait for 80 consecutive bars after any gap. There are 7,885,280 candles in total.

Chronological training: 2023–24. Validation: 2025. Final holdout: January–September 2026. The final holdout is never used for rule selection. Since this holdout has now been inspected, future improvements require a new untouched date range; repeatedly optimizing this interval cannot provide an honest new accuracy estimate.

## Fixed candidate family and execution assumptions

24 candidates: right-pivot confirmation 1/2 bars; RSI divergence difference 3/5 points; targets 1.5/2/3R; relative-volume thresholds 0.8/1.2. Fixed left pivot 3 bars, separation 5–60 bars, at least 0.05% price divergence, RSI extreme <=40 / >=60, Wilder RSI/ATR(14), EMA(50) trend alignment. Relative volume uses the preceding 20 bars, excluding the current bar. Stops are pivot price ±0.25 ATR at confirmation. Watches expire after 6 bars; entry requires a completed close beyond the confirmation-bar high/low. No entry is backdated to the pivot.

Rules rank by training net expectancy with >=100 trades. The top five compete on validation expectancy with >=30 trades. If neither stage has enough samples, the unoptimized fixed default is used and the model is explicitly marked as having insufficient selection evidence. That fallback was added before examining the final holdout. No candidate family was expanded after inspecting the holdout.

Entry is the following bar's open, within 0.5 ATR of the breakout close. Entry gap must still leave net reward/risk >=1. The target remains anchored to the breakout close; it is never moved to rescue R:R. Spot is long only. Perpetuals allow both directions. No overlapping positions per asset. Exit on stop, target, or after 10 bars. Stop wins if both levels are touched in one bar. Adverse gap fills use the open; favorable target gaps fill at the target. Trades crossing data gaps are excluded. No fill queue or partial fills are simulated.

Cost assumptions per side: spot fee 10 bps, perpetual fee 5 bps, slippage 2 bps and half-spread 0.5 bps. Perpetuals additionally reserve 1 bp funding per trade. Fees, spread and slippage are charged against the separate entry and exit notionals; funding uses entry notional. These are explicit assumptions, not account-specific fee quotes or reconstructed historical order books. The stress run doubles all cost assumptions on the **same trades**, without reselecting the sample.

Statistics include after-cost win frequency with a Wilson 95% interval, expectancy in net-risk R units, profit factor and peak-to-trough drawdown in additive R. This is not a capital-equity simulation or a next-trade probability. Samples are small and serially dependent; the Wilson interval does not correct that dependence. A positive-sample label requires >=100 held-out trades and positive validation, test and stressed expectancy; it does not establish statistical significance.

## Live behavior

The exact indicator/divergence/plan functions are shared between Node research and the browser. Eight liquid pairs plus the selected coin are scanned, with two requests in flight at most, every 15 seconds **after completion**. Selected bid/ask snapshots target 2 seconds. HTTP 429 backs off to 60 seconds. Background tabs pause network work; stale, missing or invalid data blocks eligibility. These are target cadences, not latency guarantees. The searchable coin rail is a separate 30-second catalog; it does not imply every listed pair is continuously scanned.

The modal keeps the detected target fixed, updates quote-based R:R, expires watches, and blocks stale data, invalidated stops/targets, chasing, spread, volume, calendar risk and unsupported research evidence. Profile risk sizing is illustrative, including expected costs but not contract sizing, leverage, exchange limits or liquidation. Spot book timestamps use an accompanying server-clock snapshot; Hyperliquid book timestamps come from the venue. Perpetual quote freshness is independently checked against that book clock.

Historical tests exclude live calendar/profile filters, news and order-book changes. Filtered live signals therefore have no measured historical accuracy. Binance perpetual data is only a proxy for Hyperliquid and never qualifies that venue. Other coins and the optional 5-minute timeframe have no matched multi-year study. Heikin-Ashi is a display transform only; raw OHLC drives all calculations. No synthetic news, future entries, causal geopolitical forecasts or fabricated accuracy are generated.

The report records rules, training candidates, monthly held-out outcomes, the engine SHA-256 and all archive hashes. News and calendar refresh remain in the separate existing 5-minute free-data pipeline; the long study only shares its concurrency lock during publication.
