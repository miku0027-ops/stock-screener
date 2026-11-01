# SHARPNEX

An independent crypto research terminal with a global heatmap, RSI divergence analysis, sourced news, and separate spot/perpetual market data. Built with React, Vite, Express, D3 treemaps, and TradingView Lightweight Charts. All integrations use free public endpoints; no API keys or paid chart subscriptions are required.

## Automatic hosting with GitHub Pages

GitHub Pages hosts this public project without a Google account, Firebase CLI sign-in, service-account key, or separately hosted backend. The site URL is `https://miku0027-ops.github.io/stock-screener/` after the deployment workflow succeeds.

**One-time activation:** open [Repository Settings → Pages](https://github.com/miku0027-ops/stock-screener/settings/pages) and select **GitHub Actions** under **Build and deployment → Source**. GitHub requires a repository administrator to enable this setting; the Codex GitHub integration does not have Pages administration permission. After enabling it, run **Deploy SHARPNEX to GitHub Pages** from the Actions tab once. Later pushes deploy automatically. No Google authentication is involved.

Every push to `main` runs `.github/workflows/deploy-pages.yml`: install locked dependencies, run unit tests, build the static app for its `/stock-screener/` base path, and deploy through GitHub's short-lived workflow token. No manually maintained deployment secrets are required. The existing market-data workflow updates global snapshots independently; crypto is polled from Binance directly. Feed limits and snapshot freshness behavior below still apply.

Use `npm run build:pages` to reproduce the hosted build. The Firebase configuration is retained as an optional target; its deployment authentication is not required for GitHub Pages. If Firebase is preferred later, GitHub Actions with Google Workload Identity Federation can avoid recurring Codex sign-in, but a Google administrator must authorize that federation once.

## Run

Requires Node.js 22+ (validated with Node 24) and npm.

```sh
npm ci
npm run dev
```

Vite runs on port **5173** and proxies `/api` to Express on **3001**. For a production build, run `npm run build`, then `npm start`; Express serves the app and API together on port **3001** (`PORT` overrides it). No database or credentials are required. Browser watchlists and the data-mode preference are stored locally.

## Included

- 49 curated instruments: Bitcoin, Ethereum and eight other crypto pairs; major US stocks including NVIDIA, Coinbase and Strategy; Dow Jones, S&P 500, Nasdaq, European and Asian indices; Singapore STI; gold, silver, oil and other commodity futures; FX, dollar index, VIX and US 10-year yield.
- Weighted mosaic tiles, price-change flashes, market filters, text search, top movers and market breadth.
- Tile sizing by editorial importance, absolute price movement, or equal weight. Importance is **not** market cap or a calculated correlation with Bitcoin.
- Clickable price history with candlestick and Heikin-Ashi charts and 1D, 1W, 1M, 3M and 1Y timeframes.
- Persistent watchlists, CSV exports, refresh/pause controls, expanded map, keyboard shortcuts (Ctrl/Cmd+K and Escape), and a mobile layout.

## Data sources and limitations

| Source                                                    | Coverage                                                    | Behavior                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binance public market data (`data-api.binance.vision`)    | Crypto pairs denominated in USDT                            | Crypto quotes sampled on a 2-second target cadence; 1.8-second local server cache; exchange availability and geographic restrictions apply. This is polling, not a tick-by-tick WebSocket feed. |
| Yahoo Finance chart endpoint (`query1.finance.yahoo.com`) | Indices, equities, futures, currencies and macro indicators | Unofficial public interface; 60-second cache. Quotes may be delayed, rate-limited, unavailable or from a closed session.                                                                        |
| TradingView Lightweight Charts                            | Interactive chart rendering                                 | Open-source chart library; attribution is retained. It supplies no market data.                                                                                                                 |

**Free feeds cannot guarantee exchange-grade real-time coverage of every market.** Provider timestamps are shown in UTC. SGX / STI is the Straits Times equity index, not an SGX futures feed. Commodities are front-month futures, not spot prices. Exchange index currencies are denomination context; index values are index points. Treasury yield is in percent. FX quote direction is shown in the symbol.

1D changes are rolling 24-hour changes for Binance and previous-session-close changes for Yahoo. Longer periods compare the most recent price with the first available candle's open in the requested window. Weekends, holidays and time zones can make those windows differ by market. These are unadjusted price comparisons, not total returns. Futures rolls can produce discontinuities.

The app starts in live mode unless demo was explicitly saved in the browser. If every provider fails, it switches to a prominently labeled illustrative demo. Partial failures show empty tiles, never sample prices mixed into live results. Demo prices are fictional examples and do not update or flash as though live. Demo chart OHLC and returns are internally consistent. Cross-market explanations are contextual; no causal relationship or predictive correlation is claimed.

Public endpoints can change without notice. Review provider terms before commercial use or redistribution. There is no universal guarantee of free redistribution rights.

## Network configuration

Allow HTTPS access to:

- `data-api.binance.vision`
- `query1.finance.yahoo.com`

The backend honors `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and the environment's configured CA trust through Undici's `EnvHttpProxyAgent`. TLS verification remains enabled. Source calls have timeouts and bounded concurrency; responses are cached and concurrent identical requests are coalesced. User-controlled symbols and timeframes are restricted to the catalog; this server is not an arbitrary URL proxy.

The initial cloud policy denied both sources. After network access was enabled, real Binance quotes and all 39 Yahoo instruments across five historical timeframes were fetched successfully. Feed availability can still change; successful retrieval is not a guarantee of continuous service.

## Checks

```sh
npm test
npm run test:e2e
npm run build
```

The browser tests use system Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` if it is installed elsewhere. Playwright starts the dev server automatically if needed. Unit tests cover feed parsing, request caching, concurrency limits, candle validity and HTTP input validation. Browser tests cover filters, search, selection, timeframes, watchlist persistence, CSV content, partial and total provider failures, responsive layout and dialog dismissal. Tests using intercepted feed responses validate application behavior, not external provider connectivity.

## Project layout

- `shared/markets.js` — catalog, editorial weights and timeframe definitions; edit here to extend coverage.
- `shared/demo.js` — deterministic illustrative data, isolated from live provider code.
- `server/providers.js` — provider adapters, normalization, caching and concurrency.
- `server/index.js` — allowlisted API routes and static production hosting.
- `src/main.jsx`, `src/styles.css` — dashboard and chart UI.

Each cloud task already has an isolated checkout. Work in `/workspace/stock-screener`; do not create a separate Git worktree unless explicitly requested. Processes must be restarted in a restored task; installed dependencies and built assets can be retained in the environment snapshot.

## Firebase Hosting: sharp-nex (free static deployment)

The Firebase build does **not** require Cloud Functions, Cloud Run, Blaze billing, a database, or a separately hosted Node server. It uses:

- Binance's public CORS-enabled market endpoints directly in the browser, sampled on a 2-second target cadence.
- Real Yahoo quotes and chart history published to the dedicated `market-data` branch of this public GitHub repository. The GitHub Actions workflow requests intraday updates every five minutes; longer histories refresh hourly. GitHub schedules can be delayed or disabled after inactivity. Hosted global quotes are labeled **SNAPSHOT**, and failed or overdue updates are labeled **STALE**. Market closures also affect provider timestamps. This is not exchange-grade streaming.
- Firebase Hosting's free-tier static service, subject to its storage and transfer quotas. Scheduled standard GitHub-hosted runners are free for this public repository. No paid plan is enabled by these instructions.

The existing Node server remains available for local development or self-hosting. `npm run build` targets that server; **`npm run build:firebase` must be used for static Hosting**. `.env.firebase` selects the browser/static data adapter. Firebase's predeploy hook always builds the correct mode.

### Deploy with an authorized identity

```sh
npm ci
npx --yes firebase-tools@15.34.2 login
npm run deploy:firebase
```

Deployment uses project/site `sharp-nex` from `.firebaserc` and `firebase.json`. The expected site URL after a successful deployment is `https://sharp-nex.web.app`. The Firebase web-app configuration supplied by the owner identifies an existing app; its public API key **does not authorize deployment**. Hosting alone does not require initializing the Firebase JavaScript SDK or Analytics, so no unnecessary tracking SDK was added.

In this managed environment, connect a Google identity with Firebase Hosting permissions for `sharp-nex` through environment settings instead of sending credentials in chat. Never commit service-account files or tokens. Firebase authentication was unavailable during initial deployment preparation; the site is not published until `firebase deploy` succeeds.

### Data pipeline

`.github/workflows/market-data.yml` updates real market data without Firebase credentials. It preserves the last valid quotes on failures and marks them stale rather than fabricating prices. `scripts/export-market-data.mjs` writes only public quote/history JSON. Application code is kept on `main`; generated data is kept on `market-data`. The catalog's illustrative sample values are removed from exported quotes.

The static app fetches the `market-data` branch through `raw.githubusercontent.com`, with normal CDN caching; updates are not guaranteed to be instantaneous. Keep the repository public for this method. Never embed a GitHub token in the frontend. The workflow can also be run manually from GitHub Actions.

Run `npm run test:firebase` to verify the built static app, snapshot freshness labels, direct crypto requests and chart loading without a Node API. These browser tests use intercepted responses; real provider/export checks are separate.

## Two-second crypto analysis and five-minute RSI signals

The default live heatmap uses **2s crypto change**, calculated as `(currentPrice / previousPrice - 1) × 100` between consecutive Binance snapshot timestamps. A return is shown only when those snapshots are 1.5–3.5 seconds apart. Initial samples, repeated timestamps, missed intervals, paused feeds and stale results are neutral. Numbers use six decimal places in this mode; flashes require an actual price change. Global markets are neutral in 2s mode because their free feeds cannot provide equivalent timing. Switch to 1D/1W/1M for global performance colors.

Requests target one batch every two seconds without overlapping requests. Network latency, browser background-tab throttling and exchange limits can prevent exact timing. Hidden tabs stop polling. HTTP 429 responses back off for 60 seconds. Slow global snapshot requests are independent of crypto refreshes. No paid feed, synthetic price tick or guaranteed timing is implied. CSV exports include sample interval in milliseconds; tile tooltips show the observed interval.

**5m RSI signal desk** is available from the navigation and dashboard shortcut. It opens with BTCUSDT and ETHUSDT and supports active Binance USDT pairs selected in the coin rail. Perpetual mode uses separate Hyperliquid candles and venue data. It does not place trades. Demo mode never produces signals. The desk synchronizes against Binance server time, fetches 500 bars initially, then requests three recent bars per two-second check and retains up to 1,000. Open/settling candles are excluded. Missing bars, invalid OHLC, overdue candles, feed errors, responses taking over five seconds, or checks older than eight seconds suppress actionable signals.

### Rules, not an accuracy claim

- RSI(14) uses Wilder smoothing and a simple-average gain/loss seed. At least 100 consecutive closed five-minute candles are required.
- A pivot needs **3 bars on each side**. Divergence confirmation is consequently **15 minutes after the price pivot**, not at the pivot in hindsight. Chart arrows appear on the confirmation bar.
- Adjacent same-type pivots must be 5–60 bars apart. Bullish regular divergence requires a price low at least 0.05% lower and RSI at least 3 points higher, with one pivot RSI ≤40. Bearish is mirrored with one pivot RSI ≥60.
- A divergence is a **watch condition** until a subsequent five-minute candle closes beyond the confirmation bar’s high (bull) or low (bear). The observed breakout close is recorded as a signal reference, not an executable fill.
- Invalidation uses the pivot extreme plus a 0.25× ATR(14) buffer. Untriggered setups expire after 6 bars; triggered setups expire after another 6 bars. The illustrative target is 2× the entry-to-invalidation distance. If a candle could hit both target and invalidation, the calculation assumes invalidation first.
- Only the latest qualifying setup is considered active. Historical outcomes refer to candle levels, not executed trades. Fees, slippage, spread and funding are not included. **The profile-filtered strategy has no validated predictive accuracy. A separate fixed-rule spot baseline is evaluated chronologically in the evidence panel; it does not validate the complete platform. No profitable prediction is guaranteed.**

The desk also shows ATR, EMA20/50, UTC-session approximate VWAP, relative volume against the prior 20 bars, best bid/ask spread and top-20 spot order-book imbalance. Book snapshots refresh at most every ten seconds. Orders may be spoofed or removed; these measures do not prove future price direction. The context page attributes the daily Fear & Greed index to [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/). Existing DXY, yields, VIX, gold and equity snapshots provide wider context. Perpetual funding (hourly percentage), mark/oracle basis and open interest are now fetched from Hyperliquid. They describe that venue only.

## Declared supply unlocks

Only date-specific, issuer-published schedules with source links are admitted. Unknown dates and estimates are not displayed. The initial verified catalog covers **STRK**, based on [Starknet's official STRK documentation](https://docs.starknet.io/learn/protocol/strk): **up to 127 million tokens on the 15th of each month from April 2025 through March 2027**. The remaining upcoming dates are listed; no exact hour or guaranteed release amount is invented. This is a published recurring schedule, not a newly issued announcement for each date and not proof of future selling.

Sui's official schedule explicitly calls its timing an estimate, so it was excluded. Aptos's reviewed community schedule is described as anticipated monthly distribution without an explicit day, so no future dates were invented. The reviewed generic unlock API required payment and is not used. Coverage is intentionally limited rather than presented as comprehensive.

`data/announced-unlocks.json` contains the reviewed records. `scripts/export-announced-unlocks.mjs` rechecks the exact official schedule wording daily from the scheduled data workflow. If the wording no longer matches, it publishes no records until reviewed. If the source is temporarily unavailable, the last verification is retained; records older than 35 days are hidden. Past dates disappear automatically. Add more tokens only after verifying an explicit dated issuer schedule and updating the allowlist in `shared/unlocks.js`.

Signal logic and freshness tests are in `tests/signals.test.js`; browser coverage is in `tests/firebase/signals.spec.js`. `ATLAS_TEST_PORT=4180 npm run test:firebase` can use a different preview port if another preview is running. No generated news, fabricated backtest results or model-generated trade calls are substituted for source data and deterministic rules.

## SHARPNEX research terminal

The app starts in the signal desk. The first visit asks for one of five research profiles; this choice and the light/dark theme persist in browser storage. Risk/return labels express user preferences, not a promise that low-risk/high-return trades exist. The original `atlas-mode` and watchlist storage keys are retained to preserve existing preferences.

The scrollable, searchable rail loads Binance exchange metadata and includes active, spot-enabled USDT pairs. It refreshes its universe quotes on a 30-second target cadence, separately from the 2-second map and selected analysis checks. It is not a claim to cover every coin worldwide. Delisted and unsupported contracts are excluded; failed feeds show limited/stale coverage. Selecting a coin opens its five-minute analysis. Perpetual mode checks Hyperliquid's actual contract universe and never relabels a spot signal as a futures signal. All Hyperliquid requests are read-only `info` requests. No wallet, execution, orders or trading credentials are implemented.

Price charts offer candlesticks and Heikin-Ashi only. Heikin-Ashi is computed recursively for display; all RSI, divergence, stops and references use original exchange OHLC. The lower indicator pane is RSI, not a line-price chart. Theme colors also update chart canvases. The original logo mark is in `public/sharpnex-mark.png`.

### Developing versus eligible setups

- Early watch uses one closed right-hand bar (five minutes after the swing), keeping the same three left-hand bars and divergence thresholds. It may invalidate. It never produces an entry by itself.
- Confirmation still requires three right-hand bars (15 minutes). The subsequent closed breakout is recorded as an observed reference, not an execution price.
- Eligibility checks freshness, confirmation, breakout, current-bar invalidation, proximity within 0.5 ATR of the breakout reference, an unreached profile target, market direction, 5m EMA20/50 and complete-hour EMA20 alignment where required, relative volume, spread and covered scheduled events. Spot entries are long only. Bearish spot divergence means avoid/reassess, not a short order.
- Hourly bars are formed only from twelve consecutive complete five-minute bars. At least twenty complete hours are required for the hourly trend filter. No partial-hour or Heikin-Ashi price enters the calculation.
- Every profile requires fresh BLS and FOMC calendar fetches (no more than 30 minutes old). Covered CPI/employment releases block eligibility within ±30 minutes; published FOMC meeting days use the New York calendar date because no exact time is inferred. Missing coverage fails closed. This is not a complete global event calendar.
- Perpetual eligibility additionally requires fresh Hyperliquid mark, oracle, open-interest and funding fields. The platform recommends no leverage or liquidation level.

| Profile                  | Illustrative risk budget | Target | Minimum relative volume | Trend required | Maximum spread |
| ------------------------ | ------------------------ | ------ | ----------------------- | -------------- | -------------- |
| Low risk / low return    | 0.25%                    | 1.5R   | 1.2×                    | Yes            | 3 bps          |
| Low risk / mild return   | 0.5%                     | 2R     | 1.1×                    | Yes            | 4 bps          |
| Low risk / high return   | 0.5%                     | 3R     | 1.2×                    | Yes            | 3 bps          |
| Mild risk / high return  | 1%                       | 3R     | 1×                      | Yes            | 6 bps          |
| High risk / high returns | 2%                       | 3R     | 0.8×                    | No             | 10 bps         |

These are product filtering assumptions, not optimized parameters or financial recommendations. The optional sizing reference is `equity × risk fraction / stop distance`. It excludes fees/funding and warns when notional exceeds equity; gaps and slippage can exceed the nominal budget. A passed-check count is never called a confidence score.

### News, events and provenance

`scripts/export-research.mjs` runs in the existing five-minute scheduled workflow. It parses actual RSS titles from the Federal Reserve, SEC, EIA, CoinDesk, Cointelegraph and BBC World. It publishes only titles, timestamps, publisher attribution and allowlisted source links, with no generated article summaries. Literal keyword tags label possible topics such as scams, conflict, sanctions and energy; they do not prove an allegation or infer a price effect. Publisher reports are not independently fact-checked by SHARPNEX.

The BLS iCalendar supplies explicit release times converted with New York daylight-saving rules. FOMC dates are extracted from the official meeting calendar and remain date-only. No implied decision time, consensus forecast or actual release figure is invented. Failed calendar sources publish no events from that source and fail the eligibility gate. Source health and stale publication status are visible. The app polls the published JSON every minute; GitHub schedules and CDN propagation can lag. News coverage is intentionally limited and cannot capture all crypto, political, war or policy developments.

### Measured baseline and correlations

`scripts/export-validation.mjs` runs at most daily. It loads fourteen days of real BTCUSDT/ETHUSDT five-minute spot candles, validates continuity, and evaluates the latest seven days after indicator warmup. Fixed, untuned rules use regular bullish divergence, a closed breakout and the following bar's open; one hypothetical position at a time; six-bar time exit; 2R target; pivot/ATR stop. Costs assume 10 bps fee plus 5 bps slippage **per side**. Adverse gaps fill at the opening price; stops win ambiguous bars. Open trades at the end are not reported as completed. The panel shows sample count, wins, expectancy in R and peak-to-trough loss in R. Fewer than thirty trades is explicitly an insufficient accuracy sample.

This is a retrospective baseline, not live paper trading or a validation of profile/news/macro filters. It excludes perpetuals and funding. It cannot reproduce live fills and is not a forecast of the next trade. Negative results remain visible. Raw trade references and assumptions are published in `market-data/validation.json`; stale (>48h) or unavailable results are not presented as current evidence.

Descriptive Pearson correlations compare Bitcoin log returns with S&P 500, dollar index, gold futures, WTI and VIX on up to sixty common UTC calendar-date intervals. Returns span the same common dates across weekends. Different session close times and delayed daily feeds limit comparability; correlation does not imply causality. At least twenty matched intervals and recently fetched global history are required. The sample end date is displayed.

Additional public destinations: `api.hyperliquid.xyz`, `www.federalreserve.gov`, `www.bls.gov`, `www.sec.gov`, `www.eia.gov`, `www.coindesk.com`, `cointelegraph.com`, `feeds.bbci.co.uk`, `fred.stlouisfed.org`, `api.alternative.me`, and `raw.githubusercontent.com`. Server-side RSS/calendar collection avoids relying on third-party CORS proxies. All market/news APIs and chart libraries remain free; provider terms and availability apply.

Tests cover Heikin-Ashi recursion, raw-price isolation, source parsing/link safety, DST conversion, date-only FOMC handling, profile/event/stale-data gates, next-bar historical entry and adverse gaps, theme/profile persistence, the full coin rail, separate perpetual data, read-only requests and mobile layout. Browser mocks test behavior; native provider checks and deployed-site verification separately establish connectivity at test time.

When BLS blocks access from the hosted runner, its calendar adapter falls back to the Federal Reserve Bank of St. Louis's public FRED release calendars for **CPI and Employment Situation only**. FRED's explicitly published US Central times are converted using `America/Chicago` DST rules; unspecified times remain date-only. Source health names FRED and shows the narrower coverage. Both fallback release calendars must validate or the source remains unavailable and entry eligibility stays blocked. This fallback does not invent the missing JOLTS/PPI/import-export events.
