# Stock Tracker — FIFO Portfolio (web app)

A React port of the Moomoo FIFO stock-tracker spreadsheet. Imports your existing
`.xlsm`, then lets you edit trades and prices in-app with everything recomputed
live by a tested FIFO engine.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for deployment (Vercel / Netlify — it's a static site):

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

To deploy: push to a repo and point Vercel/Netlify at it (framework preset: Vite),
or drag the `dist/` folder onto Netlify Drop.

## How it works

1. **Import** your `.xlsm` on the start screen. The parser reads SETUP (base
   currency, FX rates, start date), the Position Table roll-up, and every
   per-ticker transaction sheet.
2. **Dashboard** — portfolio value, unrealized / realized / total P/L, dividends,
   avg monthly P/L, top holdings, allocation donut, best/worst performers, market
   exposure by currency, gaining vs losing.
3. **Positions** — sortable table. Click any open-position price to edit inline;
   values recompute instantly. Click a position's trade count to open the ledger.
4. **Trade editor** — add/remove buys, sells, dividends, and splits. The FIFO
   engine recomputes ending shares, avg cost, and realized P/L as you type.

Data persists to `localStorage`, so edits survive reloads. Use "Re-import" to
start over from a workbook.

## Architecture

```
src/
  lib/
    fifo.js        FIFO lot-accounting engine (pure, fully tested)
    portfolio.js   position + portfolio aggregation, FX conversion
    importer.js    SheetJS .xlsm parser
    format.js      money / percent / P-L display helpers
  components/
    Dashboard.jsx    KPIs, charts, performers, exposure
    Positions.jsx    sortable table with inline price editing
    TradeEditor.jsx  ledger modal with live FIFO recompute
    ImportScreen.jsx drag-drop import / empty state
  App.jsx          state, localStorage, routing between views
```

### The FIFO engine (`src/lib/fifo.js`)

Walks transactions chronologically keeping a queue of open lots
`{ units, costPerUnit }`. Sells consume lots oldest-first, realizing P/L against
the consumed lots' cost. Buy fees fold into cost basis; sell fees reduce proceeds.
Splits scale every open lot.

Run the tests (they check against real spreadsheet values):

```bash
node test-fifo.mjs        # 15 assertions: NIO, SE, C6L, AMZN, splits, FIFO order
node test-import.mjs      # parses the .xlsm, prints positions
node test-portfolio.mjs   # reconciles KPIs against the dashboard
```

## Import vs. engine: which numbers win

On import, positions keep the Position Table's **summary** values for display
(`useImportedSummary: true`). This avoids re-deriving edge cases the spreadsheet
already resolved — fractional shares (e.g. GOOG's 0.0047 shares) and the
dividend-in-realized-P/L convention. The moment you edit a position's trades, that
flag clears and the FIFO engine becomes authoritative for it.

### Known data note: Realized P/L

The source workbook is internally inconsistent on realized P/L — the trade-currency
column, the SGD column, and the dashboard KPI each give a different total
(~S$18.6k / S$19.1k / S$21.3k), largely over how dividends are folded in. The app
shows the imported summary; the engine computes a clean "realized excluding
dividends, net of fees" figure. Decide which definition you want as canonical and
edit a position's trades to switch it onto the engine.

## Live quotes

Click **↻ Refresh quotes** in the top bar. Paste a free Finnhub API key (get one
at finnhub.io/register — stored locally in your browser only), choose open-only or
all positions, and refresh. Prices update in place and the dashboard recomputes.

The provider layer is pluggable — `src/lib/quotes.js` defines a one-function
interface `getQuote(symbol) -> { price } | null`. A Finnhub adapter ships built in.
Symbol mapping handles the tracker's suffixes: `_T`/no suffix → US ticker,
`_SGD` → `.SI` (SGX), numeric `_L` → `.HK` (HKEX).

**Coverage reality:** Finnhub's free tier resolves US tickers reliably. SGX (.SI)
and HKEX (.HK) symbols often aren't covered — those fail gracefully per-symbol and
keep their manual prices (the panel lists which were skipped). Refresh runs
sequentially with a small delay to respect the 60-calls/min free limit; a
rate-limit hit pauses cleanly and tells you to retry.

To swap providers: implement the `getQuote` shape against any source and pass it to
`refreshQuotes()`. If a provider blocks browser CORS, route it through a tiny
serverless function (one Vercel/Netlify endpoint) and point the adapter at that URL.

## Export back to .xlsx

Click **↓ Export .xlsx** to download a workbook mirroring the source structure:
SETUP (base currency, FX rates, start date), Position Table (with base-currency
columns), a Dashboard summary, and one sheet per ticker with full trade history.
Values are written rather than live formulas, so the file opens cleanly anywhere.
The export round-trips — re-importing it reproduces the same portfolio exactly.
