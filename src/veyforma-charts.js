/*!
 * Veyforma Charts
 * One entry point for every chart in this package. Each chart is also available
 * on its own global (VeyHeatmap, VeyRiskTornado, VeyPlaAttribution, VeyDebtLadder, VeyAccumulation).
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 */
(function (root) {
  "use strict";

  function need(name) {
    var lib = root[name];
    if (!lib) throw new Error("VeyformaCharts: " + name + " is not loaded. Load its script before veyforma-charts.js, or use the bundled dist/veyforma-charts.js.");
    return lib;
  }

  root.VeyformaCharts = {
    version: "1.2.0",
    /** Exposure heatmap: concentrations by any two fields, e.g. sector × country. */
    heatmap: function (target, options) { return need("VeyHeatmap").create(target, options); },
    /** Risk-factor tornado: down and up impact per factor, with convexity, limits and hedges. */
    tornado: function (target, options) { return need("VeyRiskTornado").create(target, options); },
    /** P&L attribution: HPL vs RTPL by factor, with the FRTB PLA test and the path to green. */
    plaAttribution: function (target, options) { return need("VeyPlaAttribution").create(target, options); },
    /** Debt maturity ladder: maturities by year or quarter, refinancing walls and liquidity cover. */
    debtLadder: function (target, options) { return need("VeyDebtLadder").create(target, options); },
    /** Exposure accumulation map: insured value one event could hit, anywhere on the map, against a limit. */
    accumulationMap: function (target, options) { return need("VeyAccumulation").create(target, options); }
  };
})(typeof window !== "undefined" ? window : this);
