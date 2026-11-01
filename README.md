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

**Free feeds cannot guarantee exchange-grade real-time coverage of every market.** The market map labels UTC; hunt modals use the browser locale with an explicit timezone. SGX / STI is the Straits Times equity index, not an SGX futures feed. Commodities are front-month futures, not spot prices. Exchange index currencies are denomination context; index values are index points. Treasury yield is in percent. FX quote direction is shown in the symbol.

1D changes are rolling 24-hour changes for Binance and previous-session-close changes for Yahoo. Longer periods compare the most recent price with the first available candle's open in the requested window. Weekends, holidays and time zones can make those windows differ by market. These are unadjusted price comparisons, not total returns. Futures rolls can produce discontinuities.

The app starts in live mode unless demo was explicitly saved in the browser. If every provider fails, it switches to a prominently labeled illustrative demo. Partial failures show empty tiles, never sample prices mixed into live results. Demo prices are fictional examples and do not update or flash as though live. Demo chart OHLC and returns are internally consistent. Cross-market explanations are contextual; no causal relationship or predictive correlation is claimed.

Public endpoints can change without notice. Review provider terms before commercial use or redistribution. There is no universal guarantee of free redistribution rights.

## Network configuration

Allow HTTPS access to:

- `data-api.binance.vision`
- `query1.finance.yahoo.com`
- `api.hyperliquid.xyz`, `data.binance.vision`, `raw.githubusercontent.com`

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

## Trade hunt: one-minute discovery

The default view is a compact watch queue and candle chart. Click a pair or **Inspect setup** to open Plan / Evidence / Sources in a modal. Entry reference, fixed stop/target, cost-adjusted reward/risk, expiry, live bid/ask, profile checks and optional position sizing stay out of the main workspace. Candlestick and Heikin-Ashi are the only price-chart styles; raw OHLC drives the calculations. The RSI indicator is a separate line pane.

Eight liquid pairs plus the selected coin are scanned at a 15-second target cadence after completion; selected bid/ask quotes target 2 seconds. The searchable coin rail is a separate 30-second catalog, not a claim to scan every listed asset. Binance spot and Hyperliquid perpetuals use independent candles, clocks and contract metadata. Five-minute analysis is also available but has no matched multi-year study. Background tabs stop requests; rate limits back off; expired or stale inputs block recommendations. No trading credentials, wallet or order submission exists.

Profiles store risk and reward goals locally, alongside theme preferences. They cannot make low-risk/high-return trades exist. Profile targets act as minimum gross-R filters; they never extend a detected target to improve its displayed R:R. Sizing includes estimated transaction costs but excludes exchange limits, leverage and liquidation. Calendar sources must be fresh and covered high-impact events must be outside their blocking windows.

### Measured research, not invented accuracy

The shared engine was evaluated on **7,885,280 real one-minute candles**, 180 checksum-verified monthly Binance archives, BTC/ETH spot and USD-M perpetuals, January 2023–September 2026. Twenty-four fixed candidates use 2023–24 training and 2025 validation; January–September 2026 is held out of selection. Fees, slippage, spread, funding assumptions, next-bar entries, stop-first ambiguity and adverse gaps are included.

**None of the tested models demonstrated a profitable edge after costs.** Held-out win frequencies are 10.0% / 33.3% for BTC/ETH spot (10 / 15 trades) and 14.8% / 26.7% for Binance perpetuals (27 / 60 trades). These small samples do not establish predictive accuracy. Negative net expectancy and uncertainty intervals remain visible in the modal. All current candidates are conditional research watches, not qualified entry recommendations. Binance perpetual evidence does not validate Hyperliquid, and live profile/calendar filters were not historically backtested.

See [the complete reproducible protocol](scripts/hunt/README.md) and [measured report](public/research/hunt-validation.json). The **Reproduce multi-year hunt research** workflow uses free GitHub runners and public archives, then publishes the report with GitHub's ephemeral token. No Google authentication is needed. Subsequent rule changes require a new untouched evaluation range; the system does not retune on the inspected holdout until it looks profitable.

Implementation: `shared/hunt/engine.js`, `shared/hunt/assessment.js`, `src/hunt-data.js`, `src/HuntDesk.jsx`, `src/HuntChart.jsx`, and `scripts/hunt/`. The former verbose five-minute desk and seven-day baseline are superseded.

## Two-second heatmap

