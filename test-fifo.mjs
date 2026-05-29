import { runFifo, positionMetrics } from "./src/lib/fifo.js";

let pass = 0, fail = 0;
function check(label, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}, want ${want}`);
  ok ? pass++ : fail++;
}

// --- NIO: bought 1.7 then 5.1 units @ price 0, sold all 6.8 @ 4.5912, fee 1.14 ---
// Sheet: REALIZED P/L = 30.08016, ending shares 0, dividends 0
const nio = runFifo([
  { date: 45429, buyPrice: 0, units: 1.7, fees: 0, seq: 1 },
  { date: 45518, buyPrice: 0, units: 5.1, fees: 0, seq: 2 },
  { date: 45540, sellPrice: 4.5912, units: 6.8, fees: 1.14, seq: 3 },
]);
check("NIO realized P/L", nio.realizedPL, 30.08016);
check("NIO ending shares", nio.endingShares, 0);

// --- SE: bought 0.2 + 0.6, sold 0.8 @ 79.82, fee 0.71 ---
// Sheet: REALIZED P/L = 63.146
const se = runFifo([
  { date: 45429, buyPrice: 0, units: 0.2, fees: 0, seq: 1 },
  { date: 45518, buyPrice: 0, units: 0.6, fees: 0, seq: 2 },
  { date: 45547, sellPrice: 79.82, units: 0.8, fees: 0.71, seq: 3 },
]);
check("SE realized P/L", se.realizedPL, 63.146);
check("SE ending shares", se.endingShares, 0);

// --- C6L (SIA): OPEN position. 1400 shares, avg cost 6.36373, price 6.64 ---
// Sheet: mkt value 9296, unrealized 386.777, dividends 294, realized(excl div) -294
// Simplest reconstruction: one buy of 1400 @ 6.363730642857 incl fees, dividend 294.
const c6l = runFifo([
  { date: 45000, buyPrice: 6.363730642857143, units: 1400, fees: 0, seq: 1 },
  { date: 45100, divPerShare: 0.21, divQty: 1400, tax: 0, seq: 2 },
]);
const c6lm = positionMetrics(c6l, 6.64, 1);
check("C6L shares", c6lm.shares, 1400);
check("C6L mkt value", c6lm.mktValue, 9296, 1);
check("C6L unrealized", c6lm.unrealizedPL, 386.78, 1);
check("C6L dividends", c6lm.dividends, 294, 0.5);

// --- AMZN: 4 shares @ avg 196.6357 (ex fee), +7.75 fee, price 265.29 ---
// Sheet trade-ccy: mkt value 1061.16, unrealized 274.617, realized 633.715? (no — that's a prior partial)
const amzn = runFifo([
  { date: 45000, buyPrice: 196.63566666666665, units: 4, fees: 7.75, seq: 1 },
]);
const am = positionMetrics(amzn, 265.29, 1.274);
check("AMZN shares", am.shares, 4);
check("AMZN mkt value (trade ccy)", am.mktValue, 1061.16, 1);

// --- Split test: buy 10 @ $100, 2:1 split, should be 20 @ $50 ---
const split = runFifo([
  { date: 45000, buyPrice: 100, units: 10, fees: 0, seq: 1 },
  { date: 45100, splitRatio: 2, seq: 2 },
]);
check("Split shares", split.endingShares, 20);
check("Split avg cost", split.avgCost, 50);

// --- FIFO ordering: buy 10@$10, buy 10@$20, sell 15@$30 ---
// FIFO cost of sold = 10*10 + 5*20 = 200; proceeds = 450; realized = 250
const fifoTest = runFifo([
  { date: 45000, buyPrice: 10, units: 10, fees: 0, seq: 1 },
  { date: 45100, buyPrice: 20, units: 10, fees: 0, seq: 2 },
  { date: 45200, sellPrice: 30, units: 15, fees: 0, seq: 3 },
]);
check("FIFO realized P/L", fifoTest.realizedPL, 250);
check("FIFO remaining shares", fifoTest.endingShares, 5);
check("FIFO remaining cost (should be $20 lot)", fifoTest.avgCost, 20);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
