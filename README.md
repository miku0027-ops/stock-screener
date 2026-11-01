# Atlas Markets

A responsive, single-screen market heatmap for understanding the markets around Bitcoin. Built with React, Vite, Express, D3 treemaps, and TradingView Lightweight Charts. All integrations use free public endpoints; no API keys or paid chart subscriptions are required.

## Automatic hosting with GitHub Pages

GitHub Pages hosts this public project without a Google account, Firebase CLI sign-in, service-account key, or separately hosted backend. The site URL is `https://miku0027-ops.github.io/stock-screener/` after the deployment workflow succeeds.

**One-time activation:** open [Repository Settings → Pages](https://github.com/miku0027-ops/stock-screener/settings/pages) and select **GitHub Actions** under **Build and deployment → Source**. GitHub requires a repository administrator to enable this setting; the Codex GitHub integration does not have Pages administration permission. After enabling it, run **Deploy Atlas to GitHub Pages** from the Actions tab once. Later pushes deploy automatically. No Google authentication is involved.

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
- Clickable price history with line/candlestick charts and 1D, 1W, 1M, 3M and 1Y timeframes.
- Persistent watchlists, CSV exports, refresh/pause controls, expanded map, keyboard shortcuts (Ctrl/Cmd+K and Escape), and a mobile layout.

## Data sources and limitations

| Source                                                    | Coverage                                                    | Behavior                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binance public market data (`data-api.binance.vision`)    | Crypto pairs denominated in USDT                            | Quotes requested every 30 seconds; 20-second server cache; exchange availability and geographic restrictions apply. This is polling, not a tick-by-tick WebSocket feed. |
| Yahoo Finance chart endpoint (`query1.finance.yahoo.com`) | Indices, equities, futures, currencies and macro indicators | Unofficial public interface; 60-second cache. Quotes may be delayed, rate-limited, unavailable or from a closed session.                                                |
| TradingView Lightweight Charts                            | Interactive chart rendering                                 | Open-source chart library; attribution is retained. It supplies no market data.                                                                                         |

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

- Binance's public CORS-enabled market endpoints directly in the browser, polled every 30 seconds.
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