The default live heatmap uses **2s crypto change**, calculated as `(currentPrice / previousPrice - 1) × 100` between consecutive Binance snapshot timestamps. A return is shown only when those snapshots are 1.5–3.5 seconds apart. Initial samples, repeated timestamps, missed intervals, paused feeds and stale results are neutral. Numbers use six decimal places in this mode; flashes require an actual price change. Global markets are neutral in 2s mode because their free feeds cannot provide equivalent timing. Switch to 1D/1W/1M for global performance colors.

Requests target one batch every two seconds without overlapping requests. Network latency, browser background-tab throttling and exchange limits can prevent exact timing. Hidden tabs stop polling. HTTP 429 responses back off for 60 seconds. Slow global snapshot requests are independent of crypto refreshes. No paid feed, synthetic price tick or guaranteed timing is implied. CSV exports include sample interval in milliseconds; tile tooltips show the observed interval.

## Declared supply unlocks

Only date-specific, issuer-published schedules with source links are admitted. Unknown dates and estimates are not displayed. The initial verified catalog covers **STRK**, based on [Starknet's official STRK documentation](https://docs.starknet.io/learn/protocol/strk): **up to 127 million tokens on the 15th of each month from April 2025 through March 2027**. The remaining upcoming dates are listed; no exact hour or guaranteed release amount is invented. This is a published recurring schedule, not a newly issued announcement for each date and not proof of future selling.

Sui's official schedule explicitly calls its timing an estimate, so it was excluded. Aptos's reviewed community schedule is described as anticipated monthly distribution without an explicit day, so no future dates were invented. The reviewed generic unlock API required payment and is not used. Coverage is intentionally limited rather than presented as comprehensive.

`data/announced-unlocks.json` contains the reviewed records. `scripts/export-announced-unlocks.mjs` rechecks the exact official schedule wording daily from the scheduled data workflow. If the wording no longer matches, it publishes no records until reviewed. If the source is temporarily unavailable, the last verification is retained; records older than 35 days are hidden. Past dates disappear automatically. Add more tokens only after verifying an explicit dated issuer schedule and updating the allowlist in `shared/unlocks.js`.

Signal logic and freshness tests are in `tests/signals.test.js`; browser coverage is in `tests/firebase/signals.spec.js`. `ATLAS_TEST_PORT=4180 npm run test:firebase` can use a different preview port if another preview is running. No generated news, fabricated backtest results or model-generated trade calls are substituted for source data and deterministic rules.

### News, events and provenance

`scripts/export-research.mjs` runs in the existing five-minute scheduled workflow. It parses actual RSS titles from the Federal Reserve, SEC, EIA, CoinDesk, Cointelegraph and BBC World. It publishes only titles, timestamps, publisher attribution and allowlisted source links, with no generated article summaries. Literal keyword tags label possible topics such as scams, conflict, sanctions and energy; they do not prove an allegation or infer a price effect. Publisher reports are not independently fact-checked by SHARPNEX.

The BLS iCalendar supplies explicit release times converted with New York daylight-saving rules. FOMC dates are extracted from the official meeting calendar and remain date-only. No implied decision time, consensus forecast or actual release figure is invented. Failed calendar sources publish no events from that source and fail the eligibility gate. Source health and stale publication status are visible. The app polls the published JSON every minute; GitHub schedules and CDN propagation can lag. News coverage is intentionally limited and cannot capture all crypto, political, war or policy developments.

When BLS blocks access from the hosted runner, its calendar adapter falls back to the Federal Reserve Bank of St. Louis's public FRED release calendars for **CPI and Employment Situation only**. FRED's explicitly published US Central times are converted using `America/Chicago` DST rules; unspecified times remain date-only. Source health names FRED and shows the narrower coverage. Both fallback release calendars must validate or the source remains unavailable and entry eligibility stays blocked. This fallback does not invent the missing JOLTS/PPI/import-export events.

If both BLS and FRED are unavailable, the adapter can use Fair Economy's public Forex Factory weekly calendar. This is a **publisher-reported third-party fallback**, explicitly labeled in source health and the event ribbon, not presented as an official or independently verified schedule. Only dated high-impact USD events are admitted, with their supplied ISO timezone offsets. Forecast and previous-value fields are discarded. The feed must cover the current week; missing, out-of-date or undated data fails closed. Coverage is limited to the current week and event times may change. Official FOMC dates still come directly from the Federal Reserve.
