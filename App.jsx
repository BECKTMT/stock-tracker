import { useState, useEffect, useMemo } from "react";
import { computePortfolio } from "./lib/portfolio.js";
import { runFifo } from "./lib/fifo.js";
import { excelDateToISO } from "./lib/importer.js";
import Dashboard from "./components/Dashboard.jsx";
import Positions from "./components/Positions.jsx";
import TradeEditor from "./components/TradeEditor.jsx";
import ImportScreen from "./components/ImportScreen.jsx";
import QuotesPanel from "./components/QuotesPanel.jsx";
import { downloadWorkbook } from "./lib/export.js";

const STORAGE_KEY = "stock-tracker-v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Merge per-ticker transaction sheets into positions so the FIFO engine drives
// any position that has trade detail; others fall back to imported summaries.
function attachTransactions(data) {
  const byTicker = data.tickerSheets || {};
  // map sheet name -> ticker via symbol match where possible; sheet names are
  // usually the ticker root (e.g. "AAPL", "NIO"). We match by stripping suffixes.
  const positions = data.positions.map((p) => {
    const root = p.ticker.replace(/_[A-Z]+$/i, "").replace(/\s+/g, "").toUpperCase();
    let txns = byTicker[p.ticker] || byTicker[root];
    if (!txns) {
      const key = Object.keys(byTicker).find(
        (k) => k.replace(/\s+/g, "").toUpperCase() === root
      );
      txns = key ? byTicker[key] : null;
    }
    return txns && txns.length
      ? { ...p, transactions: txns, useImportedSummary: true }
      : p;
  });
  return { ...data, positions };
}

export default function App() {
  const [data, setData] = useState(() => loadState());
  const [tab, setTab] = useState("dashboard");
  const [editTicker, setEditTicker] = useState(null);
  const [showQuotes, setShowQuotes] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const portfolio = useMemo(() => {
    if (!data) return null;
    return computePortfolio(data.positions, data.fxRates, data.baseCurrency, data.startDate);
  }, [data]);

  if (!data) {
    return (
      <ImportScreen
        onImport={(d) => { setData(attachTransactions(d)); showToast("Workbook imported"); }}
        onDemo={() => setData({ baseCurrency: "SGD", fxRates: { "USD/SGD": 1.274, "HKD/SGD": 0.163, "SGD/SGD": 1 }, positions: [], tickerSheets: {}, startDate: new Date().toISOString().slice(0, 10), warnings: [] })}
      />
    );
  }

  const updatePrice = (ticker, price) => {
    if (Number.isNaN(price)) return;
    setData((d) => ({ ...d, positions: d.positions.map((p) => p.ticker === ticker ? { ...p, currentPrice: price, mktValue: null } : p) }));
    showToast(`${ticker} price updated`);
  };

  const applyQuotes = (prices) => {
    const tickers = Object.keys(prices);
    if (!tickers.length) return;
    setData((d) => ({
      ...d,
      positions: d.positions.map((p) =>
        prices[p.ticker] != null ? { ...p, currentPrice: prices[p.ticker], mktValue: null } : p),
      asOf: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    }));
  };

  const handleExport = () => {
    downloadWorkbook(data, portfolio, "stock-tracker-export.xlsx");
    showToast("Workbook exported");
  };

  const saveTrades = (ticker, transactions) => {
    setData((d) => ({
      ...d,
      positions: d.positions.map((p) => {
        if (p.ticker !== ticker) return p;
        const fifo = runFifo(transactions);
        return { ...p, transactions, useImportedSummary: false,
          shares: fifo.endingShares, avgCost: fifo.avgCost,
          realizedPL: fifo.realizedPL, dividends: fifo.netDividends, mktValue: null,
          unrealizedPL: null, returnPct: null,
          status: fifo.endingShares > 1e-9 ? "OPEN" : "CLOSED" };
      }),
    }));
    setEditTicker(null);
    showToast(`${ticker} trades saved`);
  };

  const editingPos = editTicker ? portfolio.computed.find((p) => p.ticker === editTicker) : null;
  const asOf = data.asOf || "27 May 2026";
  const fx = data.fxRates;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Stock Tracker</div>
            <div className="brand-sub">FIFO · {data.baseCurrency} base</div>
          </div>
        </div>
        <nav className="nav">
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={tab === "positions" ? "active" : ""} onClick={() => setTab("positions")}>Positions</button>
        </nav>
        <div className="topbar-right">
          <span className="fx-chip">USD/SGD {fx["USD/SGD"]} · HKD/SGD {fx["HKD/SGD"]}</span>
          <button className="btn btn-sm" onClick={() => setShowQuotes(true)}>↻ Refresh quotes</button>
          <button className="btn btn-sm" onClick={handleExport}>↓ Export .xlsx</button>
          <button className="btn btn-sm" onClick={() => { if (confirm("Re-import a workbook? Current in-app edits will be replaced.")) { localStorage.removeItem(STORAGE_KEY); setData(null); } }}>Re-import</button>
        </div>
      </div>

      <div className="content">
        {data.warnings?.length > 0 && tab === "dashboard" && (
          <div className="warn-banner">
            <strong>{data.warnings.length} data {data.warnings.length === 1 ? "flag" : "flags"} on import.</strong>{" "}
            {data.warnings.slice(0, 3).join("; ")}{data.warnings.length > 3 ? "…" : ""}
          </div>
        )}

        {tab === "dashboard" && <Dashboard portfolio={portfolio} base={data.baseCurrency} asOf={asOf} />}
        {tab === "positions" && (
          <Positions portfolio={portfolio} base={data.baseCurrency}
            onPriceEdit={updatePrice} onOpenTrades={setEditTicker} />
        )}
      </div>

      {editingPos && (
        <TradeEditor position={editingPos} onClose={() => setEditTicker(null)} onSave={saveTrades} />
      )}
      {showQuotes && (
        <QuotesPanel positions={portfolio.computed} onClose={() => setShowQuotes(false)} onPrices={applyQuotes} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
