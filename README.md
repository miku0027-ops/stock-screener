# Atlas Markets

A responsive, single-screen market heatmap for understanding the markets around Bitcoin. Built with React, Vite, Express, D3 treemaps, and TradingView Lightweight Charts. All integrations use free public endpoints; no API keys or paid chart subscriptions are required.

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

During initial development, the cloud network policy denied both providers. The real `/api/markets` check returned zero available quotes, as expected; **successful external live-feed validation is still pending network access**. The required domains have been saved to the cloud environment draft. Review and save environment settings, then publish to activate the reusable environment. Retry **Connect live** afterward; feed availability still depends on the providers.

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
