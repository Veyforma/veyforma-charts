/*! @veyforma/charts v1.0.1 · MIT License · Copyright (c) 2026 Veyforma · https://github.com/veyforma/veyforma-charts */
/*!
 * Veyforma Exposure Heatmap v1.2.0
 * A dependency-free heatmap that reveals concentrations, for example
 * exposure by sector and country, or by sector and rating.
 * Original work created for Veyforma. Contains no third-party code.
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 *
 * File layout
 *   1. Themes ............ colour scale, fonts and shapes (edit or add your own)
 *   2. Helpers ........... colours, formatting, measuring
 *   3. Calculation ....... pivot, ordering, "Other" grouping, concentration
 *   4. Chart instance .... drawing, summary, legend, tooltips, keyboard, resizing
 *   5. Export and notes .. data for the Veyforma Toolkit menu (optional file)
 *   6. Public API ........ window.VeyHeatmap
 *
 * Load veyforma-toolkit.js as well to get the chart menu: full screen, print,
 * PNG, JPEG, SVG, PDF, CSV and Excel downloads, copy and notes.
 */
(function (root) {
  "use strict";

  var VERSION = "1.2.0";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var instanceCount = 0;

  /* ======================================================================
     1. THEMES
     The colour scale runs from "low" through "mid" to "high". Scale colours
     must be hex values, such as "#9a3412", so they can be blended.
     ====================================================================== */
  var BASE_THEME = {
    low: "#fbf1ea",               // smallest values
    mid: "#ef8a54",               // middle of the scale
    high: "#9a3412",              // largest values
    empty: "#ffffff",             // cells with no exposure (drawn with a dashed outline)
    limit: "#111111",             // outline of cells above the concentration limit
    cellText: "#000000",          // numbers on light cells (pure black and white keep 4.5:1 on any cell)
    cellTextOnDark: "#ffffff",    // numbers on dark cells
    totalBar: "#111111",          // data bars behind the totals
    totalBarOpacity: 0.12,        // strength of those data bars
    headerText: "#555555",        // row and column names
    text: "#111111",              // totals, legend and summary values
    mutedText: "#6b6b6b",         // secondary text
    summaryBackground: "#f6f6f6", // background of the summary figures
    background: "transparent",    // chart background
    tooltipBackground: "#111111",
    tooltipText: "#ffffff",
    focus: "#2563eb",             // keyboard focus ring
    fontFamily: "inherit",        // "inherit" uses the page font
    fontSize: 12,                 // base text size in pixels
    cellRadius: 3,                // corner rounding of cells
    cellGap: 2                    // space between cells in pixels
  };

  var THEMES = {
    veyforma: {},
    mono: {
      low: "#f4f4f4", mid: "#9a9a9a", high: "#111111", empty: "#ffffff", limit: "#111111"
    },
    "colour-safe": {
      low: "#eef3fb", mid: "#6d9be0", high: "#1d3f8f", limit: "#d9730d"
    },
    ocean: {
      low: "#ecf6f8", mid: "#5aaec0", high: "#0c3b5e", limit: "#be123c", summaryBackground: "#eef5f8"
    },
    forest: {
      low: "#f1f5ea", mid: "#8fb36b", high: "#22441a", limit: "#a8590b", summaryBackground: "#f2f4ee"
    },
    corporate: {
      low: "#eef1f6", mid: "#8195b8", high: "#1e3a6e", limit: "#b91c1c", summaryBackground: "#f1f4f8", cellRadius: 0
    },
    midnight: {
      background: "#111418", low: "#1e242c", mid: "#2f6aa8", high: "#9cd0ff", empty: "#111418",
      limit: "#fbbf24", cellText: "#000000", cellTextOnDark: "#ffffff", totalBar: "#9cd0ff", totalBarOpacity: 0.18,
      headerText: "#c3c9d2", text: "#f3f4f6", mutedText: "#a3abb8", summaryBackground: "#1b2027",
      tooltipBackground: "#f3f4f6", tooltipText: "#111418", focus: "#93c5fd"
    }
  };

  function resolveTheme(theme) {
    if (theme == null || theme === "") theme = "veyforma";
    if (typeof theme === "string") {
      if (!THEMES.hasOwnProperty(theme)) {
        warn('Unknown theme "' + theme + '". The "veyforma" theme is used instead.');
        theme = "veyforma";
      }
      return assign({}, BASE_THEME, THEMES[theme]);
    }
    if (typeof theme !== "object") {
      warn("The theme option must be a theme name or an object.");
      return assign({}, BASE_THEME);
    }
    var base = theme["extends"] ? resolveTheme(theme["extends"]) : assign({}, BASE_THEME);
    var out = assign(base, theme);
    delete out["extends"];
    ["low", "mid", "high", "empty"].forEach(function (k) {
      if (!parseHex(out[k])) {
        warn('Theme colour "' + k + '" must be a hex value such as "#9a3412". The default is used instead.');
        out[k] = BASE_THEME[k];
      }
    });
    return out;
  }

  /* ======================================================================
     2. HELPERS
     ====================================================================== */
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function warn(msg) { if (root.console) root.console.warn("VeyHeatmap: " + msg); }
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function htmlEl(tag, className, parent) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (parent) parent.appendChild(n);
    return n;
  }

  function parseHex(hex) {
    if (typeof hex !== "string") return null;
    var h = hex.trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(rgb) {
    return "#" + rgb.map(function (v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function makeRamp(theme) {
    var lo = parseHex(theme.low), md = parseHex(theme.mid), hi = parseHex(theme.high);
    return function (t) {
      t = clamp(t, 0, 1);
      return toHex(t < 0.5 ? mix(lo, md, t * 2) : mix(md, hi, (t - 0.5) * 2));
    };
  }
  /** Contrast ratio between two hex colours (1 to 21), as defined by WCAG. */
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function luminance(hex) {
    var c = parseHex(hex);
    if (!c) return 1;
    var lin = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  var measureCtx = null;
  function textWidth(text, sizePx, weight, family) {
    if (!measureCtx) {
      var c = document.createElement("canvas");
      measureCtx = c.getContext && c.getContext("2d");
    }
    if (!measureCtx) return String(text).length * sizePx * 0.6;
    measureCtx.font = (weight || 400) + " " + sizePx + "px " + family;
    return measureCtx.measureText(String(text)).width;
  }
  function ellipsis(text, maxW, size, weight, family) {
    text = String(text);
    if (textWidth(text, size, weight, family) <= maxW) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (textWidth(text.slice(0, mid) + "…", size, weight, family) <= maxW) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? text.slice(0, lo).replace(/\s+$/, "") + "…" : "";
  }
  function wrapTwo(text, maxW, size, weight, family) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (textWidth(test, size, weight, family) > maxW && cur) { lines.push(cur); cur = words[i]; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    var ok = lines.length <= 2 && lines.every(function (l) { return textWidth(l, size, weight, family) <= maxW; });
    return ok ? lines : null;
  }
  function pct(share) {
    var v = Math.round(share * 10000) / 100;
    return String(v) + "%";
  }

  function makeFormatters(data, locale) {
    var decimals = data.decimals != null ? data.decimals : 0;
    var prefix = data.prefix || "", suffix = data.suffix || "";
    var cache = {};
    function nf(key, opts) {
      if (!cache[key]) cache[key] = new Intl.NumberFormat(locale || undefined, opts);
      return cache[key];
    }
    function value(v, d) {
      if (d == null) d = decimals;
      var step = Math.pow(10, -d);
      // A positive amount that would round to zero is shown as "<$0.1bn" rather than "$0.0bn".
      if (v > 0 && v < step / 2) return "<" + prefix + nf("f" + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(step) + suffix;
      var body = prefix + nf("f" + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v)) + suffix;
      if (v >= 0) return body;
      // Negative numbers: "minus" (default) or "brackets", as in accounts.
      return data.negatives === "brackets" ? "(" + body + ")" : "−" + body;
    }
    function compact(v) {
      // With a unit suffix such as "m", shorten by dropping decimals rather than adding "K" or "M".
      if (suffix) return value(v, 0);
      return (v < 0 ? "−" : "") + prefix + nf("c", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v));
    }
    function percent(share, d) {
      if (d == null) d = 1;
      return nf("p" + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(share * 100) + "%";
    }
    function count(n) { return nf("n", { maximumFractionDigits: 0 }).format(n); }
    return { value: value, compact: compact, percent: percent, count: count };
  }

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) { return values[k] != null ? values[k] : m; });
  }

  /* ======================================================================
     3. CALCULATION
     Records such as { sector: "Energy", country: "Norway", rating: "BBB", value: 120 }
     are summed into a grid. You choose which field forms the rows and which
     the columns. Values must be zero or more.
     ====================================================================== */
  var OTHER_KEY = "\u0000other";

  function normaliseData(data) {
    if (Array.isArray(data.values)) {
      var rl = data.rowLabels, cl = data.columnLabels;
      var cached = aggCache && aggCache.get(data.values);
      if (cached && cached.grid && cached.gridRows === rl && cached.gridCols === cl) return cached.grid;
      if (!Array.isArray(rl) || !Array.isArray(cl)) throw new Error("VeyHeatmap: a values grid needs rowLabels and columnLabels.");
      if (data.values.length !== rl.length) throw new Error("VeyHeatmap: values has " + data.values.length + " rows but rowLabels has " + rl.length + ".");
      var recs = [];
      data.values.forEach(function (row, r) {
        if (!Array.isArray(row) || row.length !== cl.length) throw new Error("VeyHeatmap: row " + (r + 1) + " of values needs " + cl.length + " numbers.");
        row.forEach(function (v, c) { recs.push({ row: rl[r], column: cl[c], value: v }); });
      });
      var grid = {
        records: recs, rows: "row", columns: "column",
        dimensions: {
          row: { label: data.rowTitle || "Row", order: rl.slice(), ordered: true },
          column: { label: data.columnTitle || "Column", order: cl.slice(), ordered: true }
        }
      };
      if (aggCache) {
        var bucket = aggCache.get(data.values) || {};
        bucket.grid = grid; bucket.gridRows = rl; bucket.gridCols = cl;
        aggCache.set(data.values, bucket);
      }
      return grid;
    }
    if (!Array.isArray(data.records) || !data.records.length) {
      throw new Error("VeyHeatmap: data needs records, or values with rowLabels and columnLabels.");
    }
    var keys = Object.keys(data.records[0]).filter(function (k) { return k !== "value"; });
    var dims = assign({}, data.dimensions || {});
    keys.forEach(function (k) { if (!dims[k]) dims[k] = { label: k.charAt(0).toUpperCase() + k.slice(1) }; });
    return { records: data.records, rows: data.rows || keys[0], columns: data.columns || keys[1], dimensions: dims };
  }

  // Sums are cached per records array (or values grid) and per pair of fields, so
  // changing the theme, display mode, limit, grouping or screen size never re-reads
  // the records. If you change the records in place, call chart.setData() to clear it.
  var aggCache = typeof WeakMap === "function" ? new WeakMap() : null;

  function aggregate(nd, rk, ck, source) {
    var key = rk + "\u0001" + ck, bucket = aggCache && source ? aggCache.get(source) : null;
    if (bucket && bucket[key]) return bucket[key];
    var cells = new Map(), rowTot = new Map(), colTot = new Map(), total = 0;
    var recs = nd.records, n = recs.length;
    for (var i = 0; i < n; i++) {
      var rec = recs[i], r = rec[rk], c = rec[ck];
      if (r == null || r === "") throw new Error("VeyHeatmap: record " + (i + 1) + ' has no "' + rk + '".');
      if (c == null || c === "") throw new Error("VeyHeatmap: record " + (i + 1) + ' has no "' + ck + '".');
      var raw = rec.value, v = typeof raw === "number" ? raw : Number(raw);
      if (raw === null || raw === undefined || raw === "" || !isFinite(v)) {
        throw new Error("VeyHeatmap: record " + (i + 1) + " has no numeric value.");
      }
      if (v < 0) throw new Error("VeyHeatmap: record " + (i + 1) + " is negative. Exposure values must be zero or more.");
      if (typeof r !== "string") r = String(r);
      if (typeof c !== "string") c = String(c);
      var row = cells.get(r);
      if (!row) { row = new Map(); cells.set(r, row); rowTot.set(r, 0); }
      row.set(c, (row.get(c) || 0) + v);
      rowTot.set(r, rowTot.get(r) + v);
      colTot.set(c, (colTot.get(c) || 0) + v);
      total += v;
    }
    var toObj = function (m) { var o = {}; m.forEach(function (v, k) { o[k] = v; }); return o; };
    var result = {
      cell: function (r, c) { var row = cells.get(r); return row ? (row.get(c) || 0) : 0; },
      rowTot: toObj(rowTot), colTot: toObj(colTot),
      rowSeen: Array.from(rowTot.keys()), colSeen: Array.from(colTot.keys()), total: total
    };
    if (aggCache && source) {
      if (!bucket) { bucket = {}; aggCache.set(source, bucket); }
      bucket[key] = result;
    }
    return result;
  }

  function buildPivot(data, o, L) {
    var nd = normaliseData(data);
    var rk = o.rows || nd.rows, ck = o.columns || nd.columns;
    if (!rk || !ck) throw new Error("VeyHeatmap: choose a field for the rows and a field for the columns.");
    if (rk === ck) throw new Error('VeyHeatmap: rows and columns cannot both use "' + rk + '".');
    var dR = assign({ label: rk }, nd.dimensions[rk]), dC = assign({ label: ck }, nd.dimensions[ck]);
    var agg = aggregate(nd, rk, ck, Array.isArray(data.values) ? data.values : data.records);
    var rowTot = agg.rowTot, colTot = agg.colTot, rowSeen = agg.rowSeen, colSeen = agg.colSeen, total = agg.total;

    function arrange(seen, totals, dim, sortMode, top) {
      var natural = seen.slice();
      if (Array.isArray(dim.order)) {
        var ord = dim.order.map(String);
        natural.sort(function (a, b) {
          var ia = ord.indexOf(a), ib = ord.indexOf(b);
          if (ia < 0) ia = ord.length + seen.indexOf(a);
          if (ib < 0) ib = ord.length + seen.indexOf(b);
          return ia - ib;
        });
      }
      var byTotal = natural.slice().sort(function (a, b) { return totals[b] - totals[a] || natural.indexOf(a) - natural.indexOf(b); });
      var useTotal = sortMode === "total" || (sortMode !== "natural" && !dim.ordered);
      var list = useTotal ? byTotal : natural;
      var groups = list.map(function (k) { return { key: k, label: k, members: [k] }; });
      if (top && top > 0 && list.length > top + 1) {
        var keep = byTotal.slice(0, top);
        var kept = list.filter(function (k) { return keep.indexOf(k) >= 0; });
        var rest = list.filter(function (k) { return keep.indexOf(k) < 0; });
        groups = kept.map(function (k) { return { key: k, label: k, members: [k] }; });
        groups.push({ key: OTHER_KEY, label: fill(L.other, { count: rest.length }), members: rest, other: true });
      }
      groups.forEach(function (g) { g.total = g.members.reduce(function (s, k) { return s + totals[k]; }, 0); });
      return groups;
    }

    var rows = arrange(rowSeen, rowTot, dR, o.sortRows, o.topRows);
    var cols = arrange(colSeen, colTot, dC, o.sortColumns, o.topColumns);
    var values = rows.map(function (rg) {
      return cols.map(function (cg) {
        var s = 0;
        rg.members.forEach(function (r) { cg.members.forEach(function (c) { s += agg.cell(r, c); }); });
        return s;
      });
    });
    return { rowKey: rk, colKey: ck, rowDim: dR, colDim: dC, rows: rows, cols: cols, values: values, total: total };
  }

  function concentration(p, limitShare) {
    var cells = [], hhi = 0;
    p.values.forEach(function (row, r) {
      row.forEach(function (v, c) {
        var share = p.total > 0 ? v / p.total : 0;
        hhi += share * share * 10000;
        cells.push({ r: r, c: c, value: v, share: share });
      });
    });
    cells.sort(function (a, b) { return b.value - a.value; });
    var top5 = cells.slice(0, 5).reduce(function (s, x) { return s + x.share; }, 0);
    var above = limitShare > 0 ? cells.filter(function (x) { return x.share > limitShare + 1e-12; }) : [];
    return { hhi: hhi, effective: hhi > 0 ? 10000 / hhi : 0, largest: cells[0], top5: top5, above: above };
  }

  /* ======================================================================
     4. CHART INSTANCE
     ====================================================================== */
  var DEFAULT_OPTIONS = {
    data: null,             // required, see the user manual
    theme: "veyforma",      // theme name or theme object
    locale: undefined,      // e.g. "en-GB"; default is the visitor's locale
    rows: undefined,        // field for the rows; overrides data.rows
    columns: undefined,     // field for the columns; overrides data.columns
    valueMode: "amount",    // "amount", "shareOfTotal", "shareOfRow" or "shareOfColumn"
    scale: "linear",        // "linear" or "sqrt" (brings out small values)
    sortRows: "auto",       // "auto", "total" or "natural"
    sortColumns: "auto",    // "auto", "total" or "natural"
    topRows: 0,             // keep the largest N rows and group the rest as "Other"; 0 keeps all
    topColumns: 0,          // the same for columns
    fit: "auto",            // narrow screens: "auto" groups small columns into Other (scrolls ordered ones such as ratings), "group" or "scroll"
    limit: undefined,       // share of total, e.g. 0.05; overrides data.limit
    totals: true,           // show row and column totals
    cellLabels: "auto",     // "auto" shows numbers where they fit; true or false
    cellHeight: undefined,  // pixels; default 34 (28 on small screens)
    summary: true,          // show the key figures above the chart
    legend: true,           // show the colour legend
    tooltip: true,          // tooltips on hover, tap and keyboard focus
    animate: true,          // cells fade in on first draw and when the data changes
    labels: null,           // wording, see DEFAULT_LABELS
    ariaLabel: undefined,   // screen-reader description; default uses data.title
    tooltipFormatter: null, // function (cell, format) -> string or array of strings
    onClick: null,          // function (cell, event)
    caption: true,          // explanation under the chart: true (built-in), your own text, or false
    annotations: null,      // notes, e.g. [{ row: "Energy", column: "United Kingdom", text: "Hedged in Q3" }]
    onAnnotationsChange: null, // function (notes) called when a note is added or removed from the menu
    toolbar: true           // chart menu from veyforma-toolkit.js: true, false or toolbar settings
  };
  var DEFAULT_LABELS = {
    total: "Total", other: "Other ({count})", empty: "No exposure",
    totalExposure: "Total exposure", largest: "Largest concentration", hhi: "Concentration (HHI)",
    aboveLimit: "Above limit", top5: "Top 5 cells",
    hhiNote: "Like {n} equal-sized cells", aboveNote: "Cells above {limit} of total",
    gridNote: "{rows} {rowDim} × {cols} {colDim}", top5Note: "Share of total exposure",
    exposure: "Exposure", shareOfTotal: "Share of total", shareOfRow: "Share of {row}", shareOfColumn: "Share of {column}",
    limitLegend: "Above {limit} limit", limitTip: "Above the {limit} limit", rowTotalTip: "{label} total",
    scrollNote: "Scroll sideways to see all {columns}.",
    groupNote: "Smaller {columns} are grouped as Other to fit this screen. Tap an Other cell to see which.",
    includes: "Other includes {list}"
  };

  function injectStyles() {
    if (document.getElementById("vhm-styles")) return;
    var css =
      ".vhm{position:relative;color:var(--vhm-text);background:var(--vhm-bg);font-family:var(--vhm-font);line-height:1.4}" +
      ".vhm.vhm-filled{padding:14px 14px 8px;border-radius:10px}" +
      ".vhm-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 12px}" +
      ".vhm-stat{background:var(--vhm-summary-bg);border-radius:10px;padding:10px 12px;min-width:0}" +
      ".vhm-stat-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--vhm-muted)}" +
      ".vhm-stat-value{font-size:20px;font-weight:650;letter-spacing:-.01em;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".vhm-stat-note{font-size:11.5px;color:var(--vhm-muted);margin-top:1px;overflow-wrap:anywhere}" +
      ".vhm-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;font-size:12px;margin:0 0 10px}" +
      ".vhm-legend>span{display:inline-flex;align-items:center;gap:6px}" +
      ".vhm-legend .vhm-ramp{display:inline-flex;flex-direction:column;align-items:stretch;gap:2px}" +
      ".vhm-ramp-bar{width:150px;height:10px;border-radius:3px}" +
      ".vhm-ramp-ticks{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--vhm-muted);font-variant-numeric:tabular-nums}" +
      ".vhm-plot-host{overflow-x:auto;-webkit-overflow-scrolling:touch}" +
      ".vhm-plot{display:block;overflow:visible;outline:none}" +
      ".vhm-plot:focus-visible{outline:2px solid var(--vhm-focus);outline-offset:4px;border-radius:4px}" +
      ".vhm-animate .vhm-cell{animation:vhm-fade .45s ease both}" +
      "@keyframes vhm-fade{from{opacity:0}to{opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.vhm-animate .vhm-cell{animation:none}}" +
      ".vhm-scroll-note{font-size:11.5px;color:var(--vhm-muted);margin-top:4px}" +
      ".vhm-tip{position:absolute;left:0;top:0;pointer-events:none;background:var(--vhm-tip-bg);color:var(--vhm-tip-text);" +
      "font-size:12px;line-height:1.45;padding:8px 10px;border-radius:8px;opacity:0;transform:translateY(4px);" +
      "transition:opacity .12s,transform .12s;white-space:nowrap;z-index:5}" +
      ".vhm-tip.vhm-on{opacity:1;transform:none}" +
      ".vhm-tip b{font-weight:600}" +
      ".vhm-table{width:100%;border-collapse:collapse;font-size:13px}" +
      ".vhm-table th,.vhm-table td{text-align:right;padding:7px 6px;border-bottom:1px solid rgba(127,127,127,.25);font-variant-numeric:tabular-nums;white-space:nowrap}" +
      ".vhm-table th:first-child,.vhm-table td:first-child{text-align:left}" +
      ".vhm-table th{font-weight:600;font-size:12px}" +
      ".vhm-table tr.vhm-total td{font-weight:600}";
    var style = document.createElement("style");
    style.id = "vhm-styles";
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
  }

  function Chart(target, options) {
    var container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container || container.nodeType !== 1) throw new Error("VeyHeatmap: container not found (" + target + ").");
    if (!options || !options.data) throw new Error("VeyHeatmap: options.data is required.");
    injectStyles();
    this.id = ++instanceCount;
    this.container = container;
    this.options = assign({}, DEFAULT_OPTIONS, options);
    this.element = htmlEl("div", "vhm");
    this.summaryEl = htmlEl("div", "vhm-summary", this.element);
    this.legendEl = htmlEl("div", "vhm-legend", this.element);
    this.plotHost = htmlEl("div", "vhm-plot-host", this.element);
    this.noteEl = htmlEl("div", "vhm-scroll-note", this.element);
    this.tipEl = htmlEl("div", "vhm-tip", this.element);
    this.tipEl.setAttribute("role", "tooltip");
    this.tipEl.id = "vhm-tip-" + this.id;
    container.appendChild(this.element);
    this._animateNext = !!this.options.animate;
    this._lastWidth = 0;
    this._active = null;

    var self = this;
    if (root.ResizeObserver) {
      this._observer = new root.ResizeObserver(function () {
        var w = Math.round(self.element.clientWidth);
        if (w && w !== self._lastWidth) self.redraw();
      });
      this._observer.observe(this.element);
    } else {
      this._onResize = function () { self.redraw(); };
      root.addEventListener("resize", this._onResize);
    }
    this._onDocTap = function (e) { if (!self.element.contains(e.target)) self._hideTip(); };
    document.addEventListener("pointerdown", this._onDocTap);
    this.redraw();
    if (this.options.toolbar !== false && root.VeyformaToolkit) this.toolkit = root.VeyformaToolkit.attach(this, this.options.toolbar);
  }

  Chart.prototype.update = function (partial) {
    if (!partial) return this;
    if (partial.data && partial.data !== this.options.data && this.options.animate) { this._animateNext = true; this._active = null; }
    if (partial.rows || partial.columns || partial.topRows != null || partial.topColumns != null) this._active = null;
    if (partial.animate === true) this._animateNext = true;
    assign(this.options, partial);
    return this.redraw();
  };
  /** Replaces the data and recalculates from scratch, even if the same records were changed in place. */
  Chart.prototype.setData = function (data) {
    if (aggCache && data) {
      if (Array.isArray(data.records)) aggCache["delete"](data.records);
      if (Array.isArray(data.values)) aggCache["delete"](data.values);
    }
    return this.update({ data: data });
  };
  Chart.prototype.setTheme = function (theme) { return this.update({ theme: theme }); };
  Chart.prototype.getTheme = function () { return resolveTheme(this.options.theme); };

  Chart.prototype._labels = function () { return assign({}, DEFAULT_LABELS, this.options.labels); };
  Chart.prototype._limit = function () {
    var o = this.options, l = o.limit !== undefined ? o.limit : (o.data.limit && o.data.limit.share);
    l = Number(l);
    return isFinite(l) && l > 0 && l < 1 ? l : 0;
  };

  /** The grid as plain objects: rows, columns, values and totals. */
  Chart.prototype.getMatrix = function () {
    var p = buildPivot(this.options.data, this.options, this._labels());
    var strip = function (g) { return { key: g.key === OTHER_KEY ? null : g.key, label: g.label, total: g.total, other: !!g.other, members: g.members.slice() }; };
    return {
      rowField: p.rowKey, columnField: p.colKey,
      rows: p.rows.map(strip), columns: p.cols.map(strip),
      values: p.values.map(function (r) { return r.slice(); }), total: p.total
    };
  };

  /** Concentration figures for the current grid. */
  Chart.prototype.getStats = function () {
    var p = buildPivot(this.options.data, assign({}, this.options, { topRows: 0, topColumns: 0 }), this._labels());
    var lim = this._limit(), c = concentration(p, lim);
    var cellOut = function (x) { return { row: p.rows[x.r].label, column: p.cols[x.c].label, value: x.value, share: x.share }; };
    return {
      total: p.total, rows: p.rows.length, columns: p.cols.length,
      hhi: c.hhi, effectiveCells: c.effective, top5Share: c.top5,
      largest: c.largest ? cellOut(c.largest) : null,
      limit: lim || null, aboveLimit: c.above.map(cellOut)
    };
  };

  Chart.prototype.createTable = function () {
    var o = this.options, data = o.data, L = this._labels();
    var p = buildPivot(data, o, L), f = makeFormatters(data, o.locale);
    var table = document.createElement("table");
    table.className = "vhm-table";
    if (data.title) {
      var cap = htmlEl("caption", null, table);
      cap.textContent = data.title;
      cap.style.cssText = "text-align:left;font-weight:600;padding:0 6px 6px";
    }
    var head = htmlEl("tr", null, htmlEl("thead", null, table));
    var th0 = htmlEl("th", null, head); th0.scope = "col"; th0.textContent = p.rowDim.label;
    p.cols.forEach(function (c) { var th = htmlEl("th", null, head); th.scope = "col"; th.textContent = c.label; });
    var thT = htmlEl("th", null, head); thT.scope = "col"; thT.textContent = L.total;
    var body = htmlEl("tbody", null, table);
    p.rows.forEach(function (r, ri) {
      var tr = htmlEl("tr", null, body);
      var th = htmlEl("th", null, tr); th.scope = "row"; th.textContent = r.label; th.style.textAlign = "left"; th.style.fontWeight = "400";
      p.values[ri].forEach(function (v) { htmlEl("td", null, tr).textContent = v ? f.value(v) : "—"; });
      htmlEl("td", null, tr).textContent = f.value(r.total);
    });
    var trT = htmlEl("tr", "vhm-total", body);
    htmlEl("td", null, trT).textContent = L.total;
    p.cols.forEach(function (c) { htmlEl("td", null, trT).textContent = f.value(c.total); });
    htmlEl("td", null, trT).textContent = f.value(p.total);
    return table;
  };

  Chart.prototype.destroy = function () {
    if (this.toolkit) this.toolkit.destroy();
    if (this._observer) this._observer.disconnect();
    if (this._onResize) root.removeEventListener("resize", this._onResize);
    document.removeEventListener("pointerdown", this._onDocTap);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  };

  Chart.prototype._hideTip = function () {
    this.tipEl.classList.remove("vhm-on");
    if (this._focusRect) this._focusRect.setAttribute("opacity", 0);
    if (this._boldReset) this._boldReset();
  };

  Chart.prototype._placeTip = function (lines, anchor, evt) {
    var tip = this.tipEl;
    tip.textContent = "";
    lines.forEach(function (ln, i) {
      if (i) tip.appendChild(document.createElement("br"));
      var node = i === 0 ? document.createElement("b") : document.createTextNode("");
      node.textContent = ln;
      tip.appendChild(node);
    });
    var box = this.element.getBoundingClientRect();
    var px = evt && evt.clientX ? evt.clientX : anchor.left + anchor.width / 2;
    var py = evt && evt.clientY ? evt.clientY : anchor.top;
    tip.classList.add("vhm-on");
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = clamp(px - box.left - tw / 2, 4, Math.max(4, box.width - tw - 4));
    var top = py - box.top - th - 14;
    if (top < 0) top = (anchor.bottom != null ? anchor.bottom : py) - box.top + 10;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  };

  Chart.prototype.redraw = function () {
    var o = this.options, data = o.data, self = this;
    var theme = resolveTheme(o.theme), L = this._labels();
    var p = buildPivot(data, o, L);
    var f = makeFormatters(data, o.locale);
    // Concentration figures always use the full grid, so grouping into Other never changes them.
    var pFull = (o.topRows > 0 || o.topColumns > 0) ? buildPivot(data, assign({}, o, { topRows: 0, topColumns: 0 }), L) : p;
    var lim = this._limit(), conc = concentration(pFull, lim);
    var el = this.element, ramp = makeRamp(theme);
    var paper = theme.background && theme.background !== "transparent" ? theme.background : "#ffffff";
    var family = theme.fontFamily === "inherit"
      ? (root.getComputedStyle ? root.getComputedStyle(this.container).fontFamily : "sans-serif")
      : theme.fontFamily;
    var st = el.style;
    st.setProperty("--vhm-text", theme.text);
    st.setProperty("--vhm-muted", theme.mutedText);
    st.setProperty("--vhm-bg", theme.background);
    st.setProperty("--vhm-font", family);
    st.setProperty("--vhm-focus", theme.focus);
    st.setProperty("--vhm-tip-bg", theme.tooltipBackground);
    st.setProperty("--vhm-tip-text", theme.tooltipText);
    st.setProperty("--vhm-summary-bg", theme.summaryBackground);
    el.classList.toggle("vhm-filled", !!theme.background && theme.background !== "transparent");
    el.classList.toggle("vhm-animate", !!this._animateNext);

    // ---- Fit the columns to the space ------------------------------------------
    var hostW = Math.max(this.plotHost.clientWidth || el.clientWidth || 0, 280);
    this._lastWidth = Math.round(el.clientWidth);
    var narrow = hostW < 560;
    var fs = Number(theme.fontSize) || 12;
    var headSize = narrow ? fs - 1.5 : fs - 0.5, cellSize = narrow ? fs - 2 : fs - 1;
    var cellH = o.cellHeight || (narrow ? 28 : 34);
    var gap = Math.max(0, Number(theme.cellGap) || 0);
    var minCell = narrow ? 26 : 34;
    var rowLabelFull = Math.max.apply(null, p.rows.map(function (r) { return textWidth(r.label, headSize, 400, family); }));
    var labelW = Math.min(Math.ceil(rowLabelFull) + 12, Math.round(hostW * (narrow ? 0.3 : 0.26)));
    var totalsW = o.totals ? Math.max(narrow ? 50 : 70, Math.ceil(textWidth(f.value(Math.max.apply(null, p.rows.map(function (r) { return r.total; }))), fs - 1, 600, family)) + 12) : 0;
    if (o.totals && narrow) totalsW = Math.min(totalsW, 64);
    var totalsGap = o.totals ? 8 : 0;
    var gridW = hostW - labelW - totalsGap - totalsW - 2;
    var fitMode = o.fit || "auto", grouped = false;
    var fitsN = Math.floor(gridW / minCell);
    var canGroup = fitMode === "group" || (fitMode === "auto" && !p.colDim.ordered && !(o.topColumns > 0));
    if (canGroup && p.cols.length > fitsN && fitsN >= 3) {
      p = buildPivot(data, assign({}, o, { topColumns: fitsN - 1 }), L);
      grouped = true;
    }

    var nR = p.rows.length, nC = p.cols.length;
    var rowWord = (p.rowDim.plural || p.rowDim.label).toLowerCase();
    var colWord = (p.colDim.plural || p.colDim.label).toLowerCase();

    // ---- Metric shown in the cells ------------------------------------------
    var mode = o.valueMode;
    if (["amount", "shareOfTotal", "shareOfRow", "shareOfColumn"].indexOf(mode) < 0) mode = "amount";
    var metric = function (r, c) {
      var v = p.values[r][c];
      if (mode === "shareOfTotal") return p.total ? v / p.total : 0;
      if (mode === "shareOfRow") return p.rows[r].total ? v / p.rows[r].total : 0;
      if (mode === "shareOfColumn") return p.cols[c].total ? v / p.cols[c].total : 0;
      return v;
    };
    var maxM = 0;
    for (var r0 = 0; r0 < nR; r0++) for (var c0 = 0; c0 < nC; c0++) maxM = Math.max(maxM, metric(r0, c0));
    var useSqrt = o.scale === "sqrt";
    var tOf = function (m) { if (maxM <= 0) return 0; var t = m / maxM; return useSqrt ? Math.sqrt(t) : t; };
    var mText = function (m, short) {
      if (mode === "amount") return short ? f.compact(m) : f.value(m);
      return f.percent(m, short ? 0 : 1);
    };

    // ---- Summary --------------------------------------------------------------
    var sum = this.summaryEl;
    sum.textContent = "";
    sum.style.display = o.summary ? "" : "none";
    if (o.summary) {
      var stat = function (label, value, note) {
        var d = htmlEl("div", "vhm-stat", sum);
        htmlEl("div", "vhm-stat-label", d).textContent = label;
        htmlEl("div", "vhm-stat-value", d).textContent = value;
        if (note) htmlEl("div", "vhm-stat-note", d).textContent = note;
      };
      stat(L.totalExposure, f.value(p.total), fill(L.gridNote, { rows: pFull.rows.length, rowDim: rowWord, cols: pFull.cols.length, colDim: colWord }));
      if (conc.largest) {
        stat(L.largest, f.percent(conc.largest.share), pFull.rows[conc.largest.r].label + " × " + pFull.cols[conc.largest.c].label + " · " + f.value(conc.largest.value));
      }
      stat(L.hhi, f.count(conc.hhi), fill(L.hhiNote, { n: f.count(Math.round(conc.effective)) }));
      if (lim) stat(L.aboveLimit, f.count(conc.above.length), fill(L.aboveNote, { limit: pct(lim) }));
      else stat(L.top5, f.percent(conc.top5), L.top5Note);
    }

    // ---- Legend --------------------------------------------------------------
    var legend = this.legendEl;
    legend.textContent = "";
    legend.style.display = o.legend ? "" : "none";
    if (o.legend) {
      var rampWrap = htmlEl("span", "vhm-ramp", legend);
      var bar = htmlEl("span", "vhm-ramp-bar", rampWrap);
      bar.style.background = "linear-gradient(to right," + [0, 0.25, 0.5, 0.75, 1].map(function (t) { return ramp(t); }).join(",") + ")";
      var ticks = htmlEl("span", "vhm-ramp-ticks", rampWrap);
      var midVal = useSqrt ? maxM * 0.25 : maxM * 0.5;
      [0, midVal, maxM].forEach(function (v) { htmlEl("span", null, ticks).textContent = mText(v, true); });
      var emptyItem = htmlEl("span", null, legend);
      var es = svgEl("svg", { width: 14, height: 14, "aria-hidden": "true" }, emptyItem);
      svgEl("rect", { x: 1, y: 1, width: 12, height: 12, rx: 2, fill: theme.empty, stroke: theme.mutedText, "stroke-opacity": 0.45, "stroke-dasharray": "2 2" }, es);
      emptyItem.appendChild(document.createTextNode(L.empty));
      if (lim) {
        var limItem = htmlEl("span", null, legend);
        var ls = svgEl("svg", { width: 14, height: 14, "aria-hidden": "true" }, limItem);
        svgEl("rect", { x: 1.5, y: 1.5, width: 11, height: 11, rx: 2, fill: ramp(0.7), stroke: theme.limit, "stroke-width": 2 }, ls);
        svgEl("rect", { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1, fill: "none", stroke: paper, "stroke-width": 1 }, ls);
        limItem.appendChild(document.createTextNode(fill(L.limitLegend, { limit: pct(lim) })));
      }
    }

    // ---- Layout ----------------------------------------------------------------
    var cellW = gridW / nC;
    var scrolls = false;
    if (cellW < minCell) { cellW = minCell; scrolls = true; }
    gridW = cellW * nC;

    // Column headers: one or two lines if they fit, otherwise tilted.
    var colLines = p.cols.map(function (c) { return wrapTwo(c.label, cellW - 4, headSize, 400, family); });
    var tiltCols = colLines.some(function (x) { return x === null; });
    var colLabelMax = Math.max.apply(null, p.cols.map(function (c) { return textWidth(c.label, headSize, 400, family); }));
    var maxColLabel = Math.min(colLabelMax, 140);
    var headerH = tiltCols
      ? Math.ceil(maxColLabel * 0.7071 + headSize + 10)
      : (Math.max.apply(null, colLines.map(function (x) { return x.length; })) * (headSize + 3) + 10);
    var tiltOverflow = tiltCols ? Math.max(0, maxColLabel * 0.7071 - totalsW - totalsGap) : 0;
    var W = labelW + gridW + totalsGap + totalsW + 2 + tiltOverflow;
    if (W > hostW + 0.5) scrolls = true;
    var gridTop = headerH;
    var totalsRowH = o.totals ? cellH : 0;
    var H = gridTop + nR * cellH + (o.totals ? totalsGap + totalsRowH : 0) + 4;
    var x0 = labelW;
    var cx = function (c) { return x0 + c * cellW; };
    var cy = function (r) { return gridTop + r * cellH; };

    // ---- SVG ----------------------------------------------------------------------
    this.plotHost.textContent = "";
    this.noteEl.textContent = scrolls ? fill(L.scrollNote, { columns: colWord }) : grouped ? fill(L.groupNote, { columns: colWord }) : "";
    this.noteEl.style.display = scrolls || grouped ? "" : "none";
    var svg = svgEl("svg", {
      "class": "vhm-plot", viewBox: "0 0 " + W + " " + H, width: W, height: H, tabindex: 0, role: "img",
      "aria-label": o.ariaLabel || [data.title, p.rowDim.label + " by " + p.colDim.label,
        conc.largest ? L.largest + ": " + pFull.rows[conc.largest.r].label + " × " + pFull.cols[conc.largest.c].label + ", " + f.percent(conc.largest.share) : null].filter(Boolean).join(". ")
    }, this.plotHost);
    if (!scrolls) { svg.style.width = "100%"; svg.style.height = "auto"; }
    var txt = function (attrs, content, parent) {
      var t = svgEl("text", assign({ "font-family": family }, attrs), parent || svg);
      t.textContent = content;
      return t;
    };

    // Column headers
    var colHeadEls = [];
    p.cols.forEach(function (c, ci) {
      var mx = cx(ci) + cellW / 2;
      var g = svgEl("g", null, svg);
      if (tiltCols) {
        var by = headerH - 6;
        txt({ x: mx - 2, y: by, "text-anchor": "start", transform: "rotate(-45 " + (mx - 2) + " " + by + ")",
          "font-size": headSize, fill: c.other ? theme.mutedText : theme.headerText }, ellipsis(c.label, 140, headSize, 400, family), g);
      } else {
        var lines = colLines[ci];
        lines.forEach(function (ln, k) {
          txt({ x: mx, y: headerH - 6 - (lines.length - 1 - k) * (headSize + 3), "text-anchor": "middle", "font-size": headSize,
            fill: c.other ? theme.mutedText : theme.headerText }, ln, g);
        });
      }
      colHeadEls.push(g);
    });
    if (o.totals) {
      txt({ x: x0 + gridW + totalsGap + totalsW - 4, y: headerH - 6, "text-anchor": "end", "font-size": headSize, "font-weight": 600, fill: theme.text }, L.total);
    }

    // Row headers
    var rowHeadEls = p.rows.map(function (r, ri) {
      var label = ellipsis(r.label, labelW - 12, headSize, 400, family);
      var t = txt({ x: labelW - 8, y: cy(ri) + cellH / 2 + headSize * 0.35, "text-anchor": "end", "font-size": headSize,
        fill: r.other ? theme.mutedText : theme.headerText }, label);
      if (label !== r.label) { var tt = svgEl("title", null, t); tt.textContent = r.label; }
      return t;
    });
    if (o.totals) {
      txt({ x: labelW - 8, y: cy(nR) + totalsGap + cellH / 2 + headSize * 0.35, "text-anchor": "end", "font-size": headSize, "font-weight": 600, fill: theme.text }, L.total);
    }

    // Cells
    var cellsG = svgEl("g", null, svg);
    var showLabels = o.cellLabels === true || (o.cellLabels === "auto");
    for (var r = 0; r < nR; r++) {
      for (var c = 0; c < nC; c++) {
        var v = p.values[r][c], m = metric(r, c);
        var colour = v > 0 ? ramp(tOf(m)) : theme.empty;
        var rect = svgEl("rect", { x: cx(c) + gap / 2, y: cy(r) + gap / 2, width: Math.max(cellW - gap, 1), height: Math.max(cellH - gap, 1),
          rx: Math.min(theme.cellRadius, cellW / 4), fill: colour, "class": "vhm-cell", "data-r": r, "data-c": c }, cellsG);
        // An empty cell gets a dashed outline, so "no exposure" never looks like a very small exposure.
        if (!(v > 0)) { rect.setAttribute("stroke", theme.mutedText); rect.setAttribute("stroke-opacity", 0.45); rect.setAttribute("stroke-dasharray", "2 2"); rect.setAttribute("stroke-width", 1); }
        rect.style.animationDelay = Math.min((r + c) * 18, 500) + "ms";
        if (lim && p.total > 0 && v / p.total > lim + 1e-12 && !p.rows[r].other && !p.cols[c].other) {
          svgEl("rect", { x: cx(c) + gap / 2 + 1, y: cy(r) + gap / 2 + 1, width: Math.max(cellW - gap - 2, 1), height: Math.max(cellH - gap - 2, 1),
            rx: Math.min(theme.cellRadius, cellW / 4), fill: "none", stroke: theme.limit, "stroke-width": 2, "pointer-events": "none" }, cellsG);
          svgEl("rect", { x: cx(c) + gap / 2 + 3, y: cy(r) + gap / 2 + 3, width: Math.max(cellW - gap - 6, 1), height: Math.max(cellH - gap - 6, 1),
            rx: Math.max(0, Math.min(theme.cellRadius, cellW / 4) - 1), fill: "none", stroke: paper, "stroke-width": 1, "pointer-events": "none" }, cellsG);
        }
        if (showLabels && v > 0 && cellH - gap >= 16) {
          var room = cellW - gap - 8;
          var label = mText(m, false);
          if (textWidth(label, cellSize, 500, family) > room) label = mText(m, true);
          if (textWidth(label, cellSize, 500, family) <= room) {
            // Use whichever text colour stands out more from this cell, so numbers stay readable on mid-tones too.
            var onCell = contrast(colour, theme.cellTextOnDark) > contrast(colour, theme.cellText) ? theme.cellTextOnDark : theme.cellText;
            txt({ x: cx(c) + cellW / 2, y: cy(r) + cellH / 2 + cellSize * 0.35, "text-anchor": "middle", "font-size": cellSize, "font-weight": 500,
              fill: onCell, "pointer-events": "none", "class": "vhm-cell-label" }, label, cellsG);
          }
        }
      }
    }

    // Totals as data bars
    var totalsG = null;
    if (o.totals) {
      totalsG = svgEl("g", null, svg);
      var maxRow = Math.max.apply(null, p.rows.map(function (x) { return x.total; })) || 1;
      var maxCol = Math.max.apply(null, p.cols.map(function (x) { return x.total; })) || 1;
      var tx0 = x0 + gridW + totalsGap;
      p.rows.forEach(function (rg, ri) {
        var w = Math.max(2, (totalsW - 2) * rg.total / maxRow);
        svgEl("rect", { x: tx0, y: cy(ri) + gap / 2 + 3, width: w, height: cellH - gap - 6, rx: 2, fill: theme.totalBar, "fill-opacity": theme.totalBarOpacity,
          "data-tr": ri }, totalsG);
        var label = f.value(rg.total);
        if (textWidth(label, fs - 1, 600, family) > totalsW - 6) label = f.compact(rg.total);
        txt({ x: tx0 + totalsW - 4, y: cy(ri) + cellH / 2 + (fs - 1) * 0.35, "text-anchor": "end", "font-size": fs - 1, "font-weight": 600, fill: theme.text, "pointer-events": "none" }, label, totalsG);
      });
      var ty = cy(nR) + totalsGap;
      p.cols.forEach(function (cg, ci) {
        var h = Math.max(2, (cellH - gap - 4) * cg.total / maxCol);
        svgEl("rect", { x: cx(ci) + gap / 2 + 2, y: ty + cellH - gap / 2 - 2 - h, width: Math.max(cellW - gap - 4, 1), height: h, rx: 2,
          fill: theme.totalBar, "fill-opacity": theme.totalBarOpacity, "data-tc": ci }, totalsG);
        var label = f.value(cg.total);
        if (textWidth(label, cellSize, 600, family) > cellW - gap - 6) label = f.compact(cg.total);
        if (textWidth(label, cellSize, 600, family) <= cellW - gap - 6) {
          txt({ x: cx(ci) + cellW / 2, y: ty + cellH / 2 + cellSize * 0.35, "text-anchor": "middle", "font-size": cellSize, "font-weight": 600, fill: theme.text, "pointer-events": "none" }, label, totalsG);
        }
      });
      var grand = f.value(p.total);
      if (textWidth(grand, fs - 1, 700, family) > totalsW - 6) grand = f.compact(p.total);
      txt({ x: tx0 + totalsW - 4, y: ty + cellH / 2 + (fs - 1) * 0.35, "text-anchor": "end", "font-size": fs - 1, "font-weight": 700, fill: theme.text }, grand);
    }

    // Focus ring for hover and keyboard
    this._focusRect = svgEl("rect", { x: 0, y: 0, width: 0, height: 0, rx: Math.min(theme.cellRadius + 1, 6), fill: "none", stroke: theme.text, "stroke-width": 2, opacity: 0, "pointer-events": "none" }, svg);

    // ---- Interaction ------------------------------------------------------------
    var cellInfo = function (r, c) {
      var v = p.values[r][c];
      return {
        row: p.rows[r].label, column: p.cols[c].label, rowIndex: r, columnIndex: c, value: v,
        shareOfTotal: p.total ? v / p.total : 0,
        shareOfRow: p.rows[r].total ? v / p.rows[r].total : 0,
        shareOfColumn: p.cols[c].total ? v / p.cols[c].total : 0,
        aboveLimit: !!(lim && p.total && v / p.total > lim + 1e-12 && !p.rows[r].other && !p.cols[c].other),
        rowMembers: p.rows[r].members.slice(), columnMembers: p.cols[c].members.slice()
      };
    };
    var bolded = [];
    this._boldReset = function () { bolded.forEach(function (n) { n.removeAttribute("font-weight"); }); bolded = []; };
    var boldHeaders = function (r, c) {
      self._boldReset();
      var rt = rowHeadEls[r]; rt.setAttribute("font-weight", 600); bolded.push(rt);
      Array.prototype.forEach.call(colHeadEls[c].childNodes, function (n) { n.setAttribute("font-weight", 600); bolded.push(n); });
    };
    var showCell = function (r, c, evt) {
      self._active = [r, c];
      self._focusRect.setAttribute("x", cx(c) + gap / 2 - 1);
      self._focusRect.setAttribute("y", cy(r) + gap / 2 - 1);
      self._focusRect.setAttribute("width", cellW - gap + 2);
      self._focusRect.setAttribute("height", cellH - gap + 2);
      self._focusRect.setAttribute("opacity", 1);
      boldHeaders(r, c);
      if (!o.tooltip) return;
      var info = cellInfo(r, c), lines;
      if (typeof o.tooltipFormatter === "function") {
        lines = o.tooltipFormatter(info, f);
        if (!Array.isArray(lines)) lines = [String(lines)];
      } else {
        lines = [info.row + " × " + info.column];
        if (!info.value) lines.push(L.empty);
        else {
          lines.push(L.exposure + ": " + f.value(info.value));
          lines.push(L.shareOfTotal + ": " + f.percent(info.shareOfTotal));
          lines.push(fill(L.shareOfRow, { row: info.row }) + ": " + f.percent(info.shareOfRow));
          lines.push(fill(L.shareOfColumn, { column: info.column }) + ": " + f.percent(info.shareOfColumn));
          if (info.aboveLimit) lines.push(fill(L.limitTip, { limit: pct(lim) }));
        }
        if (p.rows[r].other) lines.push(fill(L.includes, { list: p.rows[r].members.join(", ") }));
        if (p.cols[c].other) lines.push(fill(L.includes, { list: p.cols[c].members.join(", ") }));
      }
      var rb = svg.getBoundingClientRect(), k = rb.width / W;
      self._placeTip(lines, { left: rb.left + cx(c) * k, top: rb.top + cy(r) * k, width: cellW * k, bottom: rb.top + (cy(r) + cellH) * k }, evt);
    };
    var totalTip = function (isRow, i, evt) {
      var g = isRow ? p.rows[i] : p.cols[i];
      var lines = [fill(L.rowTotalTip, { label: g.label }), f.value(g.total) + " · " + f.percent(p.total ? g.total / p.total : 0) + " " + L.shareOfTotal.toLowerCase()];
      if (g.other) lines.push(g.members.join(", "));
      self._placeTip(lines, { left: evt.clientX, top: evt.clientY, width: 0 }, evt);
    };

    cellsG.addEventListener("mousemove", function (e) {
      var t = e.target; if (!t.hasAttribute || !t.hasAttribute("data-r")) return;
      showCell(+t.getAttribute("data-r"), +t.getAttribute("data-c"), e);
    });
    cellsG.addEventListener("pointerdown", function (e) {
      var t = e.target; if (!t.hasAttribute || !t.hasAttribute("data-r")) return;
      showCell(+t.getAttribute("data-r"), +t.getAttribute("data-c"), e);
    });
    cellsG.addEventListener("mouseleave", function () { self._hideTip(); });
    if (typeof o.onClick === "function") {
      cellsG.style.cursor = "pointer";
      cellsG.addEventListener("click", function (e) {
        var t = e.target; if (!t.hasAttribute || !t.hasAttribute("data-r")) return;
        o.onClick(cellInfo(+t.getAttribute("data-r"), +t.getAttribute("data-c")), e);
      });
    }
    if (totalsG) {
      totalsG.addEventListener("mousemove", function (e) {
        var t = e.target;
        if (t.hasAttribute && t.hasAttribute("data-tr")) totalTip(true, +t.getAttribute("data-tr"), e);
        else if (t.hasAttribute && t.hasAttribute("data-tc")) totalTip(false, +t.getAttribute("data-tc"), e);
      });
      totalsG.addEventListener("mouseleave", function () { self._hideTip(); });
    }

    // Positions kept for notes
    this._geom = { rows: p.rows, cols: p.cols, cx: cx, cy: cy, cellW: cellW, cellH: cellH, gap: gap };

    svg.setAttribute("aria-describedby", this.tipEl.id);
    var start = [0, 0];
    if (conc.largest) {
      var sr = p.rows.map(function (g) { return g.key; }).indexOf(pFull.rows[conc.largest.r].key);
      var sc = p.cols.map(function (g) { return g.key; }).indexOf(pFull.cols[conc.largest.c].key);
      if (sr >= 0 && sc >= 0) start = [sr, sc];
    }
    svg.addEventListener("focus", function () {
      var a = self._active && self._active[0] < nR && self._active[1] < nC ? self._active : start;
      showCell(a[0], a[1]);
    });
    svg.addEventListener("blur", function () { self._hideTip(); });
    svg.addEventListener("keydown", function (e) {
      var a = self._active && self._active[0] < nR && self._active[1] < nC ? self._active.slice() : start.slice();
      if (e.key === "ArrowLeft") a[1] = Math.max(0, a[1] - 1);
      else if (e.key === "ArrowRight") a[1] = Math.min(nC - 1, a[1] + 1);
      else if (e.key === "ArrowUp") a[0] = Math.max(0, a[0] - 1);
      else if (e.key === "ArrowDown") a[0] = Math.min(nR - 1, a[0] + 1);
      else if (e.key === "Home") a[1] = 0;
      else if (e.key === "End") a[1] = nC - 1;
      else if ((e.key === "Enter" || e.key === " ") && typeof o.onClick === "function") { e.preventDefault(); o.onClick(cellInfo(a[0], a[1]), e); return; }
      else return;
      e.preventDefault();
      showCell(a[0], a[1]);
    });

    this._hideTip();
    this._animateNext = false;
    return this;
  };

  /* ======================================================================
     5. EXPORT AND NOTES
     Used by the chart menu in veyforma-toolkit.js, and available to you.
     ====================================================================== */
  function findGroup(groups, key) {
    if (key == null) return -1;
    key = String(key);
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].label === key || groups[i].key === key || groups[i].members.indexOf(key) >= 0) return i;
    }
    return -1;
  }

  /** One-paragraph guide to reading the heatmap. */
  Chart.prototype.howToRead = function () {
    var p = buildPivot(this.options.data, this.options, this._labels());
    var rw = (p.rowDim.label || "row").toLowerCase(), cw = (p.colDim.label || "column").toLowerCase();
    return "Each cell is the exposure where a " + rw + " meets a " + cw + "; darker cells hold more. " +
      "The bars on the right and along the bottom are the totals for each " + rw + " and " + cw + ". " +
      "HHI measures concentration: the higher it is, the more the book depends on a few cells." +
      (this._limit() ? " Cells with a double outline are above the concentration limit." : "");
  };

  /** A plain-English summary of the main findings, for screen readers and the explanation box. */
  Chart.prototype.describe = function () {
    var st = this.getStats(), f = makeFormatters(this.options.data, this.options.locale);
    var p = buildPivot(this.options.data, this.options, this._labels());
    var out = ["In this example total exposure is " + f.value(st.total) + " across " + st.rows + " " + (p.rowDim.plural || p.rowDim.label).toLowerCase() +
      " and " + st.columns + " " + (p.colDim.plural || p.colDim.label).toLowerCase() + "."];
    if (st.largest) out.push("The largest cell is " + st.largest.row + " × " + st.largest.column + " with " + f.value(st.largest.value) + " (" + f.percent(st.largest.share) + " of the total).");
    out.push("HHI is " + f.count(st.hhi) + ", like " + f.count(Math.round(st.effectiveCells)) + " equal-sized cells.");
    if (st.limit) out.push(st.aboveLimit.length + " " + (st.aboveLimit.length === 1 ? "cell is" : "cells are") + " above the " + pct(st.limit) + " limit.");
    return out.join(" ");
  };

  /** Tables, wording and audit details for the export menu. Uses the full grid, without Other grouping. */
  Chart.prototype.getExportData = function () {
    var o = this.options, data = o.data, L = this._labels();
    var p = buildPivot(data, assign({}, o, { topRows: 0, topColumns: 0 }), L), f = makeFormatters(data, o.locale);
    var st = this.getStats(), lim = this._limit();
    var unit = { prefix: data.prefix || "", suffix: data.suffix || "", decimals: data.decimals != null ? data.decimals : 0, negatives: data.negatives };
    var cols = [{ label: p.rowDim.label, type: "text" }].concat(p.cols.map(function (c) { return { label: c.label, type: "number", unit: unit }; }), [{ label: L.total, type: "number", unit: unit }]);
    var mRows = p.rows.map(function (r, ri) { return [r.label].concat(p.values[ri], [r.total]); });
    mRows.push([L.total].concat(p.cols.map(function (c) { return c.total; }), [p.total]));
    var mText = p.rows.map(function (r, ri) { return [r.label].concat(p.values[ri].map(function (v) { return v ? f.value(v) : "—"; }), [f.value(r.total)]); });
    mText.push([L.total].concat(p.cols.map(function (c) { return f.value(c.total); }), [f.value(p.total)]));
    var cells = [];
    p.rows.forEach(function (r, ri) { p.cols.forEach(function (c, ci) { var v = p.values[ri][ci]; if (v) cells.push([r.label, c.label, v, p.total ? v / p.total : 0]); }); });
    cells.sort(function (a, b) { return b[2] - a[2]; });
    var above = function (share) { return lim && share > lim + 1e-12 ? "Yes" : "No"; };
    var conc = [
      [L.totalExposure, st.total, f.value(st.total)],
      [L.hhi, st.hhi, f.count(st.hhi)],
      ["Effective number of cells", st.effectiveCells, f.count(Math.round(st.effectiveCells))],
      [L.top5, st.top5Share, f.percent(st.top5Share)]
    ];
    if (st.largest) conc.push([L.largest, st.largest.share, st.largest.row + " × " + st.largest.column + " · " + f.percent(st.largest.share)]);
    if (lim) { conc.push(["Limit (share of total)", lim, pct(lim)]); conc.push([L.aboveLimit, st.aboveLimit.length, f.count(st.aboveLimit.length)]); }
    var notes = (o.annotations || []).map(function (a, i) { return [String(i + 1), String(a.row || ""), String(a.column || ""), a.text || ""]; });
    var sheets = [
      { name: "Matrix", columns: cols, rows: mRows, text: mText, bold: mRows.map(function (r, i) { return i === mRows.length - 1; }) },
      { name: "Cells", columns: [{ label: p.rowDim.label, type: "text" }, { label: p.colDim.label, type: "text" }, { label: L.exposure, type: "number", unit: unit },
          { label: L.shareOfTotal, type: "percent", decimals: 2 }, { label: L.aboveLimit, type: "text" }],
        rows: cells.map(function (c) { return [c[0], c[1], c[2], c[3], above(c[3])]; }),
        text: cells.map(function (c) { return [c[0], c[1], f.value(c[2]), f.percent(c[3], 2), above(c[3])]; }) },
      { name: "Concentration", columns: [{ label: "Measure", type: "text" }, { label: "Value", type: "general" }, { label: "As shown", type: "text" }],
        rows: conc, text: conc.map(function (r) { return [r[0], typeof r[1] === "number" ? String(Number(r[1].toPrecision(10))) : String(r[1]), r[2]]; }) }
    ];
    if (notes.length) sheets.push({ name: "Notes", columns: [{ label: "No.", type: "text" }, { label: p.rowDim.label, type: "text" }, { label: p.colDim.label, type: "text" }, { label: "Note", type: "text" }], rows: notes });
    return {
      title: data.title || "Exposure heatmap", subtitle: data.subtitle || "", summary: this.describe(),
      library: "Veyforma Exposure Heatmap " + VERSION, sheets: sheets,
      meta: [["Method", "HHI = 10,000 × sum of squared cell shares; effective number of cells = 10,000 ÷ HHI; a cell is above the limit when its share is strictly greater"],
        ["Grid", p.rowDim.label + " × " + p.colDim.label + ", full grid without Other grouping"],
        ["Unit", data.unit], ["Limit", lim ? pct(lim) + " of total" : null], ["As of", data.asOf], ["Data source", data.source]]
    };
  };

  /** Where a note's marker goes: inside the top-left corner of its cell. */
  Chart.prototype._annotationPoint = function (a) {
    var g = this._geom;
    if (!g || !a) return null;
    var r = findGroup(g.rows, a.row), c = findGroup(g.cols, a.column);
    if (r < 0 || c < 0) return null;
    // A cell grouped into "Other" keeps its note: the marker moves to the Other cell and the list says so.
    var grouped = (g.rows[r] && g.rows[r].other) || (g.cols[c] && g.cols[c].other);
    return { x: g.cx(c) + g.gap / 2 + 11, y: g.cy(r) + g.gap / 2 + 11, inside: true, where: grouped ? "shown in Other" : null };
  };
  /** The cell under the pointer (or the cell picked with the keyboard), as a note target. */
  Chart.prototype._annotationTarget = function (evt) {
    var g = this._geom, r, c;
    if (!g) return null;
    if (evt) {
      var t = evt.target;
      if (!t || !t.getAttribute || t.getAttribute("data-r") == null) return null;
      r = +t.getAttribute("data-r"); c = +t.getAttribute("data-c");
    } else if (this._active) { r = this._active[0]; c = this._active[1]; }
    else return null;
    if (!g.rows[r] || !g.cols[c] || g.rows[r].other || g.cols[c].other) return null;
    return { row: g.rows[r].label, column: g.cols[c].label };
  };
  Chart.prototype._annotationLabel = function (a) { return [a.row, a.column].filter(Boolean).join(" × "); };

  /* ======================================================================
     6. PUBLIC API
     ====================================================================== */
  root.VeyHeatmap = {
    version: VERSION,
    /** Draws a heatmap inside a container element or CSS selector. */
    create: function (target, options) { return new Chart(target, options); },
    /** Adds or replaces a named theme. Use "extends" to start from another theme. */
    registerTheme: function (name, theme) {
      if (!name || typeof name !== "string") throw new Error("VeyHeatmap: registerTheme needs a name.");
      THEMES[name] = resolveTheme(theme || {});
      return THEMES[name];
    },
    /** Returns the full set of values for a theme name or partial theme. */
    getTheme: function (theme) { return resolveTheme(theme); },
    /** Lists the names of all available themes. */
    listThemes: function () { return Object.keys(THEMES); }
  };
})(typeof window !== "undefined" ? window : this);

// Risk-Factor Tornado – Veyforma Chart Library · https://www.veyforma.com/charts/risk-factor-tornado
/*!
 * Veyforma Risk-Factor Tornado v1.0.0
 * Ranks the risk factors that move P&L, economic value or capital the most, for a down and
 * an up shock to each factor. Impacts come from full revaluation or from delta and gamma
 * (Taylor), and can be rescaled to any shock size. On top of the classic tornado it shows the
 * convexity of each factor (how unequal the up and down results are), breaches of a loss
 * limit, how much the top factors explain, groups such as risk classes, the interaction when
 * every factor is shocked together, and each factor's share of the combined move once the
 * factors' correlations are taken into account, so hedges become visible.
 * Original work created for Veyforma. Contains no third-party code.
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 *
 * Load veyforma-toolkit.js as well to get the chart menu: full screen, print,
 * PNG, JPEG, SVG, PDF, CSV and Excel downloads, copy, notes and the
 * "How to read this chart" box.
 *
 * File layout
 *   1. Settings .......... themes, labels and options
 *   2. Helpers ........... formatting and small utilities
 *   3. Calculation ....... impacts, ranking, convexity, groups, correlated contributions
 *   4. Chart instance .... factor, group and contribution views, tooltips, keyboard
 *   5. Export and notes .. data for the Veyforma Toolkit menu (optional file)
 *   6. Public API ........ window.VeyRiskTornado
 *
 * Method in one paragraph (see the manual for detail):
 *   Each factor has a down and an up impact, given directly or as Δ·s + ½Γ·s² for the shock s.
 *   Swing = |up − down|; the linear part is L = (up − down) ÷ 2 and the convexity C = (up + down) ÷ 2,
 *   so a shock k times larger moves the result by about L·k + C·k². Factors are ranked by swing (or by
 *   their worst result). Combined move σ = √(Lᵀ ρ L) with ρ the factor correlations; factor k's share of it
 *   is L_k (ρL)_k ÷ σ, which adds up exactly to σ; a negative share means the factor hedges the others.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var instanceCount = 0;

  /* ======================================================================
     1. SETTINGS
     ====================================================================== */
  var BASE_THEME = {
    down: "#4b5563",              // bars for the down shock
    up: "#c2410c",                // bars for the up shock
    hedge: "#2f6fed",             // contributions that lower the combined move
    contribution: "#a63d16",      // contributions that add to it
    convexity: "#111827",         // convexity marker (midpoint of the two results)
    limit: "#b91c1c",             // loss limit line and breaches
    grid: "#ececec",
    axis: "#9ca3af",
    text: "#111827",
    mutedText: "#4b5563",
    axisText: "#4b5563",
    cardBackground: "#f9fafb",
    background: "transparent",
    tooltipBackground: "#111827",
    tooltipText: "#ffffff",
    focus: "#c2410c",
    accent: "#c2410c",
    fontFamily: "inherit",
    fontSize: 12
  };
  var THEMES = {
    veyforma: {},
    mono: { down: "#8a8a8a", up: "#111111", hedge: "#8a8a8a", contribution: "#111111", convexity: "#111111", limit: "#111111", accent: "#111111", focus: "#111111" },
    "colour-safe": { down: "#2166ac", up: "#b2182b", hedge: "#1b7837", contribution: "#762a83", limit: "#b2182b", accent: "#2166ac" },
    ocean: { down: "#64748b", up: "#0c6e8f", hedge: "#c2410c", contribution: "#0c3b5e", cardBackground: "#eef5f8", accent: "#0c6e8f" },
    forest: { down: "#78716c", up: "#4d6b31", hedge: "#2f6fed", contribution: "#22311a", cardBackground: "#f2f4ee", accent: "#4d6b31" },
    corporate: { down: "#64748b", up: "#1d4ed8", hedge: "#c2410c", contribution: "#1e293b", cardBackground: "#f1f4f8", accent: "#1d4ed8" },
    midnight: { background: "#111418", down: "#a3abb8", up: "#f08a5d", hedge: "#93c5fd", contribution: "#f08a5d", convexity: "#f3f4f6", limit: "#fb7185",
      grid: "#252a31", axis: "#4b5563", text: "#f3f4f6", mutedText: "#a3abb8", axisText: "#a3abb8",
      cardBackground: "#1b2027", tooltipBackground: "#f3f4f6", tooltipText: "#111418", focus: "#93c5fd", accent: "#f08a5d" }
  };

  var DEFAULT_OPTIONS = {
    data: null,             // required: { factors: [...], … }
    view: "factors",        // "factors" | "groups" | "contribution"
    sort: "swing",          // rank factors by "swing" (|up − down|) or by their "worst" result
    top: 15,                // rows shown before the rest are summed into one "Other" row (0 = all)
    shockScale: 1,          // multiply every shock size, e.g. 2 for twice the shock
    whatIf: null,           // scale positions by factor or group key, e.g. { "EUR 10Y": 0, "FX": 0.5 }
    theme: "veyforma",
    locale: undefined,
    animate: true,
    summary: true,
    legend: true,
    labels: null,
    ariaLabel: undefined,
    caption: true,
    annotations: null,      // notes, e.g. [{ factor: "EUR 10Y", text: "Hedge rolled in March" }] or { group, text }
    onAnnotationsChange: null,
    onItemClick: null,      // function (detail, event): every figure for the factor or group clicked
    exportRows: 20000,      // the factor sheet keeps the largest swings above this many rows
    toolbar: true
  };

  var DEFAULT_LABELS = {
    factors: "Impact by risk factor", groups: "Impact by group", contribution: "Share of the combined move",
    down: "Down shock", up: "Up shock", swing: "Swing", worst: "Worst result", convexity: "Convexity", linear: "Linear part",
    limit: "Limit", largest: "Largest driver", worstShock: "Worst single shock", topShare: "Top {n} factors", combined: "Combined move",
    contributionAdds: "Adds to the combined move", hedge: "Hedges (lowers it)", standalone: "Stand-alone", other: "Other {n} factors",
    whatIf: "What-if", interaction: "Interaction", noData: "n/a"
  };
  /* ======================================================================
     2. HELPERS
     ====================================================================== */
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  var warned = {};
  function warn(msg) { if (warned[msg]) return; warned[msg] = 1; if (root.console && console.warn) console.warn("VeyRiskTornado: " + msg); }
  function fail(msg) { throw new Error("VeyRiskTornado: " + msg); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function fill(t, map) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; }); }
  /** A name inside a sentence: "CET1 requirement" stays, "Pillar 1 minimum" becomes "pillar 1 minimum". */
  function lower(t) { t = String(t); return /^[A-Z0-9]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); }
  function num(v) { return typeof v === "number" ? v : v == null || v === "" ? NaN : +v; }
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function htmlEl(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  var measureCtx = null;
  function textWidth(text, size, weight, family) {
    if (!measureCtx) { var c = document.createElement("canvas"); measureCtx = c.getContext && c.getContext("2d"); }
    if (!measureCtx) return String(text).length * size * 0.6;
    measureCtx.font = (weight || 400) + " " + size + "px " + family;
    return measureCtx.measureText(String(text)).width;
  }
  function fit(text, max, size, weight, family) {
    text = String(text);
    if (textWidth(text, size, weight, family) <= max) return text;
    while (text.length > 2 && textWidth(text + "…", size, weight, family) > max) text = text.slice(0, -1);
    return text.replace(/\s+$/, "") + "…";
  }
  function hexRgb(c) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1], n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(rgb) {
    var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var x = hexRgb(a), y = hexRgb(b);
    if (!x || !y) return 21;
    var l1 = luminance(x), l2 = luminance(y);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function ensureContrast(col, bg, min) {
    var c = hexRgb(col), b = hexRgb(bg);
    if (!c || !b || contrast(col, bg) >= min) return col;
    var dark = luminance(b) > 0.4, t = 0, out = col;
    while (t <= 1 && contrast(out, bg) < min) {
      t += 0.05;
      out = "#" + c.map(function (v) { var x = dark ? v * (1 - t) : v + (255 - v) * t; return ("0" + Math.round(x).toString(16)).slice(-2); }).join("");
    }
    return out;
  }
  function makeFormatters(data, locale) {
    var decimals = data.decimals != null ? data.decimals : 0, rd = data.ratioDecimals != null ? data.ratioDecimals : 1;
    var prefix = data.prefix || "", suffix = data.suffix || "", cache = {}, brackets = data.negatives === "brackets";
    function nf(d) {
      if (!cache[d]) cache[d] = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
      return cache[d];
    }
    function value(v, d) {
      if (v == null || !isFinite(v)) return "–";
      if (d == null) d = decimals;
      var r = Number(v.toFixed(d)), body = prefix + nf(d).format(Math.abs(r)) + suffix;
      if (r >= 0) return body;
      return brackets ? "(" + body + ")" : "−" + body;
    }
    function signed(v, d) { var s = value(v, d); return v != null && Number(v.toFixed(d == null ? decimals : d)) > 0 ? "+" + s : s; }
    function ratio(v, d) { return v == null || !isFinite(v) ? "–" : (v < 0 ? "−" : "") + nf(d == null ? rd : d).format(Math.abs(v) * 100) + "%"; }
    function pp(v, d) {
      if (v == null || !isFinite(v)) return "–";
      var dd = d == null ? Math.max(rd, 1) : d, r = Number((v * 100).toFixed(dd));
      return (r > 0 ? "+" : r < 0 ? "−" : "") + nf(dd).format(Math.abs(r)) + " pp";
    }
    function percent(v, d) { return v == null || !isFinite(v) ? "–" : nf(d == null ? 1 : d).format(v * 100) + "%"; }
    return { value: value, signed: signed, ratio: ratio, pp: pp, percent: percent, nf: nf };
  }


  /* ======================================================================
     3. CALCULATION
     ====================================================================== */
  function finite(v, what) { var x = num(v); if (!isFinite(x)) fail(what + " must be a number."); return x; }
  function corrOf(v, what) { var x = finite(v, what); if (x < -1 || x > 1) fail(what + " must be between −1 and 1."); return x; }

  /** Reads the factors and works out each one's down and up impact for the shock scale and what-if. */
  function readFactors(data, k, whatIf) {
    var list = data.factors;
    if (!Array.isArray(list) || !list.length) fail("data.factors must be a non-empty array of risk factors.");
    var seen = {};
    return list.map(function (x, i) {
      if (!x || typeof x !== "object") fail("data.factors[" + i + "] is not an object.");
      if (x.key == null && x.label == null) fail("data.factors[" + i + "] needs a key or a label.");
      var key = String(x.key != null ? x.key : x.label), w = 'factor "' + key + '"';
      if (seen[key]) fail(w + " is used twice.");
      seen[key] = 1;
      var group = x.group != null ? String(x.group) : "Other";
      var sd = x.shockDown != null ? finite(x.shockDown, w + ": shockDown") : x.shock != null ? -Math.abs(finite(x.shock, w + ": shock")) : null;
      var su = x.shockUp != null ? finite(x.shockUp, w + ": shockUp") : x.shock != null ? Math.abs(finite(x.shock, w + ": shock")) : null;
      var down, up, source;
      if (x.delta != null) {
        // Taylor: impact = Δ·s + ½·Γ·s² at the (scaled) shock
        var d = finite(x.delta, w + ": delta"), g = x.gamma != null ? finite(x.gamma, w + ": gamma") : 0;
        if (sd == null || su == null) fail(w + ": delta needs shockDown and shockUp (or shock).");
        var a = sd * k, b = su * k;
        down = d * a + 0.5 * g * a * a; up = d * b + 0.5 * g * b * b; source = "taylor";
      } else {
        if (x.down == null || x.up == null) fail(w + " needs down and up impacts, or delta (and gamma) with a shock.");
        var dn = finite(x.down, w + ": down"), u = finite(x.up, w + ": up");
        if (k === 1) { down = dn; up = u; }
        else { var L = (u - dn) / 2, C = (u + dn) / 2; down = -L * k + C * k * k; up = L * k + C * k * k; }   // two-point fit, exact at k = 1
        source = "revaluation";
      }
      var m = 1;
      if (whatIf) {
        if (whatIf[key] != null) m *= finite(whatIf[key], "whatIf." + key);
        if (whatIf[group] != null && group !== key) m *= finite(whatIf[group], "whatIf." + group);
      }
      return { key: key, label: x.label != null ? String(x.label) : key, group: group, unit: x.unit != null ? String(x.unit) : "",
        shockDown: sd == null ? null : sd * k, shockUp: su == null ? null : su * k, down: down * m, up: up * m, source: source, index: i };
    });
  }

  /** (ρL)_k for every factor: one pass for within/across correlations, a full product for a matrix. */
  function corrTimes(fs, corr, Lv) {
    var n = fs.length, out = new Array(n), i, j;
    if (corr && corr.matrix) {
      var M = corr.matrix;
      for (i = 0; i < n; i++) { var s = 0, row = M[i]; for (j = 0; j < n; j++) s += (i === j ? 1 : row[j]) * Lv[j]; out[i] = s; }
      return out;
    }
    var wi = corr ? corr.within : 0, ac = corr ? corr.across : 0, G = {}, T = 0;
    for (i = 0; i < n; i++) { G[fs[i].group] = (G[fs[i].group] || 0) + Lv[i]; T += Lv[i]; }
    for (i = 0; i < n; i++) { var gs = G[fs[i].group]; out[i] = Lv[i] + wi * (gs - Lv[i]) + ac * (T - gs); }
    return out;
  }
  function readCorr(data, n) {
    var c = data.correlation;
    if (c == null) return null;
    if (typeof c !== "object") fail("data.correlation must be { within, across } or { matrix }.");
    if (c.matrix) {
      var M = c.matrix;
      if (!Array.isArray(M) || M.length !== n || M.some(function (r) { return !Array.isArray(r) || r.length !== n; })) fail("data.correlation.matrix must be square with one row per factor.");
      M.forEach(function (r, i) { r.forEach(function (v, j) { corrOf(v, "data.correlation.matrix[" + i + "][" + j + "]"); }); });
      return { matrix: M };
    }
    return { within: c.within != null ? corrOf(c.within, "data.correlation.within") : 0, across: c.across != null ? corrOf(c.across, "data.correlation.across") : 0 };
  }

  /** Every figure. opts: { shockScale, whatIf, sort }. */
  function compute(data, opts) {
    opts = opts || {};
    if (!data || typeof data !== "object") fail("data is required.");
    var k = opts.shockScale != null ? finite(opts.shockScale, "shockScale") : 1;
    if (!(k > 0)) fail("shockScale must be more than 0.");
    var wi = opts.whatIf && Object.keys(opts.whatIf).length ? opts.whatIf : null;
    var fs = readFactors(data, k, wi), n = fs.length;
    if (wi) Object.keys(wi).forEach(function (key) { if (!fs.some(function (f) { return f.key === key || f.group === key; })) warn('whatIf: there is no factor or group "' + key + '", so it changes nothing.'); });
    var hib = data.higherIsBetter !== false;
    var bad = function (v) { return hib ? -v : v; };
    var limit = data.limit != null ? Math.abs(finite(data.limit, "data.limit")) : null;
    var corr = readCorr(data, n);
    var Lv = fs.map(function (f) { return (f.up - f.down) / 2; });
    var RL = corrTimes(fs, corr, Lv), q = 0, i;
    for (i = 0; i < n; i++) q += Lv[i] * RL[i];
    var sigma = Math.sqrt(Math.max(0, q)), totalSwing = 0, sumDown = 0, sumUp = 0, standalone = 0;
    fs.forEach(function (f, j) {
      f.swing = Math.abs(f.up - f.down);
      f.linear = Lv[j];
      f.convexity = (f.up + f.down) / 2;
      f.asymmetry = Math.abs(f.linear) + Math.abs(f.convexity) > 0 ? Math.abs(f.convexity) / (Math.abs(f.linear) + Math.abs(f.convexity)) : 0;
      f.worst = bad(f.down) >= bad(f.up) ? "down" : "up";
      f.worstValue = f[f.worst];
      f.best = f.worst === "down" ? "up" : "down";
      f.breach = limit != null && bad(f.worstValue) > limit + 1e-12 * Math.max(1, limit);
      f.standalone = Math.abs(Lv[j]);
      f.contribution = sigma > 0 ? Lv[j] * RL[j] / sigma : 0;
      totalSwing += f.swing; sumDown += f.down; sumUp += f.up; standalone += f.standalone;
    });
    var order = fs.slice().sort(opts.sort === "worst"
      ? function (a, b) { return bad(b.worstValue) - bad(a.worstValue) || a.index - b.index; }
      : function (a, b) { return b.swing - a.swing || a.index - b.index; });
    var cum = 0;
    order.forEach(function (f, r) { f.rank = r + 1; f.share = totalSwing > 0 ? f.swing / totalSwing : 0; cum += f.share; f.cumShare = cum; });
    // Groups, in the order they first appear
    var gm = {}, groups = [];
    fs.forEach(function (f, j) {
      var g = gm[f.group];
      if (!g) { g = gm[f.group] = { key: f.group, label: f.group, factors: [], idx: [], down: 0, up: 0, contribution: 0, standaloneSum: 0 }; groups.push(g); }
      g.factors.push(f.key); g.idx.push(j); g.down += f.down; g.up += f.up; g.contribution += f.contribution; g.standaloneSum += f.standalone;
    });
    groups.forEach(function (g) {
      g.swing = Math.abs(g.up - g.down); g.linear = (g.up - g.down) / 2; g.convexity = (g.up + g.down) / 2;
      g.worst = bad(g.down) >= bad(g.up) ? "down" : "up"; g.worstValue = g[g.worst];
      g.breach = limit != null && bad(g.worstValue) > limit + 1e-12 * Math.max(1, limit);
      g.share = totalSwing > 0 ? g.swing / totalSwing : 0;
      // the group's own combined move, with the correlations between its factors
      var sub = g.idx.map(function (j) { return fs[j]; }), subL = g.idx.map(function (j) { return Lv[j]; }), sc = corr && corr.matrix ? { matrix: g.idx.map(function (a) { return g.idx.map(function (b) { return corr.matrix[a][b]; }); }) } : corr;
      var r2 = corrTimes(sub, sc, subL), qq = 0; for (var t = 0; t < subL.length; t++) qq += subL[t] * r2[t];
      g.standalone = Math.sqrt(Math.max(0, qq));
      delete g.idx;
    });
    var topN = n >= 10 ? 5 : Math.max(1, Math.ceil(n / 2));   // short lists: about half of them
    var top5 = order.slice(0, topN).reduce(function (a, f) { return a + f.share; }, 0);
    var res = { factors: fs, order: order, groups: groups, higherIsBetter: hib, limit: limit, base: data.base != null ? finite(data.base, "data.base") : null,
      totalSwing: totalSwing, sumDown: sumDown, sumUp: sumUp, sigma: sigma, standalone: standalone, diversification: standalone - sigma,
      correlated: !!corr, topN: topN, topShare: top5, breaches: fs.filter(function (f) { return f.breach; }).length, shockScale: k, whatIf: wi };
    res.worstFactor = fs.slice().sort(function (a, b) { return bad(b.worstValue) - bad(a.worstValue) || a.index - b.index; })[0];
    // Joint revaluation: all factors shocked together, only valid at the base shocks and positions
    if (data.joint && (data.joint.down != null || data.joint.up != null)) {
      if (k === 1 && !wi) {
        res.joint = { down: data.joint.down != null ? finite(data.joint.down, "data.joint.down") : null, up: data.joint.up != null ? finite(data.joint.up, "data.joint.up") : null };
        res.interaction = { down: res.joint.down != null ? res.joint.down - sumDown : null, up: res.joint.up != null ? res.joint.up - sumUp : null };
      } else res.jointHidden = true;
    }
    if (wi) {
      var b0 = compute(data, { shockScale: k, sort: opts.sort });
      res.baseline = { totalSwing: b0.totalSwing, sigma: b0.sigma, worstValue: b0.worstFactor.worstValue, worstFactor: b0.worstFactor.key };
    }
    return res;
  }
  /* ======================================================================
     4. CHART INSTANCE
     ====================================================================== */
  function injectStyles() {
    if (document.getElementById("vtr-styles")) return;
    var css =
      ".vtr{position:relative;color:var(--vtr-text);background:var(--vtr-bg);font-family:var(--vtr-font);line-height:1.4}" +
      ".vtr.vtr-filled{padding:14px 14px 8px;border-radius:10px}" +
      ".vtr-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px}" +
      ".vtr-stat{background:var(--vtr-card);border-radius:8px;padding:9px 12px;min-width:0}" +
      ".vtr-stat .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--vtr-card-muted);font-weight:600;overflow-wrap:anywhere;hyphens:auto}" +
      ".vtr-stat .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".vtr-stat .n{font-size:12px;color:var(--vtr-card-muted)}" +
      ".vtr-stat .v.vtr-wrap{white-space:normal;overflow-wrap:anywhere;line-height:1.2;font-size:17px}" +
      ".vtr-scope{font-size:12px;color:var(--vtr-muted);margin:0 0 4px}" +
      ".vtr-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;margin:0 0 6px;color:var(--vtr-text)}" +
      ".vtr-legend span{display:inline-flex;align-items:center;gap:6px}" +
      ".vtr-legend i{display:inline-block;width:12px;height:12px;border-radius:3px}" +
      ".vtr-legend i.vtr-tick{width:3px;height:14px;border-radius:1px}" +
      ".vtr-legend i.vtr-ring{background:transparent!important;border:2px solid;border-radius:2px;width:9px;height:9px;transform:rotate(45deg)}" +
      ".vtr-plot{display:block;width:100%;height:auto;overflow:visible;outline:none}" +
      ".vtr-plot:focus-visible{outline:2px solid var(--vtr-focus);outline-offset:4px;border-radius:4px}" +
      ".vtr-animate .vtr-grow{animation:vtr-fade .45s ease both}" +
      "@keyframes vtr-fade{from{opacity:0}to{opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.vtr-animate .vtr-grow{animation:none}}" +
      ".vtr-tip{position:absolute;left:0;top:0;pointer-events:none;background:var(--vtr-tip-bg);color:var(--vtr-tip-text);" +
      "font-size:12px;line-height:1.45;padding:8px 10px;border-radius:8px;opacity:0;transform:translateY(4px);" +
      "transition:opacity .12s,transform .12s;white-space:nowrap;z-index:5;font-variant-numeric:tabular-nums}" +
      ".vtr-tip.vtr-on{opacity:1;transform:none}.vtr-tip b{font-weight:600}" +
      ".vtr-table{border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin:0 0 14px;min-width:100%}" +
      ".vtr-table caption{text-align:left;font-weight:700;padding:0 0 6px}" +
      ".vtr-table th,.vtr-table td{padding:5px 8px;border-bottom:1px solid rgba(127,127,127,.25);text-align:right;white-space:nowrap}" +
      ".vtr-table th:first-child,.vtr-table td:first-child{text-align:left}" +
      ".vtr-table tr.vtr-breach td{color:var(--vtr-hedge);font-weight:600}" +
      "@media (max-width:420px){.vtr-summary{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}.vtr-stat{padding:8px 10px}.vtr-stat .v{font-size:17px}}";
    var s = htmlEl("style");
    s.id = "vtr-styles";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  function resolveTrTheme(theme) {
    var t;
    if (theme == null || theme === "") theme = "veyforma";
    if (typeof theme === "string") {
      if (!THEMES.hasOwnProperty(theme)) { warn('Unknown theme "' + theme + '". The "veyforma" theme is used instead.'); theme = "veyforma"; }
      t = assign({}, BASE_THEME, THEMES[theme]);
    } else if (typeof theme === "object") {
      t = assign(theme["extends"] ? resolveTrTheme(theme["extends"]) : assign({}, BASE_THEME), theme);
      delete t["extends"];
    } else { warn("The theme option must be a theme name or an object."); t = assign({}, BASE_THEME); }
    var bg = /^#/.test(t.background) ? t.background : "#ffffff", card = /^#/.test(t.cardBackground) ? t.cardBackground : bg;
    ["axisText", "mutedText"].forEach(function (k) { t[k] = ensureContrast(t[k], bg, 4.5); });
    t.cardMuted = ensureContrast(t.mutedText, card, 4.5);
    t.hedgeText = ensureContrast(ensureContrast(t.hedge, bg, 4.5), card, 4.5);
    t.limitText = ensureContrast(ensureContrast(t.limit, bg, 4.5), card, 4.5);
    t.accentText = ensureContrast(t.accent, bg, 4.5);
    return t;
  }

  function Chart(target, options) {
    var container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container || container.nodeType !== 1) fail("container not found (" + target + ").");
    if (!options || !options.data) fail("options.data is required.");
    injectStyles();
    this.id = ++instanceCount;
    this.container = container;
    this.options = assign({}, DEFAULT_OPTIONS, options);
    this.element = htmlEl("div", "vtr");
    this.element.setAttribute("role", "figure");
    this.summaryEl = htmlEl("div", "vtr-summary", this.element);
    this.scopeEl = htmlEl("p", "vtr-scope", this.element);
    this.legendEl = htmlEl("div", "vtr-legend", this.element);
    this.plotHost = htmlEl("div", "vtr-plot-host", this.element);
    this.tipEl = htmlEl("div", "vtr-tip", this.element);
    this.tipEl.setAttribute("role", "tooltip");
    container.appendChild(this.element);
    this._animateNext = !!this.options.animate;
    this._lastWidth = 0;
    this._active = -1;
    var self = this;
    if (root.ResizeObserver) {
      this._observer = new root.ResizeObserver(function () {
        var w = Math.round(self.element.clientWidth);
        if (w && Math.abs(w - self._lastWidth) > 1) self.redraw();
      });
      this._observer.observe(this.element);
    } else {
      this._onResize = function () { self.redraw(); };
      root.addEventListener("resize", this._onResize);
    }
    this._onDocTap = function (e) { if (!self.element.contains(e.target)) self._hideTip(); };
    document.addEventListener("pointerdown", this._onDocTap);
    this.redraw();
    if (this.options.toolbar !== false && root.VeyformaToolkit) this.toolkit = root.VeyformaToolkit.attach(this, this.options.toolbar);
  }

  Chart.prototype.update = function (partial) {
    if (!partial) return this;
    if (partial.data && partial.data !== this.options.data && this.options.animate) this._animateNext = true;
    if (partial.view && partial.view !== this.options.view && this.options.animate) this._animateNext = true;
    assign(this.options, partial);
    return this.redraw();
  };
  Chart.prototype.setData = function (data) { this._res = null; return this.update({ data: data }); };
  Chart.prototype.setView = function (view) { return this.update({ view: view }); };
  Chart.prototype.setTheme = function (theme) { return this.update({ theme: theme }); };
  Chart.prototype.getTheme = function () { return resolveTrTheme(this.options.theme); };
  Chart.prototype._opts = function () { return { shockScale: this.options.shockScale, whatIf: this.options.whatIf, sort: this.options.sort }; };
  Chart.prototype.getResult = function () { return compute(this.options.data, this._opts()); };
  Chart.prototype.getFactor = function (key) { return this.getResult().factors.filter(function (f) { return f.key === String(key); })[0] || null; };
  Chart.prototype.setWhatIf = function (whatIf) { return this.update({ whatIf: whatIf }); };
  Chart.prototype.setShockScale = function (k) { return this.update({ shockScale: k }); };
  Chart.prototype._labels = function () { return assign({}, DEFAULT_LABELS, this.options.labels); };
  Chart.prototype.destroy = function () {
    if (this.toolkit && this.toolkit.destroy) this.toolkit.destroy();
    if (this._observer) this._observer.disconnect();
    if (this._onResize) root.removeEventListener("resize", this._onResize);
    document.removeEventListener("pointerdown", this._onDocTap);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  };
  Chart.prototype._hideTip = function () { this.tipEl.classList.remove("vtr-on"); if (this._hlEl) this._hlEl.setAttribute("opacity", 0); };
  Chart.prototype._placeTip = function (lines, rect, evt) {
    var tip = this.tipEl;
    tip.textContent = "";
    lines.forEach(function (ln, i) {
      if (i) tip.appendChild(document.createElement("br"));
      var node = i === 0 ? document.createElement("b") : document.createElement("span");
      node.textContent = ln;
      tip.appendChild(node);
    });
    var box = this.element.getBoundingClientRect();
    var px = evt && evt.clientX ? evt.clientX : rect.left + rect.width / 2;
    var py = evt && evt.clientY ? evt.clientY : rect.top + 10;
    tip.classList.add("vtr-on");
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(px - box.left - tw / 2, 4, Math.max(4, box.width - tw - 4)) + "px";
    var top = py - box.top - th - 14;
    if (top < 0) top = py - box.top + 18;
    tip.style.top = top + "px";
  };
  /** A "nice" axis from lo to hi with about n ticks. */
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; }
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10)), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
    for (var v = a; v <= b + step / 2; v += step) out.push(Math.round(v / step) * step);
    return { lo: a, hi: b, ticks: out, step: step };
  }

  function label(g, x, y, text, attrs) {
    var t = svgEl("text", assign({ x: x, y: y }, attrs || {}), g);
    t.textContent = text;
    return t;
  }

  Chart.prototype._bindInteraction = function (svg, W, H, theme, L, f) {
    var self = this, items = this._items, o = this.options;
    function idxAt(evt) {
      var r = svg.getBoundingClientRect(), x = (evt.clientX - r.left) * (W / r.width), y = (evt.clientY - r.top) * (H / r.height);
      for (var i = 0; i < items.length; i++) { var it = items[i]; if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return i; }
      return -1;
    }
    function show(i, evt) {
      if (i < 0) { self._hideTip(); return; }
      self._active = i;
      var it = items[i], hl = self._hlEl;
      hl.setAttribute("x", it.x - 4); hl.setAttribute("y", it.y); hl.setAttribute("width", it.w + 8); hl.setAttribute("height", it.h); hl.setAttribute("opacity", 1);
      var r = svg.getBoundingClientRect(), sx = r.width / W;
      var rect = { left: r.left + it.px * sx, top: r.top + it.py * (r.height / H), width: 0, height: 0 };
      self._placeTip(self._tipLines(it), rect, evt && evt.clientX ? evt : null);
    }
    svg.addEventListener("pointermove", function (e) { show(idxAt(e), e); });
    svg.addEventListener("pointerleave", function () { self._hideTip(); });
    svg.addEventListener("click", function (e) {
      var i = idxAt(e);
      if (i >= 0 && typeof o.onItemClick === "function") o.onItemClick(self._detail(items[i]), e);
    });
    svg.addEventListener("keydown", function (e) {
      var i = self._active;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") i = Math.min(items.length - 1, i + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = Math.max(0, i < 0 ? 0 : i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = items.length - 1;
      else if (e.key === "Escape") { self._hideTip(); return; }
      else if ((e.key === "Enter" || e.key === " ") && i >= 0) {
        if (typeof o.onItemClick === "function") o.onItemClick(self._detail(items[i]), e);
        e.preventDefault(); return;
      } else return;
      e.preventDefault();
      show(i, null);
    });
    svg.addEventListener("blur", function () { self._hideTip(); });
  };

  Chart.prototype.createTable = function () {
    var ex = this.getExportData(), wrap = htmlEl("div", "vtr-tables");
    ex.sheets.forEach(function (sh) {
      if (sh.name === "Notes") return;
      var tb = htmlEl("table", "vtr-table", wrap);
      htmlEl("caption", null, tb).textContent = sh.name;
      var hr = htmlEl("tr", null, htmlEl("thead", null, tb));
      sh.columns.forEach(function (c) { var th = htmlEl("th", null, hr); th.scope = "col"; th.textContent = c.label; });
      var body = htmlEl("tbody", null, tb);
      sh.text.forEach(function (r, i) {
        var tr = htmlEl("tr", sh.flag && sh.flag[i] ? "vtr-breach" : null, body);
        r.forEach(function (v, j) { var td = htmlEl(j ? "td" : "th", null, tr); if (!j) td.scope = "row"; td.textContent = v; });
      });
    });
    return wrap;
  };

  function shockText(v, unit, locale) {
    if (v == null || !isFinite(v)) return "";
    var body = Number(Math.abs(v).toFixed(4)).toLocaleString(locale || undefined, { maximumFractionDigits: 4 });
    return (v > 0 ? "+" : v < 0 ? "−" : "") + body + (unit ? (unit === "%" ? "%" : " " + unit) : "");
  }

  Chart.prototype.redraw = function () {
    var o = this.options, data = o.data, L = this._labels();
    var res = this._res = compute(data, this._opts());
    var theme = resolveTrTheme(o.theme), f = makeFormatters(data, o.locale), el = this.element, st = el.style;
    var family = theme.fontFamily === "inherit" ? (root.getComputedStyle ? root.getComputedStyle(this.container).fontFamily : "sans-serif") : theme.fontFamily;
    var filled = theme.background && theme.background !== "transparent", bg = filled ? theme.background : "#ffffff";
    st.setProperty("--vtr-text", theme.text); st.setProperty("--vtr-muted", theme.mutedText);
    st.setProperty("--vtr-bg", filled ? theme.background : "transparent"); st.setProperty("--vtr-font", family);
    st.setProperty("--vtr-card", theme.cardBackground); st.setProperty("--vtr-card-muted", theme.cardMuted);
    st.setProperty("--vtr-tip-bg", theme.tooltipBackground); st.setProperty("--vtr-tip-text", theme.tooltipText);
    st.setProperty("--vtr-focus", theme.focus); st.setProperty("--vtr-hedge", theme.limitText);
    el.classList.toggle("vtr-filled", !!filled);
    el.setAttribute("aria-label", o.ariaLabel || data.title || "Risk-factor tornado");
    var view = o.view;
    if (["factors", "groups", "contribution"].indexOf(view) < 0) { warn('Unknown view "' + view + '". The factor view is shown instead.'); view = "factors"; }
    if (o.sort !== "swing" && o.sort !== "worst") warn('Unknown sort "' + o.sort + '". Factors are ranked by swing instead.');
    this._view = view;
    this._renderSummary(res, f, L);
    var scope = [L[view], o.shockScale != null && +o.shockScale !== 1 ? "shocks ×" + (+o.shockScale) : null, data.unit || null, res.whatIf ? L.whatIf + " applied" : null].filter(Boolean).join(" · ");
    this.scopeEl.textContent = scope;
    this._renderLegend(view, theme, L, res);
    var W = Math.max(280, Math.round(this.plotHost.clientWidth || el.clientWidth || 720));
    this._lastWidth = Math.round(el.clientWidth);
    var fs = theme.fontSize || 12;
    this.plotHost.textContent = "";
    var svg = svgEl("svg", { "class": "vtr-plot", role: "img", tabindex: 0, "font-family": family }, this.plotHost);
    svg.style.fontSize = fs + "px";
    var animate = this._animateNext && o.animate; this._animateNext = false;
    if (animate) svg.classList.add("vtr-animate");
    var ctx = { svg: svg, W: W, fs: fs, theme: theme, f: f, L: L, family: family, bg: bg, res: res, items: [], points: {} };
    var H = view === "contribution" ? this._drawContribution(ctx) : this._drawRows(ctx, view);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("aria-label", (o.ariaLabel || data.title || "Risk-factor tornado") + ". " + this.describe());
    this._items = ctx.items; this._points = ctx.points;
    this._hlEl = svgEl("rect", { x: 0, y: 0, width: 0, height: 0, rx: 4, fill: theme.text, "fill-opacity": 0.06, opacity: 0, "pointer-events": "none" }, svg);
    svg.insertBefore(this._hlEl, svg.firstChild);
    this._bindInteraction(svg, W, H, theme, L, f);
    return this;
  };

  Chart.prototype._shockNames = function () {
    var L = this._labels(), s = this.options.data.shockLabels || {};
    return { down: s.down || L.down, up: s.up || L.up };
  };

  Chart.prototype._renderSummary = function (res, f, L) {
    var box = this.summaryEl, o = this.options;
    box.textContent = "";
    box.style.display = o.summary === false ? "none" : "";
    if (o.summary === false) return;
    function stat(k, v, n, wrap) {
      var s = htmlEl("div", "vtr-stat", box);
      htmlEl("div", "k", s).textContent = k;
      htmlEl("div", wrap ? "v vtr-wrap" : "v", s).textContent = v;
      if (n) htmlEl("div", "n", s).textContent = n;
    }
    var SN = this._shockNames(), top = res.order[0], w = res.worstFactor;
    stat(L.largest, top.label, L.swing.toLowerCase() + " " + f.value(top.swing) + " · " + f.percent(top.share, 0) + " of the total", true);
    stat(L.worstShock, f.signed(w.worstValue), w.label + ", " + SN[w.worst].toLowerCase() + (res.limit != null ? (res.breaches ? " · " + res.breaches + " beyond the limit" : " · within the limit") : "") +
      (res.baseline ? " · was " + f.signed(res.baseline.worstValue) : ""));
    stat(fill(L.topShare, { n: res.topN }), f.percent(res.topShare, 0), "of the total swing across " + res.factors.length + " factors");
    stat(L.combined, "±" + f.value(res.sigma), res.baseline ? L.whatIf + ": was ±" + f.value(res.baseline.sigma)
      : res.correlated ? (res.standalone > 0 ? f.percent(res.diversification / res.standalone, 0) + " below the sum of stand-alone moves" : "") : "factors treated as independent");
    Array.prototype.forEach.call(box.querySelectorAll(".vtr-stat .v"), function (v) {
      v.style.fontSize = "";
      var size = parseFloat(root.getComputedStyle ? root.getComputedStyle(v).fontSize : 19) || 19;
      while (v.scrollWidth > v.clientWidth && size > 12) { size -= 1; v.style.fontSize = size + "px"; }
    });
  };

  Chart.prototype._renderLegend = function (view, theme, L, res) {
    var box = this.legendEl, SN = this._shockNames();
    box.textContent = "";
    box.style.display = this.options.legend === false ? "none" : "";
    function item(colour, text, cls) {
      var s = htmlEl("span", null, box), i = htmlEl("i", cls || null, s);
      if (cls === "vtr-ring") i.style.borderColor = colour; else i.style.background = colour;
      s.appendChild(document.createTextNode(text));
    }
    if (view === "contribution") { item(theme.contribution, L.contributionAdds); item(theme.hedge, L.hedge); item(theme.convexity, L.standalone, "vtr-ring"); return; }
    item(theme.down, SN.down); item(theme.up, SN.up);
    if (res.factors.some(function (x) { return x.asymmetry >= 0.1; })) item(theme.convexity, L.convexity + " (midpoint)", "vtr-ring");
    if (res.limit != null) item(theme.limit, L.limit, "vtr-tick");
  };

  function rowLayout(c, names) {
    var nameW = Math.min(Math.max.apply(null, names.map(function (n) { return textWidth(n, c.fs, 600, c.family); })) + 12, c.W * 0.34);
    var narrow = c.W - nameW < 260;
    return { nameW: narrow ? 0 : nameW, narrow: narrow };
  }
  /** Axis ticks along the top, thinned so no two labels touch. */
  function topTicks(c, g, nt, xs, y, x0, x1, gridTop, gridBottom) {
    var theme = c.theme, fs = c.fs, fam = c.family, W = c.W, f = c.f, lastRight = -Infinity;
    var tickW = Math.max.apply(null, nt.ticks.map(function (t) { return textWidth(f.value(t), fs - 1, 400, fam); }));
    var every = Math.max(1, Math.ceil((tickW + 10) / ((x1 - x0) / Math.max(1, nt.ticks.length - 1))));
    nt.ticks.forEach(function (t, ti) {
      svgEl("line", { x1: xs(t), x2: xs(t), y1: gridTop, y2: gridBottom, stroke: t === 0 ? theme.axis : theme.grid, "stroke-width": t === 0 ? 1.2 : 1 }, g);
      if (ti % every) return;
      var tt = f.value(t), tw = textWidth(tt, fs - 1, 400, fam), w2 = tw / 2, tx = xs(t), anc = tx - w2 < 0 ? "start" : tx + w2 > W ? "end" : "middle";
      var left = anc === "start" ? tx : anc === "end" ? tx - tw : tx - w2;
      if (left < lastRight + 8) return;
      lastRight = left + tw;
      label(g, tx, y + fs, tt, { "text-anchor": anc, fill: theme.axisText, "font-size": fs - 1, "class": "vtr-tick" });
    });
  }
  /** Factor rows (ranked, top N plus "Other") or group rows. */
  Chart.prototype._rowsFor = function (res, view, L) {
    if (view === "groups") return res.groups.slice().sort(function (a, b) { return b.swing - a.swing; }).map(function (g) { return { kind: "group", obj: g, name: g.label, down: g.down, up: g.up, breach: g.breach, convexity: g.convexity, asym: Math.abs(g.linear) + Math.abs(g.convexity) > 0 ? Math.abs(g.convexity) / (Math.abs(g.linear) + Math.abs(g.convexity)) : 0 }; });
    var top = +this.options.top > 0 ? Math.floor(+this.options.top) : res.order.length;
    var rows = res.order.slice(0, top).map(function (x) { return { kind: "factor", obj: x, name: x.rank + ". " + x.label, down: x.down, up: x.up, breach: x.breach, convexity: x.convexity, asym: x.asymmetry }; });
    var rest = res.order.slice(top);
    if (rest.length) {
      var d = 0, u = 0, sw = 0; rest.forEach(function (x) { d += x.down; u += x.up; sw += x.swing; });
      rows.push({ kind: "other", obj: { count: rest.length, down: d, up: u, swing: sw, share: res.totalSwing > 0 ? sw / res.totalSwing : 0, factors: rest }, name: fill(L.other, { n: rest.length }), down: d, up: u, breach: false, convexity: (d + u) / 2, asym: 0 });
    }
    return rows;
  };
  Chart.prototype._drawRows = function (c, view) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, hib = res.higherIsBetter;
    var rows = this._rowsFor(res, view, L);
    var lay = rowLayout(c, rows.map(function (r) { return r.name; }));
    var limX = res.limit != null ? (hib ? -res.limit : res.limit) : null;
    var vals = []; rows.forEach(function (r) { vals.push(r.down, r.up); });
    var lo = Math.min.apply(null, vals.concat([0, limX != null ? limX : 0])), hi = Math.max.apply(null, vals.concat([0, limX != null ? limX : 0]));
    var lw = function (v) { return textWidth(f.signed(v), fs - 1, 600, fam) + 6; };
    var padL = Math.max.apply(null, [4].concat(vals.filter(function (v) { return v < 0; }).map(lw)));
    var padR = Math.max.apply(null, [4].concat(vals.filter(function (v) { return v >= 0; }).map(lw)));
    var x0 = lay.nameW + padL, x1 = W - padR;
    var nt = niceTicks(lo, hi, Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))));
    var xs = function (v) { return x0 + (clamp(v, nt.lo, nt.hi) - nt.lo) / (nt.hi - nt.lo) * (x1 - x0); };
    var y = 4, rowH = Math.max(36, fs * 3), extra = lay.narrow ? fs + 4 : 0, gridTop = y + fs + 6, gridBottom = gridTop + rows.length * (rowH + extra);
    var g = svgEl("g", { "class": "vtr-rows" }, svg);
    topTicks(c, g, nt, xs, y, x0, x1, gridTop, gridBottom);
    var gb = svgEl("g", null, g), gc = svgEl("g", { "class": "vtr-cvx-layer" }, g), gl = svgEl("g", null, g);   // bars, then diamonds, then labels on top
    if (limX != null) svgEl("line", { x1: xs(limX), x2: xs(limX), y1: gridTop - 2, y2: gridBottom, stroke: theme.limit, "stroke-width": 1.6, "stroke-dasharray": "5 3", "class": "vtr-limit" }, gc);
    var SN = this._shockNames(), self = this;
    rows.forEach(function (r, i) {
      var ry = gridTop + i * (rowH + extra) + extra, bh = Math.max(rowH * 0.32, fs), by = ry + (rowH - 2 * bh - 3) / 2;
      var nameFill = r.breach ? theme.limitText : r.kind === "other" ? theme.mutedText : theme.text;
      var nm = fit(r.name, lay.narrow ? W : lay.nameW - 8, fs, r.kind === "other" ? 400 : 600, fam);
      if (lay.narrow) svgEl("rect", { x: 0, y: ry - 3 - fs * 0.95, width: textWidth(nm, fs, 600, fam) + 4, height: fs * 1.25, fill: c.bg, "class": "vtr-lbg" }, gl);
      label(gl, 0, lay.narrow ? ry - 3 : ry + rowH / 2 + fs * 0.35, fit(r.name, lay.narrow ? W : lay.nameW - 8, fs, r.kind === "other" ? 400 : 600, fam), { fill: nameFill, "font-size": fs, "font-weight": r.kind === "other" ? 400 : 600, "class": "vtr-name" });
      [["down", by], ["up", by + bh + 3]].forEach(function (p) {
        var v = r[p[0]], xa = xs(Math.min(0, v)), xb = xs(Math.max(0, v)), isWorst = r.kind !== "other" && r.obj.worst === p[0];
        svgEl("rect", { x: xa, y: p[1], width: Math.max(0.8, xb - xa), height: bh, rx: 2, fill: theme[p[0]], "class": "vtr-grow vtr-bar", "data-shock": p[0] }, gb);
        var lbreach = r.breach && isWorst;
        var vt = f.signed(v), vw = textWidth(vt, fs - 1, lbreach ? 700 : 400, fam), vx = v < 0 ? xa - 4 - vw : xb + 4;
        svgEl("rect", { x: vx - 2, y: p[1] + bh / 2 - (fs - 1) * 0.6, width: vw + 4, height: (fs - 1) * 1.2, fill: c.bg, "class": "vtr-lbg" }, gl);
        label(gl, v < 0 ? xa - 4 : xb + 4, p[1] + bh / 2 + (fs - 1) * 0.35, f.signed(v), { "text-anchor": v < 0 ? "end" : "start", fill: lbreach ? theme.limitText : theme.text, "font-size": fs - 1, "font-weight": lbreach ? 700 : 400, "class": "vtr-val" });
      });
      if (r.asym >= 0.1) {
        var cx = xs(r.convexity), cy = by + bh + 1.5;
        svgEl("path", { d: "M" + cx + "," + (cy - 4) + "L" + (cx + 4) + "," + cy + "L" + cx + "," + (cy + 4) + "L" + (cx - 4) + "," + cy + "Z", fill: c.bg, stroke: theme.convexity, "stroke-width": 1.5, "class": "vtr-cvx" }, gc);
      }
      var endX = xs(Math.max(0, r.down, r.up));
      if (r.kind === "factor") c.points[r.obj.key] = { x: endX, y: by };
      if (r.kind === "group") c.points["group:" + r.obj.key] = { x: endX, y: by };
      c.items.push({ kind: r.kind, obj: r.obj, x: 0, y: ry - extra, w: W, h: rowH + extra, px: endX, py: by });
    });
    if (view === "groups") res.factors.forEach(function (x) { if (!c.points[x.key]) c.points[x.key] = c.points["group:" + x.group]; });
    var notes = [];
    if (limX != null) notes.push(L.limit + " " + f.signed(limX) + (res.breaches ? ": " + res.breaches + " factor" + (res.breaches > 1 ? "s" : "") + " beyond it" : ": no factor beyond it"));
    if (view === "factors") {
      var shown = rows.filter(function (r) { return r.kind === "factor"; }).length;
      notes.push("Each factor shocked alone" + (shown < res.factors.length ? "; top " + shown + " of " + res.factors.length + ", the rest summed" : ""));
      if (res.interaction) {
        var it = res.interaction, parts = [];
        if (it.down != null) parts.push(SN.down.toLowerCase() + " together " + f.signed(res.joint.down) + " vs sum " + f.signed(res.sumDown));
        if (it.up != null) parts.push(SN.up.toLowerCase() + " together " + f.signed(res.joint.up) + " vs sum " + f.signed(res.sumUp));
        notes.push("All factors " + parts.join(", "));
      }
    } else notes.push("Every factor in the group shocked the same way at once (sum of single shocks)");
    var y2 = gridBottom + fs + 8;
    notes.forEach(function (t) { label(svg, 0, y2, fit(t + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1, "class": "vtr-note" }); y2 += fs + 3; });
    return Math.ceil(y2 - fs + 6);
  };

  /** Contribution view: each factor's share of the combined (correlated) move, hedges to the left, stand-alone move as a diamond. */
  Chart.prototype._drawContribution = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg;
    var srt = res.factors.slice().sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution) || a.index - b.index; });
    var top = +this.options.top > 0 ? Math.floor(+this.options.top) : srt.length, rest = srt.slice(top);
    var rows = srt.slice(0, top).sort(function (a, b) { return b.contribution - a.contribution; }).map(function (x) { return { kind: "factor", obj: x, name: x.label, v: x.contribution, k: x.standalone }; });
    if (rest.length) { var sv = 0, sk = 0; rest.forEach(function (x) { sv += x.contribution; sk += x.standalone; }); rows.push({ kind: "other", obj: { count: rest.length, contribution: sv, standalone: sk, factors: rest }, name: fill(L.other, { n: rest.length }), v: sv, k: null }); }
    var lay = rowLayout(c, rows.map(function (r) { return r.name; }));
    var valW = Math.max.apply(null, rows.map(function (r) { return textWidth(f.signed(r.v), fs, 700, fam); })) + 10;
    var x0 = lay.nameW, x1 = W - valW, rowH = Math.max(24, fs * 2), extra = lay.narrow ? fs + 4 : 0, y = 4;
    var lo = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.v; }))), hi = Math.max.apply(null, rows.map(function (r) { return Math.max(r.v, r.k || 0); })) || 1;
    var nt = niceTicks(lo, hi, Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))));
    var xs = function (v) { return x0 + (clamp(v, nt.lo, nt.hi) - nt.lo) / (nt.hi - nt.lo) * (x1 - x0); };
    var gridTop = y + fs + 6, gridBottom = gridTop + rows.length * (rowH + extra), g = svgEl("g", { "class": "vtr-contrib" }, svg);
    topTicks(c, g, nt, xs, y, x0, x1, gridTop, gridBottom);
    rows.forEach(function (r, i) {
      var ry = gridTop + i * (rowH + extra) + extra, bh = rowH * 0.56, by = ry + (rowH - bh) / 2, neg = r.v < 0;
      label(g, 0, lay.narrow ? ry - 3 : by + bh / 2 + fs * 0.35, fit(r.name, lay.narrow ? W - valW : lay.nameW - 8, fs, r.kind === "other" ? 400 : 600, fam), { fill: r.kind === "other" ? theme.mutedText : theme.text, "font-size": fs, "font-weight": r.kind === "other" ? 400 : 600, "class": "vtr-name" });
      var xa = xs(Math.min(0, r.v)), xb = xs(Math.max(0, r.v));
      svgEl("rect", { x: xa, y: by, width: Math.max(0.8, xb - xa), height: bh, rx: 2, fill: neg ? theme.hedge : theme.contribution, "class": "vtr-grow vtr-cbar" + (neg ? " vtr-hedge" : "") }, g);
      if (r.k != null) { var kx = xs(r.k), ky = by + bh / 2;
        svgEl("path", { d: "M" + kx + "," + (ky - 5) + "L" + (kx + 5) + "," + ky + "L" + kx + "," + (ky + 5) + "L" + (kx - 5) + "," + ky + "Z", fill: c.bg, stroke: theme.convexity, "stroke-width": 1.6, "class": "vtr-sa" }, g); }
      label(g, W, by + bh / 2 + fs * 0.35, f.signed(r.v), { "text-anchor": "end", fill: neg ? theme.hedgeText : theme.text, "font-size": fs, "font-weight": 700, "class": "vtr-val" });
      if (r.kind === "factor") c.points[r.obj.key] = { x: neg ? xa : xb, y: by };
      c.items.push({ kind: r.kind, obj: r.obj, contrib: true, x: 0, y: ry - extra, w: W, h: rowH + extra, px: neg ? xa : xb, py: by });
    });
    var corrText = !res.correlated ? "no correlations given, so factors are treated as independent and none can hedge another"
      : this.options.data.correlation.matrix ? "with the correlation matrix given" : "with correlations of " + f.percent(this.options.data.correlation.within || 0, 0) + " within groups and " + f.percent(this.options.data.correlation.across || 0, 0) + " across";
    var notes = ["Shares add up to the combined move of ±" + f.value(res.sigma) + "; stand-alone moves add up to " + f.value(res.standalone), "Combined " + corrText];
    var y2 = gridBottom + fs + 8;
    notes.forEach(function (t) { label(svg, 0, y2, fit(t + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1, "class": "vtr-note" }); y2 += fs + 3; });
    return Math.ceil(y2 - fs + 6);
  };

  Chart.prototype._tipLines = function (it) {
    var o = this.options, f = makeFormatters(o.data, o.locale), L = this._labels(), res = this._res, SN = this._shockNames(), loc = o.locale;
    var lvl = function (v) { return res.base != null ? " → " + f.value(res.base + v) : ""; };
    if (it.kind === "other") {
      var q = it.obj;
      return it.contrib ? [fill(L.other, { n: q.count }), "Shares together " + f.signed(q.contribution)]
        : [fill(L.other, { n: q.count }), SN.down + " (sum) " + f.signed(q.down), SN.up + " (sum) " + f.signed(q.up), L.swing + " together " + f.value(q.swing) + " (" + f.percent(q.share, 0) + " of the total)"];
    }
    if (it.kind === "group") {
      var g = it.obj;
      return [g.label + " · " + g.factors.length + " factor" + (g.factors.length > 1 ? "s" : ""), SN.down + " " + f.signed(g.down) + lvl(g.down), SN.up + " " + f.signed(g.up) + lvl(g.up),
        L.swing + " " + f.value(g.swing) + " (" + f.percent(g.share, 0) + " of the total)", "Combined move of the group ±" + f.value(g.standalone) + " · share of the total ±" + f.value(res.sigma) + ": " + f.signed(g.contribution)]
        .concat(g.breach ? [L.worst + " beyond the limit"] : []);
    }
    var x = it.obj;
    var lines = [x.label, x.group + " · rank " + x.rank + " of " + res.factors.length,
      SN.down + (x.shockDown != null ? " (" + shockText(x.shockDown, x.unit, loc) + ")" : "") + " " + f.signed(x.down) + lvl(x.down),
      SN.up + (x.shockUp != null ? " (" + shockText(x.shockUp, x.unit, loc) + ")" : "") + " " + f.signed(x.up) + lvl(x.up),
      L.swing + " " + f.value(x.swing) + " · " + f.percent(x.share, 0) + " of the total (top " + x.rank + ": " + f.percent(x.cumShare, 0) + ")",
      L.linear + " ±" + f.value(Math.abs(x.linear)) + " · " + L.convexity.toLowerCase() + " " + f.signed(x.convexity),
      "Share of the combined move " + f.signed(x.contribution) + " (stand-alone " + f.value(x.standalone) + ")"];
    if (x.breach) lines.push(SN[x.worst] + " is beyond the limit of " + f.value(res.limit));
    return lines;
  };

  Chart.prototype._detail = function (it) {
    if (!it) return null;
    var view = this._view;
    if (it.kind === "other") return { view: view, kind: "other", count: it.obj.count, down: it.obj.down, up: it.obj.up, swing: it.obj.swing, contribution: it.obj.contribution, factors: it.obj.factors.map(function (x) { return x.key; }) };
    if (it.kind === "group") { var g = it.obj; return { view: view, kind: "group", key: g.key, label: g.label, factors: g.factors.slice(), down: g.down, up: g.up, swing: g.swing, share: g.share, linear: g.linear, convexity: g.convexity, worst: g.worst, worstValue: g.worstValue, breach: g.breach, contribution: g.contribution, standalone: g.standalone }; }
    var x = it.obj;
    return { view: view, kind: "factor", key: x.key, label: x.label, group: x.group, unit: x.unit, shockDown: x.shockDown, shockUp: x.shockUp, down: x.down, up: x.up, swing: x.swing, share: x.share, cumShare: x.cumShare, rank: x.rank,
      linear: x.linear, convexity: x.convexity, asymmetry: x.asymmetry, worst: x.worst, worstValue: x.worstValue, breach: x.breach, contribution: x.contribution, standalone: x.standalone, source: x.source };
  };

  Chart.prototype.howToRead = function () {
    var v = this._view || this.options.view;
    if (v === "contribution") return "Each bar is one factor's share of the combined move when all factors move together with their correlations. Shares add up exactly to the combined move; a bar to the left means the factor hedges the others. The diamond marks the factor's move on its own, so the gap between the diamond and the bar is diversification.";
    if (v === "groups") return "Each row is one group of factors, such as a risk class, with every factor in it shocked down (upper bar) and up (lower bar) at the same time. Rows are sorted by swing, the distance between the two results.";
    return "Each row is one risk factor, shocked down (upper bar) and up (lower bar) on its own while everything else stays put. Rows are ranked by swing, the distance between the two results, so the factors that matter most are at the top. A diamond marks the midpoint of the two results when they are clearly unequal (convexity)" + (this._res && this._res.limit != null ? "; the dashed line is the loss limit." : ".");
  };

  Chart.prototype.describe = function () {
    var o = this.options, f = makeFormatters(o.data, o.locale), L = this._labels(), res = this._res || compute(o.data, this._opts()), SN = this._shockNames(), out = [];
    var t = res.order[0];
    out.push("The largest driver is " + t.label + ": " + SN.down.toLowerCase() + " gives " + f.signed(t.down) + " and " + SN.up.toLowerCase() + " " + f.signed(t.up) + ", a swing of " + f.value(t.swing) + " (" + f.percent(t.share, 0) + " of the total swing).");
    if (res.factors.length > res.topN) out.push("The top " + res.topN + " of " + res.factors.length + " factors explain " + f.percent(res.topShare, 0) + ".");
    var w = res.worstFactor;
    out.push("The worst single shock is " + w.label + " " + SN[w.worst].toLowerCase() + " at " + f.signed(w.worstValue) + (res.limit != null ? (res.breaches ? ", beyond the limit of " + f.value(res.limit) + " (" + res.breaches + " factor" + (res.breaches > 1 ? "s" : "") + " in all)" : ", within the limit of " + f.value(res.limit)) : "") + ".");
    var cv = res.factors.filter(function (x) { return x.asymmetry >= 0.25 && x.swing > 0; }).sort(function (a, b) { return Math.abs(b.convexity) - Math.abs(a.convexity); });
    if (cv.length) out.push(cv.length + " factor" + (cv.length > 1 ? "s are" : " is") + " strongly asymmetric, led by " + cv[0].label + " (convexity " + f.signed(cv[0].convexity) + "), so a bigger shock would cost more than in proportion.");
    if (res.correlated) {
      var cs = res.factors.slice().sort(function (a, b) { return b.contribution - a.contribution; }), hedges = res.factors.filter(function (x) { return x.contribution < 0; }).sort(function (a, b) { return a.contribution - b.contribution; });
      out.push("Moving together with their correlations, the factors give a combined move of ±" + f.value(res.sigma) + ", " + f.percent(res.standalone > 0 ? res.diversification / res.standalone : 0, 0) + " less than the sum of their stand-alone moves; " + cs[0].label + " contributes most (" + f.signed(cs[0].contribution) + ")" + (hedges.length ? " and " + hedges[0].label + " hedges the most (" + f.signed(hedges[0].contribution) + ")" : "") + ".");
    }
    if (res.interaction && res.interaction.down != null) out.push("Shocked all at once, the down case gives " + f.signed(res.joint.down) + " against " + f.signed(res.sumDown) + " for the sum of single shocks, an interaction of " + f.signed(res.interaction.down) + ".");
    if (res.baseline) out.push("The what-if changes the worst single shock from " + f.signed(res.baseline.worstValue) + " to " + f.signed(w.worstValue) + ".");
    return out.join(" ");
  };

  /* ======================================================================
     5. EXPORT AND NOTES
     ====================================================================== */
  Chart.prototype.getExportData = function () {
    var o = this.options, data = o.data, L = this._labels(), f = makeFormatters(data, o.locale), res = this._res || compute(data, this._opts()), SN = this._shockNames(), loc = o.locale;
    var unit = { prefix: data.prefix || "", suffix: data.suffix || "", decimals: data.decimals != null ? data.decimals : 0, negatives: data.negatives };
    var money = function (label) { return { label: label, type: "number", unit: unit }; };
    var plain = function (label) { return { label: label, type: "number", unit: { decimals: 4 } }; };
    var pct = function (label) { return { label: label, type: "percent", decimals: 1 }; };
    var txt = function (label) { return { label: label, type: "text" }; };
    var sheets = [];
    var limit = o.exportRows != null ? o.exportRows : 20000, order = res.order, cut = order.length > limit;
    if (cut) order = order.slice(0, limit);
    var fr = order.map(function (x) { return [x.rank, x.label, x.group, x.unit, x.shockDown, x.shockUp, x.down, x.up, x.swing, x.share, x.cumShare, x.linear, x.convexity, SN[x.worst], x.worstValue, x.breach ? "Yes" : "No", x.contribution, x.standalone]; });
    sheets.push({ name: "Factors", columns: [{ label: "Rank", type: "number", unit: { decimals: 0 } }, txt("Risk factor"), txt("Group"), txt("Shock unit"), plain("Shock down"), plain("Shock up"), money(SN.down), money(SN.up), money(L.swing), pct("Share of total swing"), pct("Cumulative share"), money(L.linear), money(L.convexity), txt("Worst shock"), money(L.worst), txt("Beyond limit"), money("Share of combined move"), money("Stand-alone move")],
      rows: fr, text: order.map(function (x) { return [String(x.rank), x.label, x.group, x.unit, shockText(x.shockDown, "", loc) || "–", shockText(x.shockUp, "", loc) || "–", f.signed(x.down), f.signed(x.up), f.value(x.swing), f.percent(x.share), f.percent(x.cumShare), f.signed(x.linear), f.signed(x.convexity), SN[x.worst], f.signed(x.worstValue), x.breach ? "Yes" : "No", f.signed(x.contribution), f.value(x.standalone)]; }),
      flag: order.map(function (x) { return x.breach; }) });
    sheets.push({ name: "Groups", columns: [txt("Group"), { label: "Factors", type: "number", unit: { decimals: 0 } }, money(SN.down + " (sum)"), money(SN.up + " (sum)"), money(L.swing), pct("Share of total swing"), money(L.worst), txt("Beyond limit"), money("Share of combined move"), money("Group combined move")],
      rows: res.groups.map(function (g) { return [g.label, g.factors.length, g.down, g.up, g.swing, g.share, g.worstValue, g.breach ? "Yes" : "No", g.contribution, g.standalone]; }),
      text: res.groups.map(function (g) { return [g.label, String(g.factors.length), f.signed(g.down), f.signed(g.up), f.value(g.swing), f.percent(g.share), f.signed(g.worstValue), g.breach ? "Yes" : "No", f.signed(g.contribution), f.value(g.standalone)]; }),
      flag: res.groups.map(function (g) { return g.breach; }) });
    var sm = [["Total swing", res.totalSwing], ["Sum of " + SN.down.toLowerCase() + " impacts", res.sumDown], ["Sum of " + SN.up.toLowerCase() + " impacts", res.sumUp]];
    if (res.joint) {
      if (res.joint.down != null) sm.push(["All factors " + SN.down.toLowerCase() + " together", res.joint.down], [L.interaction + " (" + SN.down.toLowerCase() + ")", res.interaction.down]);
      if (res.joint.up != null) sm.push(["All factors " + SN.up.toLowerCase() + " together", res.joint.up], [L.interaction + " (" + SN.up.toLowerCase() + ")", res.interaction.up]);
    }
    sm.push([L.combined + " (±)", res.sigma], ["Sum of stand-alone moves", res.standalone], ["Diversification", res.diversification]);
    if (res.limit != null) sm.push([L.limit, res.limit]);
    sheets.push({ name: "Summary", columns: [txt("Item"), money("Amount")], rows: sm, text: sm.map(function (r) { return [r[0], /Sum|Interaction|together/.test(r[0]) ? f.signed(r[1]) : f.value(r[1])]; }) });
    var notes = (o.annotations || []).map(function (a, i) { return [String(i + 1), a.factor != null ? String(a.factor) : "Group: " + String(a.group || ""), a.text || ""]; });
    if (notes.length) sheets.push({ name: "Notes", columns: [txt("No."), txt("Factor or group"), txt("Note")], rows: notes });
    var c = data.correlation;
    return {
      title: data.title || "Risk-factor tornado", subtitle: data.subtitle || "", summary: this.describe(), library: "Veyforma Risk-Factor Tornado " + VERSION, sheets: sheets,
      meta: [["Unit", data.unit], ["As of", data.asOf], ["Desk", data.desk], ["Measure", res.higherIsBetter ? "Higher is better (for example P&L)" : "Lower is better (for example capital)"],
        ["Ranking", o.sort === "worst" ? "By worst result" : "By swing"], ["Shocks", SN.down + " / " + SN.up + (res.shockScale !== 1 ? ", scaled ×" + res.shockScale : "")],
        ["What-if", res.whatIf ? Object.keys(res.whatIf).map(function (k) { return k + " × " + res.whatIf[k]; }).join(", ") : null],
        ["Correlation", !c ? "None given (independent factors)" : c.matrix ? "Matrix given" : "Within groups " + (c.within || 0) + ", across " + (c.across || 0)],
        ["Limit", res.limit != null ? f.value(res.limit) + " (" + res.breaches + " beyond)" : null],
        ["Method", "Impact = given down/up result, or Δ·s + ½Γ·s²; swing = |up − down|; linear part L = (up − down) ÷ 2, convexity C = (up + down) ÷ 2; a shock k times larger ≈ L·k + C·k²; combined move σ = √(Lᵀ ρ L); factor share = L_k (ρL)_k ÷ σ (Euler allocation, adds up to σ)" + (cut ? "; factor sheet limited to the " + limit + " largest swings" : "")],
        ["Data source", data.source]]
    };
  };
  Chart.prototype._annotationPoint = function (a) {
    var p = this._points || {};
    if (a.factor != null) return p[String(a.factor)] || null;
    if (a.group != null) return p["group:" + String(a.group)] || null;
    return null;
  };
  Chart.prototype._annotationTarget = function (evt) {
    var items = this._items || [], it = null;
    if (!evt) it = items[this._active];
    else {
      var svg = this.plotHost.querySelector("svg"), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      var x = (evt.clientX - r.left) * (vb.width / r.width), y = (evt.clientY - r.top) * (vb.height / r.height);
      for (var i = 0; i < items.length; i++) { var q = items[i]; if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) { it = q; break; } }
    }
    if (!it || it.kind === "other") return null;
    return it.kind === "group" ? { group: it.obj.key } : { factor: it.obj.key };
  };
  Chart.prototype._annotationLabel = function (a) {
    if (a.group != null) return String(a.group);
    var x = (this._res || this.getResult()).factors.filter(function (q) { return q.key === String(a.factor); })[0];
    return x ? x.label : String(a.factor || "");
  };

  /* ======================================================================
     6. PUBLIC API
     ====================================================================== */
  root.VeyRiskTornado = {
    version: VERSION,
    /** Draws the chart inside a container element or CSS selector. */
    create: function (target, options) { return new Chart(target, options); },
    /** Works out every figure without drawing. opts: { shockScale, whatIf, sort }. */
    compute: function (data, opts) { return compute(data, opts); },
    listThemes: function () { return Object.keys(THEMES); },
    getTheme: function (t) { return resolveTrTheme(t); },
    defaults: { options: DEFAULT_OPTIONS, labels: DEFAULT_LABELS, theme: BASE_THEME }
  };
})(typeof window !== "undefined" ? window : this);

// P&L Attribution – Veyforma Chart Library · https://www.veyforma.com/charts/pnl-attribution
/*!
 * Veyforma P&L Attribution v1.0.0
 * Explains the gap between front-office hypothetical P&L (HPL) and the risk model's risk-theoretical
 * P&L (RTPL) factor by factor, and runs the FRTB P&L attribution test on the daily totals: Spearman
 * correlation and the Kolmogorov-Smirnov statistic over the last 250 days, with the green, amber and
 * red zones. On top of the test it shows each factor's share of the unexplained P&L volatility (adds up
 * exactly), the test result if each factor's gap were closed, and the shortest path of fixes to green.
 * Original work created for Veyforma. Contains no third-party code.
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 *
 * Load veyforma-toolkit.js as well to get the chart menu: full screen, print,
 * PNG, JPEG, SVG, PDF, CSV and Excel downloads, copy, notes and the
 * "How to read this chart" box.
 *
 * File layout
 *   1. Settings .......... themes, labels and options
 *   2. Helpers ........... formatting and small utilities
 *   3. Calculation ....... totals, Spearman, KS, zones, factor shares, fixes, path to green
 *   4. Chart instance .... factor, daily and distribution views, tooltips, keyboard
 *   5. Export and notes .. data for the Veyforma Toolkit menu (optional file)
 *   6. Public API ........ window.VeyPlaAttribution
 *
 * Method in one paragraph (see the manual for detail):
 *   Daily totals HPL_t = Σ_k HPL_k,t and RTPL_t = Σ_k RTPL_k,t; unexplained U_t = HPL_t − RTPL_t, made of
 *   factor gaps g_k,t = HPL_k,t − RTPL_k,t. Over the window: Spearman = Pearson correlation of the ranks
 *   (ties get their average rank); KS = largest distance between the two empirical distribution functions.
 *   Green if Spearman > 0.80 and KS < 0.09; red if Spearman < 0.70 or KS > 0.12; otherwise amber.
 *   Factor share of the unexplained volatility = cov(g_k, U) ÷ sd(U), which adds up exactly to sd(U).
 *   "If fixed" re-runs the test with RTPL_k = HPL_k; the path to green adds fixes one at a time, each time
 *   taking the factor that brings the desk closest to green.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var instanceCount = 0;

  /* ======================================================================
     1. SETTINGS
     ====================================================================== */
  var BASE_THEME = {
    hpl: "#111827",               // front-office hypothetical P&L line
    rtpl: "#c2410c",              // risk model P&L line
    unexplained: "#6b7280",       // daily HPL − RTPL bars
    contribution: "#a63d16",      // factors that add to the unexplained volatility
    offset: "#2f6fed",            // factors whose gap offsets the others
    standalone: "#111827",        // stand-alone diamonds
    zones: { green: "#15803d", amber: "#b45309", red: "#b91c1c" },
    outside: "#d1d5db",           // days outside the test window
    grid: "#ececec",
    axis: "#9ca3af",
    text: "#111827",
    mutedText: "#4b5563",
    axisText: "#4b5563",
    cardBackground: "#f9fafb",
    background: "transparent",
    tooltipBackground: "#111827",
    tooltipText: "#ffffff",
    focus: "#c2410c",
    accent: "#c2410c",
    fontFamily: "inherit",
    fontSize: 12
  };
  var THEMES = {
    veyforma: {},
    mono: { hpl: "#111111", rtpl: "#6b6b6b", unexplained: "#8a8a8a", contribution: "#111111", offset: "#8a8a8a", zones: { green: "#111111", amber: "#4b4b4b", red: "#111111" }, accent: "#111111", focus: "#111111" },
    "colour-safe": { hpl: "#1f2937", rtpl: "#d55e00", unexplained: "#6b7280", contribution: "#cc3311", offset: "#0072b2", zones: { green: "#007a5e", amber: "#a35c00", red: "#b2182b" }, accent: "#0072b2" },
    ocean: { hpl: "#0c3b5e", rtpl: "#0e7490", contribution: "#0c3b5e", offset: "#c2410c", cardBackground: "#eef5f8", accent: "#0e7490" },
    forest: { hpl: "#22311a", rtpl: "#4d6b31", contribution: "#22311a", offset: "#2f6fed", cardBackground: "#f2f4ee", accent: "#4d6b31" },
    corporate: { hpl: "#1e293b", rtpl: "#1d4ed8", contribution: "#1e293b", offset: "#c2410c", cardBackground: "#f1f4f8", accent: "#1d4ed8" },
    midnight: { background: "#111418", hpl: "#f3f4f6", rtpl: "#f08a5d", unexplained: "#8b93a1", contribution: "#f08a5d", offset: "#93c5fd", standalone: "#f3f4f6",
      zones: { green: "#4ade80", amber: "#fbbf24", red: "#fb7185" }, outside: "#374151",
      grid: "#252a31", axis: "#4b5563", text: "#f3f4f6", mutedText: "#a3abb8", axisText: "#a3abb8",
      cardBackground: "#1b2027", tooltipBackground: "#f3f4f6", tooltipText: "#111418", focus: "#93c5fd", accent: "#f08a5d" }
  };
  var THRESHOLDS = { spearmanGreen: 0.80, spearmanRed: 0.70, ksGreen: 0.09, ksRed: 0.12 };

  var DEFAULT_OPTIONS = {
    data: null,             // required: { dates: [...], factors: [{ key, hpl: [...], rtpl: [...] }], … }
    view: "factors",        // "factors" | "daily" | "distribution"
    window: 250,            // test window in days (the most recent ones)
    fix: null,              // factor keys to treat as fixed (RTPL = HPL), e.g. ["EUR 3s6s basis"]
    thresholds: null,       // { spearmanGreen, spearmanRed, ksGreen, ksRed }; Basel values by default
    top: 15,                // factor rows before the rest are summed into "Other" (0 = all)
    pathSteps: 5,           // most fixes tried on the path to green
    theme: "veyforma",
    locale: undefined,
    animate: true,
    summary: true,
    legend: true,
    labels: null,
    ariaLabel: undefined,
    caption: true,
    annotations: null,      // notes, e.g. [{ factor: "USD/JPY vol smile", text: "Smile added to the risk model in Q4" }] or { date, text }
    onAnnotationsChange: null,
    onItemClick: null,      // function (detail, event): every figure for the factor or day clicked
    exportDays: 20000,      // most rows in the daily sheet
    toolbar: true
  };

  var DEFAULT_LABELS = {
    factors: "Unexplained P&L by risk factor", daily: "HPL and RTPL by day", distribution: "Distribution of HPL and RTPL",
    hpl: "HPL (front office)", rtpl: "RTPL (risk model)", unexplained: "Unexplained (HPL − RTPL)",
    adds: "Adds to unexplained volatility", offsets: "Offsets other gaps", standalone: "Gap on its own",
    test: "PLA test", unexplainedCard: "Unexplained P&L", largest: "Largest driver", path: "Path to green",
    green: "Green", amber: "Amber", red: "Red", na: "n/a", other: "Other {n} factors", unattributed: "Unattributed",
    notModelled: "not in the risk model", ifFixed: "If fixed", outside: "Outside the test window"
  };
  /* ======================================================================
     2. HELPERS
     ====================================================================== */
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  var warned = {};
  function warn(msg) { if (warned[msg]) return; warned[msg] = 1; if (root.console && console.warn) console.warn("VeyPlaAttribution: " + msg); }
  function fail(msg) { throw new Error("VeyPlaAttribution: " + msg); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function fill(t, map) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; }); }
  /** A name inside a sentence: "CET1 requirement" stays, "Pillar 1 minimum" becomes "pillar 1 minimum". */
  function lower(t) { t = String(t); return /^[A-Z0-9]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); }
  function num(v) { return typeof v === "number" ? v : v == null || v === "" ? NaN : +v; }
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function htmlEl(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  var measureCtx = null;
  function textWidth(text, size, weight, family) {
    if (!measureCtx) { var c = document.createElement("canvas"); measureCtx = c.getContext && c.getContext("2d"); }
    if (!measureCtx) return String(text).length * size * 0.6;
    measureCtx.font = (weight || 400) + " " + size + "px " + family;
    return measureCtx.measureText(String(text)).width;
  }
  function fit(text, max, size, weight, family) {
    text = String(text);
    if (textWidth(text, size, weight, family) <= max) return text;
    while (text.length > 2 && textWidth(text + "…", size, weight, family) > max) text = text.slice(0, -1);
    return text.replace(/\s+$/, "") + "…";
  }
  function hexRgb(c) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1], n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(rgb) {
    var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var x = hexRgb(a), y = hexRgb(b);
    if (!x || !y) return 21;
    var l1 = luminance(x), l2 = luminance(y);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function ensureContrast(col, bg, min) {
    var c = hexRgb(col), b = hexRgb(bg);
    if (!c || !b || contrast(col, bg) >= min) return col;
    var dark = luminance(b) > 0.4, t = 0, out = col;
    while (t <= 1 && contrast(out, bg) < min) {
      t += 0.05;
      out = "#" + c.map(function (v) { var x = dark ? v * (1 - t) : v + (255 - v) * t; return ("0" + Math.round(x).toString(16)).slice(-2); }).join("");
    }
    return out;
  }
  function makeFormatters(data, locale) {
    var decimals = data.decimals != null ? data.decimals : 0, rd = data.ratioDecimals != null ? data.ratioDecimals : 1;
    var prefix = data.prefix || "", suffix = data.suffix || "", cache = {}, brackets = data.negatives === "brackets";
    function nf(d) {
      if (!cache[d]) cache[d] = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
      return cache[d];
    }
    function value(v, d) {
      if (v == null || !isFinite(v)) return "–";
      if (d == null) d = decimals;
      var r = Number(v.toFixed(d)), body = prefix + nf(d).format(Math.abs(r)) + suffix;
      if (r >= 0) return body;
      return brackets ? "(" + body + ")" : "−" + body;
    }
    function signed(v, d) { var s = value(v, d); return v != null && Number(v.toFixed(d == null ? decimals : d)) > 0 ? "+" + s : s; }
    function ratio(v, d) { return v == null || !isFinite(v) ? "–" : (v < 0 ? "−" : "") + nf(d == null ? rd : d).format(Math.abs(v) * 100) + "%"; }
    function pp(v, d) {
      if (v == null || !isFinite(v)) return "–";
      var dd = d == null ? Math.max(rd, 1) : d, r = Number((v * 100).toFixed(dd));
      return (r > 0 ? "+" : r < 0 ? "−" : "") + nf(dd).format(Math.abs(r)) + " pp";
    }
    function percent(v, d) { return v == null || !isFinite(v) ? "–" : nf(d == null ? 1 : d).format(v * 100) + "%"; }
    return { value: value, signed: signed, ratio: ratio, pp: pp, percent: percent, nf: nf };
  }



  /* ======================================================================
     3. CALCULATION
     ====================================================================== */
  function finite(v, what) { var x = num(v); if (!isFinite(x)) fail(what + " must be a number."); return x; }

  /** Ranks 1..n, ties get their average rank. */
  function ranks(a) {
    var n = a.length, idx = new Array(n), r = new Array(n), i, j;
    for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (p, q) { return a[p] - a[q]; });
    for (i = 0; i < n; i = j) {
      j = i; while (j < n && a[idx[j]] === a[idx[i]]) j++;
      var avg = (i + j + 1) / 2;   // ranks i+1 .. j
      for (var k = i; k < j; k++) r[idx[k]] = avg;
    }
    return r;
  }
  function pearson(x, y) {
    var n = x.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function spearman(x, y) { return pearson(ranks(x), ranks(y)); }
  /** Two-sample Kolmogorov-Smirnov statistic: the largest gap between the two empirical distribution functions. */
  function ksStat(x, y) {
    var a = x.slice().sort(function (p, q) { return p - q; }), b = y.slice().sort(function (p, q) { return p - q; });
    var n = a.length, m = b.length, i = 0, j = 0, d = 0, at = a.length ? a[0] : 0;
    while (i < n && j < m) {
      var v = Math.min(a[i], b[j]);
      while (i < n && a[i] === v) i++;
      while (j < m && b[j] === v) j++;
      var g = Math.abs(i / n - j / m);
      if (g > d + 1e-15) { d = g; at = v; }
    }
    return { d: d, at: at };
  }
  function zoneOf(rho, ks, T) {
    if (rho == null) return "red";
    rho = Math.round(rho * 1e12) / 1e12; ks = Math.round(ks * 1e12) / 1e12;   // so a value exactly on a threshold is not tipped over by rounding
    if (rho > T.spearmanGreen && ks < T.ksGreen) return "green";
    if (rho < T.spearmanRed || ks > T.ksRed) return "red";
    return "amber";
  }
  /** How far a result is from green: 0 when green. */
  function distance(t, T) { return Math.max(0, T.spearmanGreen - (t.spearman == null ? -1 : t.spearman)) / 0.1 + Math.max(0, t.ks - T.ksGreen) / 0.03; }
  function test(H, R, T) {
    var rho = spearman(H, R), k = ksStat(H, R);
    return { spearman: rho, ks: k.d, ksAt: k.at, zone: zoneOf(rho, k.d, T) };
  }
  function sdOf(a) { var n = a.length, m = 0, s = 0, i; for (i = 0; i < n; i++) m += a[i]; m /= n; for (i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / n); }
  function meanOf(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

  function readData(data) {
    if (!data || typeof data !== "object") fail("data is required.");
    var dates = data.dates;
    if (!Array.isArray(dates) || dates.length < 2) fail("data.dates must be an array of at least two days.");
    var n = dates.length;
    var series = function (a, what, allowNull) {
      if (a == null && allowNull) return null;
      if (!Array.isArray(a) || a.length !== n) fail(what + " must be an array with one value per date (" + n + ").");
      return a.map(function (v, i) { return finite(v, what + "[" + i + "]"); });
    };
    if (!Array.isArray(data.factors) || !data.factors.length) fail("data.factors must be a non-empty array of risk factors.");
    var seen = {};
    var fs = data.factors.map(function (x, i) {
      if (!x || typeof x !== "object") fail("data.factors[" + i + "] is not an object.");
      if (x.key == null && x.label == null) fail("data.factors[" + i + "] needs a key or a label.");
      var key = String(x.key != null ? x.key : x.label), w = 'factor "' + key + '"';
      if (seen[key]) fail(w + " is used twice.");
      seen[key] = 1;
      var h = series(x.hpl, w + ": hpl"), r = series(x.rtpl, w + ": rtpl", true);
      return { key: key, label: x.label != null ? String(x.label) : key, group: x.group != null ? String(x.group) : "Other", modelled: r != null, hpl: h, rtpl: r || h.map(function () { return 0; }), index: i };
    });
    var ht = series(data.hplTotal, "data.hplTotal", true), rt = series(data.rtplTotal, "data.rtplTotal", true);
    if (ht || rt) {
      // what the factors do not explain becomes one more row
      var sh = new Array(n), sr = new Array(n), t;
      for (t = 0; t < n; t++) { sh[t] = 0; sr[t] = 0; fs.forEach(function (f) { sh[t] += f.hpl[t]; sr[t] += f.rtpl[t]; }); }
      fs.push({ key: "__unattributed", label: data.unattributedLabel || DEFAULT_LABELS.unattributed, group: "Unattributed", modelled: true, unattributed: true,
        hpl: sh.map(function (v, i) { return ht ? ht[i] - v : 0; }), rtpl: sr.map(function (v, i) { return rt ? rt[i] - v : 0; }), index: fs.length });
    }
    return { dates: dates.map(String), factors: fs, n: n };
  }

  /** Every figure. opts: { window, fix, thresholds, pathSteps }. */
  function compute(data, opts) {
    opts = opts || {};
    var D = readData(data), n = D.n, fs = D.factors;
    var T = assign({}, THRESHOLDS, opts.thresholds || {});
    var w = opts.window != null ? Math.floor(finite(opts.window, "window")) : 250;
    if (!(w >= 2)) fail("window must be at least 2 days.");
    var short = w > n; if (short) w = n;
    var start = n - w;
    var fix = {};
    (opts.fix || []).forEach(function (k) { if (!fs.some(function (f) { return f.key === String(k); })) warn('fix: there is no factor "' + k + '", so it changes nothing.'); fix[String(k)] = 1; });
    fs.forEach(function (f) { f.fixed = !!fix[f.key]; f.rt = f.fixed ? f.hpl : f.rtpl; f.gap = f.hpl.map(function (v, t) { return v - f.rt[t]; }); });
    var H = new Array(n), R = new Array(n), U = new Array(n), t, k;
    for (t = 0; t < n; t++) { var h = 0, r = 0; for (k = 0; k < fs.length; k++) { h += fs[k].hpl[t]; r += fs[k].rt[t]; } H[t] = h; R[t] = r; U[t] = h - r; }
    var Hw = H.slice(start), Rw = R.slice(start), Uw = U.slice(start);
    var res = { dates: D.dates, hpl: H, rtpl: R, unexplained: U, start: start, window: w, shortWindow: short, thresholds: T, fixed: Object.keys(fix) };
    res.test = test(Hw, Rw, T);
    var sdU = sdOf(Uw), sdH = sdOf(Hw), mU = meanOf(Uw);
    res.sdUnexplained = sdU; res.sdHpl = sdH; res.meanUnexplained = mU;
    res.volRatio = sdH > 0 ? sdU / sdH : null; res.meanRatio = sdH > 0 ? mU / sdH : null; res.varRatio = sdH > 0 ? (sdU * sdU) / (sdH * sdH) : null;
    // factor figures over the window
    fs.forEach(function (f) {
      var g = f.gap.slice(start), mg = meanOf(g), c = 0;
      for (t = 0; t < w; t++) c += (g[t] - mg) * (Uw[t] - mU);
      c /= w;
      f.meanGap = mg; f.sdGap = sdOf(g); f.contribution = sdU > 0 ? c / sdU : 0; f.share = sdU > 0 ? f.contribution / sdU : 0;
      f.hplSum = 0; f.rtplSum = 0; for (t = start; t < n; t++) { f.hplSum += f.hpl[t]; f.rtplSum += f.rt[t]; }
      f.hasGap = f.sdGap > 0 || mg !== 0;
      if (f.hasGap) { var R2 = Rw.map(function (v, i) { return v + g[i]; }); f.ifFixed = test(Hw, R2, T); }
      else f.ifFixed = res.test;
    });
    var order = fs.slice().sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution) || a.index - b.index; });
    order.forEach(function (f, i) { f.rank = i + 1; });
    res.factors = fs; res.order = order;
    // shortest path to green: add the fix that brings the desk closest to green, one at a time
    var steps = opts.pathSteps != null ? Math.max(0, Math.floor(opts.pathSteps)) : 5, path = [], cur = Rw.slice(), curT = res.test, used = {};
    while (curT.zone !== "green" && path.length < steps) {
      var best = null;
      fs.forEach(function (f) {
        if (used[f.key] || f.fixed || !f.hasGap) return;
        var g = f.gap.slice(start), R2 = cur.map(function (v, i) { return v + g[i]; }), tt = test(Hw, R2, T), dd = distance(tt, T);
        if (!best || dd < best.d - 1e-12 || (Math.abs(dd - best.d) <= 1e-12 && (tt.spearman || -1) > (best.t.spearman || -1))) best = { f: f, t: tt, d: dd, R: R2 };
      });
      if (!best || best.d >= distance(curT, T) - 1e-12) break;   // nothing helps any more
      used[best.f.key] = 1; path.push({ key: best.f.key, label: best.f.label, test: best.t }); cur = best.R; curT = best.t;
    }
    res.path = path; res.pathReachesGreen = res.test.zone === "green" || (path.length > 0 && path[path.length - 1].test.zone === "green");
    res.distribution = { hpl: Hw.slice().sort(function (a, b) { return a - b; }), rtpl: Rw.slice().sort(function (a, b) { return a - b; }) };
    return res;
  }
  /* ======================================================================
     4. CHART INSTANCE
     ====================================================================== */
  function injectStyles() {
    if (document.getElementById("vpa-styles")) return;
    var css =
      ".vpa{position:relative;color:var(--vpa-text);background:var(--vpa-bg);font-family:var(--vpa-font);line-height:1.4}" +
      ".vpa.vpa-filled{padding:14px 14px 8px;border-radius:10px}" +
      ".vpa-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px}" +
      ".vpa-stat{background:var(--vpa-card);border-radius:8px;padding:9px 12px;min-width:0}" +
      ".vpa-stat .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--vpa-card-muted);font-weight:600;overflow-wrap:anywhere;hyphens:auto}" +
      ".vpa-stat .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".vpa-stat .n{font-size:12px;color:var(--vpa-card-muted)}" +
      ".vpa-stat .v.vpa-zone{font-weight:800}" +
      ".vpa-stat .v.vpa-wrap{white-space:normal;overflow-wrap:anywhere;line-height:1.2;font-size:17px}" +
      ".vpa-scope{font-size:12px;color:var(--vpa-muted);margin:0 0 4px}" +
      ".vpa-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;margin:0 0 6px;color:var(--vpa-text)}" +
      ".vpa-legend span{display:inline-flex;align-items:center;gap:6px}" +
      ".vpa-legend i{display:inline-block;width:12px;height:12px;border-radius:3px}" +
      ".vpa-legend i.vpa-tick{width:16px;height:3px;border-radius:1px}" +
      ".vpa-legend i.vpa-ring{background:transparent!important;border:2px solid;border-radius:2px;width:9px;height:9px;transform:rotate(45deg)}" +
      ".vpa-plot{display:block;width:100%;height:auto;overflow:visible;outline:none}" +
      ".vpa-plot:focus-visible{outline:2px solid var(--vpa-focus);outline-offset:4px;border-radius:4px}" +
      ".vpa-animate .vpa-grow{animation:vpa-fade .45s ease both}" +
      "@keyframes vpa-fade{from{opacity:0}to{opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.vpa-animate .vpa-grow{animation:none}}" +
      ".vpa-tip{position:absolute;left:0;top:0;pointer-events:none;background:var(--vpa-tip-bg);color:var(--vpa-tip-text);" +
      "font-size:12px;line-height:1.45;padding:8px 10px;border-radius:8px;opacity:0;transform:translateY(4px);" +
      "transition:opacity .12s,transform .12s;white-space:nowrap;z-index:5;font-variant-numeric:tabular-nums}" +
      ".vpa-tip.vpa-on{opacity:1;transform:none}.vpa-tip b{font-weight:600}" +
      ".vpa-table{border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin:0 0 14px;min-width:100%}" +
      ".vpa-table caption{text-align:left;font-weight:700;padding:0 0 6px}" +
      ".vpa-table th,.vpa-table td{padding:5px 8px;border-bottom:1px solid rgba(127,127,127,.25);text-align:right;white-space:nowrap}" +
      ".vpa-table th:first-child,.vpa-table td:first-child{text-align:left}" +
      ".vpa-table tr.vpa-breach td{color:var(--vpa-hedge);font-weight:600}" +
      "@media (max-width:420px){.vpa-summary{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}.vpa-stat{padding:8px 10px}.vpa-stat .v{font-size:17px}}";
    var s = htmlEl("style");
    s.id = "vpa-styles";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  function resolvePaTheme(theme) {
    var t;
    if (theme == null || theme === "") theme = "veyforma";
    if (typeof theme === "string") {
      if (!THEMES.hasOwnProperty(theme)) { warn('Unknown theme "' + theme + '". The "veyforma" theme is used instead.'); theme = "veyforma"; }
      t = assign({}, BASE_THEME, THEMES[theme]);
    } else if (typeof theme === "object") {
      t = assign(theme["extends"] ? resolvePaTheme(theme["extends"]) : assign({}, BASE_THEME), theme);
      delete t["extends"];
    } else { warn("The theme option must be a theme name or an object."); t = assign({}, BASE_THEME); }
    var bg = /^#/.test(t.background) ? t.background : "#ffffff", card = /^#/.test(t.cardBackground) ? t.cardBackground : bg;
    ["axisText", "mutedText"].forEach(function (k) { t[k] = ensureContrast(t[k], bg, 4.5); });
    t.cardMuted = ensureContrast(t.mutedText, card, 4.5);
    t.offsetText = ensureContrast(ensureContrast(t.offset, bg, 4.5), card, 4.5);
    t.zoneText = {};
    ["green", "amber", "red"].forEach(function (z) { t.zoneText[z] = ensureContrast(ensureContrast(t.zones[z], bg, 4.5), card, 4.5); });
    t.accentText = ensureContrast(t.accent, bg, 4.5);
    return t;
  }

  function Chart(target, options) {
    var container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container || container.nodeType !== 1) fail("container not found (" + target + ").");
    if (!options || !options.data) fail("options.data is required.");
    injectStyles();
    this.id = ++instanceCount;
    this.container = container;
    this.options = assign({}, DEFAULT_OPTIONS, options);
    this.element = htmlEl("div", "vpa");
    this.element.setAttribute("role", "figure");
    this.summaryEl = htmlEl("div", "vpa-summary", this.element);
    this.scopeEl = htmlEl("p", "vpa-scope", this.element);
    this.legendEl = htmlEl("div", "vpa-legend", this.element);
    this.plotHost = htmlEl("div", "vpa-plot-host", this.element);
    this.tipEl = htmlEl("div", "vpa-tip", this.element);
    this.tipEl.setAttribute("role", "tooltip");
    container.appendChild(this.element);
    this._animateNext = !!this.options.animate;
    this._lastWidth = 0;
    this._active = -1;
    var self = this;
    if (root.ResizeObserver) {
      this._observer = new root.ResizeObserver(function () {
        var w = Math.round(self.element.clientWidth);
        if (w && Math.abs(w - self._lastWidth) > 1) self.redraw();
      });
      this._observer.observe(this.element);
    } else {
      this._onResize = function () { self.redraw(); };
      root.addEventListener("resize", this._onResize);
    }
    this._onDocTap = function (e) { if (!self.element.contains(e.target)) self._hideTip(); };
    document.addEventListener("pointerdown", this._onDocTap);
    this.redraw();
    if (this.options.toolbar !== false && root.VeyformaToolkit) this.toolkit = root.VeyformaToolkit.attach(this, this.options.toolbar);
  }

  Chart.prototype.update = function (partial) {
    if (!partial) return this;
    if (partial.data && partial.data !== this.options.data && this.options.animate) this._animateNext = true;
    if (partial.view && partial.view !== this.options.view && this.options.animate) this._animateNext = true;
    assign(this.options, partial);
    return this.redraw();
  };
  Chart.prototype.setData = function (data) { this._res = null; return this.update({ data: data }); };
  Chart.prototype.setView = function (view) { return this.update({ view: view }); };
  Chart.prototype.setTheme = function (theme) { return this.update({ theme: theme }); };
  Chart.prototype.getTheme = function () { return resolvePaTheme(this.options.theme); };
  Chart.prototype._opts = function () { return { window: this.options.window, fix: this.options.fix, thresholds: this.options.thresholds }; };
  Chart.prototype.getResult = function () { return compute(this.options.data, this._opts()); };
  Chart.prototype.getFactor = function (key) { return this.getResult().factors.filter(function (f) { return f.key === String(key); })[0] || null; };
  Chart.prototype.setFix = function (keys) { return this.update({ fix: keys }); };
  Chart.prototype.setWindow = function (days) { return this.update({ window: days }); };
  Chart.prototype._labels = function () { return assign({}, DEFAULT_LABELS, this.options.labels); };
  Chart.prototype.destroy = function () {
    if (this.toolkit && this.toolkit.destroy) this.toolkit.destroy();
    if (this._observer) this._observer.disconnect();
    if (this._onResize) root.removeEventListener("resize", this._onResize);
    document.removeEventListener("pointerdown", this._onDocTap);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  };
  Chart.prototype._hideTip = function () { this.tipEl.classList.remove("vpa-on"); if (this._hlEl) this._hlEl.setAttribute("opacity", 0); };
  Chart.prototype._placeTip = function (lines, rect, evt) {
    var tip = this.tipEl;
    tip.textContent = "";
    lines.forEach(function (ln, i) {
      if (i) tip.appendChild(document.createElement("br"));
      var node = i === 0 ? document.createElement("b") : document.createElement("span");
      node.textContent = ln;
      tip.appendChild(node);
    });
    var box = this.element.getBoundingClientRect();
    var px = evt && evt.clientX ? evt.clientX : rect.left + rect.width / 2;
    var py = evt && evt.clientY ? evt.clientY : rect.top + 10;
    tip.classList.add("vpa-on");
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(px - box.left - tw / 2, 4, Math.max(4, box.width - tw - 4)) + "px";
    var top = py - box.top - th - 14;
    if (top < 0) top = py - box.top + 18;
    tip.style.top = top + "px";
  };
  /** A "nice" axis from lo to hi with about n ticks. */
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; }
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10)), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
    for (var v = a; v <= b + step / 2; v += step) out.push(Math.round(v / step) * step);
    return { lo: a, hi: b, ticks: out, step: step };
  }

  function label(g, x, y, text, attrs) {
    var t = svgEl("text", assign({ x: x, y: y }, attrs || {}), g);
    t.textContent = text;
    return t;
  }

  Chart.prototype._bindInteraction = function (svg, W, H, theme, L, f) {
    var self = this, items = this._items, o = this.options;
    function idxAt(evt) {
      var r = svg.getBoundingClientRect(), x = (evt.clientX - r.left) * (W / r.width), y = (evt.clientY - r.top) * (H / r.height);
      for (var i = 0; i < items.length; i++) { var it = items[i]; if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return i; }
      return -1;
    }
    function show(i, evt) {
      if (i < 0) { self._hideTip(); return; }
      self._active = i;
      var it = items[i], hl = self._hlEl;
      hl.setAttribute("x", it.x - 4); hl.setAttribute("y", it.y); hl.setAttribute("width", it.w + 8); hl.setAttribute("height", it.h); hl.setAttribute("opacity", 1);
      var r = svg.getBoundingClientRect(), sx = r.width / W;
      var rect = { left: r.left + it.px * sx, top: r.top + it.py * (r.height / H), width: 0, height: 0 };
      self._placeTip(self._tipLines(it), rect, evt && evt.clientX ? evt : null);
    }
    svg.addEventListener("pointermove", function (e) { show(idxAt(e), e); });
    svg.addEventListener("pointerleave", function () { self._hideTip(); });
    svg.addEventListener("click", function (e) {
      var i = idxAt(e);
      if (i >= 0 && typeof o.onItemClick === "function") o.onItemClick(self._detail(items[i]), e);
    });
    svg.addEventListener("keydown", function (e) {
      var i = self._active;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") i = Math.min(items.length - 1, i + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = Math.max(0, i < 0 ? 0 : i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = items.length - 1;
      else if (e.key === "Escape") { self._hideTip(); return; }
      else if ((e.key === "Enter" || e.key === " ") && i >= 0) {
        if (typeof o.onItemClick === "function") o.onItemClick(self._detail(items[i]), e);
        e.preventDefault(); return;
      } else return;
      e.preventDefault();
      show(i, null);
    });
    svg.addEventListener("blur", function () { self._hideTip(); });
  };

  Chart.prototype.createTable = function () {
    var ex = this.getExportData(), wrap = htmlEl("div", "vpa-tables");
    ex.sheets.forEach(function (sh) {
      if (sh.name === "Notes") return;
      var tb = htmlEl("table", "vpa-table", wrap);
      htmlEl("caption", null, tb).textContent = sh.name;
      var hr = htmlEl("tr", null, htmlEl("thead", null, tb));
      sh.columns.forEach(function (c) { var th = htmlEl("th", null, hr); th.scope = "col"; th.textContent = c.label; });
      var body = htmlEl("tbody", null, tb);
      sh.text.forEach(function (r, i) {
        var tr = htmlEl("tr", sh.flag && sh.flag[i] ? "vpa-breach" : null, body);
        r.forEach(function (v, j) { var td = htmlEl(j ? "td" : "th", null, tr); if (!j) td.scope = "row"; td.textContent = v; });
      });
    });
    return wrap;
  };


  Chart.prototype.redraw = function () {
    var o = this.options, data = o.data, L = this._labels();
    var res = this._res = compute(data, assign(this._opts(), { pathSteps: o.pathSteps }));
    var theme = resolvePaTheme(o.theme), f = makeFormatters(data, o.locale), el = this.element, st = el.style;
    var family = theme.fontFamily === "inherit" ? (root.getComputedStyle ? root.getComputedStyle(this.container).fontFamily : "sans-serif") : theme.fontFamily;
    var filled = theme.background && theme.background !== "transparent", bg = filled ? theme.background : "#ffffff";
    st.setProperty("--vpa-text", theme.text); st.setProperty("--vpa-muted", theme.mutedText);
    st.setProperty("--vpa-bg", filled ? theme.background : "transparent"); st.setProperty("--vpa-font", family);
    st.setProperty("--vpa-card", theme.cardBackground); st.setProperty("--vpa-card-muted", theme.cardMuted);
    st.setProperty("--vpa-tip-bg", theme.tooltipBackground); st.setProperty("--vpa-tip-text", theme.tooltipText);
    st.setProperty("--vpa-focus", theme.focus); st.setProperty("--vpa-hedge", theme.zoneText.red);
    el.classList.toggle("vpa-filled", !!filled);
    el.setAttribute("aria-label", o.ariaLabel || data.title || "P&L attribution");
    var view = o.view;
    if (["factors", "daily", "distribution"].indexOf(view) < 0) { warn('Unknown view "' + view + '". The factor view is shown instead.'); view = "factors"; }
    if (res.shortWindow && !this._warnedShort) { warn("There are fewer days than the " + (o.window || 250) + "-day window; all " + res.window + " are used."); this._warnedShort = true; }
    this._view = view;
    this._renderSummary(res, f, L, theme);
    this.scopeEl.textContent = [L[view], res.window + "-day window", data.unit || null, res.fixed.length ? res.fixed.length + " fix" + (res.fixed.length > 1 ? "es" : "") + " applied" : null].filter(Boolean).join(" · ");
    this._renderLegend(view, theme, L, res);
    var W = Math.max(280, Math.round(this.plotHost.clientWidth || el.clientWidth || 720));
    this._lastWidth = Math.round(el.clientWidth);
    var fs = theme.fontSize || 12;
    this.plotHost.textContent = "";
    var svg = svgEl("svg", { "class": "vpa-plot", role: "img", tabindex: 0, "font-family": family }, this.plotHost);
    svg.style.fontSize = fs + "px";
    var animate = this._animateNext && o.animate; this._animateNext = false;
    if (animate) svg.classList.add("vpa-animate");
    var ctx = { svg: svg, W: W, fs: fs, theme: theme, f: f, L: L, family: family, bg: bg, res: res, items: [], points: {} };
    var H = view === "daily" ? this._drawDaily(ctx) : view === "distribution" ? this._drawDistribution(ctx) : this._drawFactors(ctx);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("aria-label", (o.ariaLabel || data.title || "P&L attribution") + ". " + this.describe());
    this._items = ctx.items; this._points = ctx.points;
    this._hlEl = svgEl("rect", { x: 0, y: 0, width: 0, height: 0, rx: 4, fill: theme.text, "fill-opacity": 0.06, opacity: 0, "pointer-events": "none" }, svg);
    svg.insertBefore(this._hlEl, svg.firstChild);
    this._bindInteraction(svg, W, H, theme, L, f);
    return this;
  };

  function num2(v) { return v == null ? "n/a" : v.toFixed(2); }
  Chart.prototype._zoneName = function (z) { var L = this._labels(); return L[z] || z; };

  Chart.prototype._renderSummary = function (res, f, L, theme) {
    var box = this.summaryEl, o = this.options, self = this;
    box.textContent = "";
    box.style.display = o.summary === false ? "none" : "";
    if (o.summary === false) return;
    function stat(k, v, n, cls, colour) {
      var s = htmlEl("div", "vpa-stat", box);
      htmlEl("div", "k", s).textContent = k;
      var vv = htmlEl("div", cls ? "v " + cls : "v", s); vv.textContent = v; if (colour) vv.style.color = colour;
      if (n) htmlEl("div", "n", s).textContent = n;
    }
    var t = res.test, top = res.order[0];
    stat(L.test, this._zoneName(t.zone), "Spearman " + num2(t.spearman) + " · KS " + num2(t.ks) + " (" + res.window + " days)", "vpa-zone", theme.zoneText[t.zone]);
    stat(L.unexplainedCard, "±" + f.value(res.sdUnexplained), (res.volRatio != null ? f.percent(res.volRatio, 0) + " of HPL volatility · " : "") + "mean " + f.signed(res.meanUnexplained) + " a day");
    stat(L.largest, top.label, f.percent(top.share, 0) + " of the unexplained volatility", "vpa-wrap");
    if (t.zone === "green") stat(L.path, "Already green", "margin: Spearman +" + (t.spearman - res.thresholds.spearmanGreen).toFixed(2) + ", KS −" + (res.thresholds.ksGreen - t.ks).toFixed(2));
    else if (res.pathReachesGreen) stat(L.path, "Fix " + res.path.length + " factor" + (res.path.length > 1 ? "s" : ""), res.path.map(function (p) { return p.label; }).join(", ") + " → Spearman " + num2(res.path[res.path.length - 1].test.spearman) + ", KS " + num2(res.path[res.path.length - 1].test.ks), "vpa-wrap");
    else stat(L.path, res.path.length ? "Not within " + res.path.length + " fix" + (res.path.length > 1 ? "es" : "") : "No single fix helps", res.path.length ? "best reached: " + this._zoneName(res.path[res.path.length - 1].test.zone).toLowerCase() : "the gap is spread across factors");
    Array.prototype.forEach.call(box.querySelectorAll(".vpa-stat .v"), function (v) {
      v.style.fontSize = "";
      var size = parseFloat(root.getComputedStyle ? root.getComputedStyle(v).fontSize : 19) || 19;
      while (v.scrollWidth > v.clientWidth && size > 12) { size -= 1; v.style.fontSize = size + "px"; }
    });
  };

  Chart.prototype._renderLegend = function (view, theme, L, res) {
    var box = this.legendEl;
    box.textContent = "";
    box.style.display = this.options.legend === false ? "none" : "";
    function item(colour, text, cls) {
      var s = htmlEl("span", null, box), i = htmlEl("i", cls || null, s);
      if (cls === "vpa-ring") i.style.borderColor = colour; else i.style.background = colour;
      s.appendChild(document.createTextNode(text));
    }
    if (view === "factors") { item(theme.contribution, L.adds); item(theme.offset, L.offsets); item(theme.standalone, L.standalone, "vpa-ring"); return; }
    item(theme.hpl, L.hpl, "vpa-tick"); item(theme.rtpl, L.rtpl, "vpa-tick");
    if (view === "daily") { item(theme.unexplained, L.unexplained); if (res.start > 0) item(theme.outside, L.outside); }
  };

  function rowLayout(c, names) {
    var nameW = Math.min(Math.max.apply(null, names.map(function (n) { return textWidth(n, c.fs, 600, c.family); })) + 12, c.W * 0.34);
    var narrow = c.W - nameW < 300;
    return { nameW: narrow ? 0 : nameW, narrow: narrow };
  }
  function axisTicks(c, g, nt, xs, y, x0, x1, gridTop, gridBottom, fmt) {
    var theme = c.theme, fs = c.fs, fam = c.family, W = c.W, lastRight = -Infinity;
    nt.ticks.forEach(function (t) {
      svgEl("line", { x1: xs(t), x2: xs(t), y1: gridTop, y2: gridBottom, stroke: t === 0 ? theme.axis : theme.grid, "stroke-width": t === 0 ? 1.2 : 1 }, g);
      var tt = fmt(t), tw = textWidth(tt, fs - 1, 400, fam), tx = xs(t), anc = tx - tw / 2 < 0 ? "start" : tx + tw / 2 > W ? "end" : "middle";
      var left = anc === "start" ? tx : anc === "end" ? tx - tw : tx - tw / 2;
      if (left < lastRight + 8) return;
      lastRight = left + tw;
      label(g, tx, y + fs, tt, { "text-anchor": anc, fill: theme.axisText, "font-size": fs - 1, "class": "vpa-tick" });
    });
  }

  /** Factor view: each factor's share of the unexplained volatility (adds up), stand-alone gap as a diamond, and the zone if fixed. */
  Chart.prototype._drawFactors = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, self = this;
    var top = +this.options.top > 0 ? Math.floor(+this.options.top) : res.order.length, rest = res.order.slice(top);
    var rows = res.order.slice(0, top).sort(function (a, b) { return b.contribution - a.contribution; }).map(function (x) { return { kind: "factor", obj: x, name: x.label + (x.modelled ? "" : " *"), v: x.contribution, k: x.sdGap }; });
    if (rest.length) { var sv = 0, sk = 0; rest.forEach(function (x) { sv += x.contribution; sk += x.sdGap; }); rows.push({ kind: "other", obj: { count: rest.length, contribution: sv, factors: rest }, name: fill(L.other, { n: rest.length }), v: sv, k: null }); }
    var lay = rowLayout(c, rows.map(function (r) { return r.name; }));
    var zoneW = Math.max(textWidth("→ " + L.amber, fs - 1, 600, fam), textWidth("→ " + L.green, fs - 1, 600, fam), textWidth("→ " + L.red, fs - 1, 600, fam)) + 14;
    var valW = Math.max.apply(null, rows.map(function (r) { return textWidth(f.signed(r.v), fs, 700, fam); })) + 10;
    var x0 = lay.nameW, x1 = W - valW - zoneW, rowH = Math.max(26, fs * 2.1), extra = lay.narrow ? fs + 4 : 0, y = 4;
    var lo = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.v; }))), hi = Math.max.apply(null, rows.map(function (r) { return Math.max(r.v, r.k || 0); })) || 1;
    var nt = niceTicks(lo, hi, Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))));
    var xs = function (v) { return x0 + (clamp(v, nt.lo, nt.hi) - nt.lo) / (nt.hi - nt.lo) * (x1 - x0); };
    var gridTop = y + fs + 6, gridBottom = gridTop + rows.length * (rowH + extra), g = svgEl("g", { "class": "vpa-factors" }, svg);
    axisTicks(c, g, nt, xs, y, x0, x1, gridTop, gridBottom, function (v) { return f.value(v); });
    label(g, W, y + fs, L.ifFixed, { "text-anchor": "end", fill: theme.axisText, "font-size": fs - 1, "class": "vpa-tick" });
    rows.forEach(function (r, i) {
      var ry = gridTop + i * (rowH + extra) + extra, bh = rowH * 0.56, by = ry + (rowH - bh) / 2, neg = r.v < 0 && f.value(-r.v) !== f.value(0);   // a value that rounds to zero is shown as neutral
      label(g, 0, lay.narrow ? ry - 3 : by + bh / 2 + fs * 0.35, fit(r.name, lay.narrow ? W - zoneW : lay.nameW - 8, fs, r.kind === "other" ? 400 : 600, fam), { fill: r.kind === "other" ? theme.mutedText : theme.text, "font-size": fs, "font-weight": r.kind === "other" ? 400 : 600, "class": "vpa-name" });
      var xa = xs(Math.min(0, r.v)), xb = xs(Math.max(0, r.v));
      svgEl("rect", { x: xa, y: by, width: Math.max(0.8, xb - xa), height: bh, rx: 2, fill: neg ? theme.offset : theme.contribution, "class": "vpa-grow vpa-cbar" + (neg ? " vpa-offset" : "") }, g);
      if (r.k != null) { var kx = xs(r.k), ky = by + bh / 2;
        svgEl("path", { d: "M" + kx + "," + (ky - 5) + "L" + (kx + 5) + "," + ky + "L" + kx + "," + (ky + 5) + "L" + (kx - 5) + "," + ky + "Z", fill: c.bg, stroke: theme.standalone, "stroke-width": 1.6, "class": "vpa-sa" }, g); }
      label(g, W - zoneW, by + bh / 2 + fs * 0.35, f.signed(r.v), { "text-anchor": "end", fill: neg ? theme.offsetText : theme.text, "font-size": fs, "font-weight": 700, "class": "vpa-val" });
      if (r.kind === "factor") {
        var z = r.obj.ifFixed.zone;
        label(g, W, by + bh / 2 + fs * 0.35, "→ " + self._zoneName(z), { "text-anchor": "end", fill: theme.zoneText[z], "font-size": fs - 1, "font-weight": 600, "class": "vpa-zonefix" });
        c.points[r.obj.key] = { x: neg ? xa : xb, y: by };
      }
      c.items.push({ kind: r.kind, obj: r.obj, x: 0, y: ry - extra, w: W, h: rowH + extra, px: neg ? xa : xb, py: by });
    });
    var notes = ["Shares add up to the unexplained volatility of ±" + f.value(res.sdUnexplained) + " a day over " + res.window + " days"];
    if (res.factors.some(function (x) { return !x.modelled; })) notes.push("* " + L.notModelled + " (RTPL taken as zero)");
    notes.push("“" + L.ifFixed + "”: test zone with that factor's RTPL set equal to its HPL");
    var y2 = gridBottom + fs + 8;
    notes.forEach(function (t) { label(svg, 0, y2, fit(t + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1, "class": "vpa-note" }); y2 += fs + 3; });
    return Math.ceil(y2 - fs + 6);
  };

  /** Daily view: HPL and RTPL lines with the unexplained P&L as bars; days outside the test window are greyed. */
  Chart.prototype._drawDaily = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, n = res.dates.length;
    var all = res.hpl.concat(res.rtpl, res.unexplained);
    var nt = niceTicks(Math.min(0, Math.min.apply(null, all)), Math.max(0, Math.max.apply(null, all)), W < 480 ? 4 : 6);
    var tickW = Math.max.apply(null, nt.ticks.map(function (t) { return textWidth(f.value(t), fs - 1, 400, fam); }));
    var x0 = tickW + 10, x1 = W - 4, top = 6, ph = W < 480 ? 220 : 300, bottom = top + ph;
    var xs = function (i) { return x0 + (i + 0.5) / n * (x1 - x0); }, ys = function (v) { return top + (nt.hi - clamp(v, nt.lo, nt.hi)) / (nt.hi - nt.lo) * ph; };
    var g = svgEl("g", { "class": "vpa-daily" }, svg);
    if (res.start > 0) svgEl("rect", { x: x0, y: top, width: xs(res.start) - (x1 - x0) / n / 2 - x0, height: ph, fill: theme.outside, "fill-opacity": 0.35, "class": "vpa-outside" }, g);
    nt.ticks.forEach(function (t) {
      svgEl("line", { x1: x0, x2: x1, y1: ys(t), y2: ys(t), stroke: t === 0 ? theme.axis : theme.grid, "stroke-width": t === 0 ? 1.2 : 1 }, g);
      label(g, x0 - 6, ys(t) + (fs - 1) * 0.35, f.value(t), { "text-anchor": "end", fill: theme.axisText, "font-size": fs - 1, "class": "vpa-tick" });
    });
    var bw = Math.max(0.6, (x1 - x0) / n * 0.7);
    res.unexplained.forEach(function (u, i) { var ya = ys(Math.max(0, u)), yb = ys(Math.min(0, u)); svgEl("rect", { x: xs(i) - bw / 2, y: ya, width: bw, height: Math.max(0.6, yb - ya), fill: theme.unexplained, "fill-opacity": i < res.start ? 0.4 : 0.85, "class": "vpa-grow vpa-ubar" }, g); });
    var path = function (a) { return a.map(function (v, i) { return (i ? "L" : "M") + xs(i).toFixed(2) + "," + ys(v).toFixed(2); }).join(""); };
    svgEl("path", { d: path(res.hpl), fill: "none", stroke: theme.hpl, "stroke-width": 1.6, "stroke-linejoin": "round", "class": "vpa-line vpa-hpl" }, g);
    svgEl("path", { d: path(res.rtpl), fill: "none", stroke: theme.rtpl, "stroke-width": 1.6, "stroke-dasharray": "4 2", "stroke-linejoin": "round", "class": "vpa-line vpa-rtpl" }, g);
    // date labels, thinned
    var lw = textWidth(res.dates[0], fs - 1, 400, fam) + 16, every = Math.max(1, Math.ceil(lw / ((x1 - x0) / n))), lastRight = -Infinity;
    for (var i = 0; i < n; i += every) {
      var tx = xs(i), tw = textWidth(res.dates[i], fs - 1, 400, fam), anc = tx - tw / 2 < 0 ? "start" : tx + tw / 2 > W ? "end" : "middle", left = anc === "start" ? tx : anc === "end" ? tx - tw : tx - tw / 2;
      if (left < lastRight + 8) continue;
      lastRight = left + tw;
      label(g, tx, bottom + fs + 9, res.dates[i], { "text-anchor": anc, fill: theme.axisText, "font-size": fs - 1, "class": "vpa-tick" });
    }
    var step = (x1 - x0) / n;
    res.dates.forEach(function (d, j) {
      c.items.push({ kind: "day", index: j, x: xs(j) - step / 2, y: top, w: step, h: ph, px: xs(j), py: ys(Math.max(res.hpl[j], res.rtpl[j])) });
      c.points["date:" + d] = { x: xs(j), y: ys(Math.max(res.hpl[j], res.rtpl[j])) };
    });
    var notes = ["Unexplained P&L ±" + f.value(res.sdUnexplained) + " a day (" + (res.volRatio != null ? f.percent(res.volRatio, 0) + " of HPL volatility" : "") + ") over the last " + res.window + " days"];
    var y2 = bottom + fs * 2 + 17;
    notes.forEach(function (t) { label(svg, 0, y2, fit(t + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1, "class": "vpa-note" }); y2 += fs + 3; });
    return Math.ceil(y2 - fs + 6);
  };

  /** Distribution view: the two empirical distribution functions with the KS distance marked. */
  Chart.prototype._drawDistribution = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, D = res.distribution, n = D.hpl.length, T = res.thresholds;
    var lo = Math.min(D.hpl[0], D.rtpl[0]), hi = Math.max(D.hpl[n - 1], D.rtpl[n - 1]);
    var nt = niceTicks(lo, hi, W < 480 ? 4 : 6);
    var x0 = textWidth("100%", fs - 1, 400, fam) + 10, x1 = W - 6, top = 8, ph = W < 480 ? 200 : 270, bottom = top + ph;
    var xs = function (v) { return x0 + (clamp(v, nt.lo, nt.hi) - nt.lo) / (nt.hi - nt.lo) * (x1 - x0); }, ys = function (p) { return top + (1 - p) * ph; };
    var g = svgEl("g", { "class": "vpa-dist" }, svg);
    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      svgEl("line", { x1: x0, x2: x1, y1: ys(p), y2: ys(p), stroke: p === 0 ? theme.axis : theme.grid }, g);
      label(g, x0 - 6, ys(p) + (fs - 1) * 0.35, Math.round(p * 100) + "%", { "text-anchor": "end", fill: theme.axisText, "font-size": fs - 1, "class": "vpa-tick" });
    });
    axisTicks(c, g, nt, xs, bottom + 8, x0, x1, top, bottom, function (v) { return f.value(v); });
    var step = function (a) { var d = "M" + xs(nt.lo) + "," + ys(0); a.forEach(function (v, i) { d += "L" + xs(v).toFixed(2) + "," + ys(i / n).toFixed(2) + "L" + xs(v).toFixed(2) + "," + ys((i + 1) / n).toFixed(2); }); return d + "L" + xs(nt.hi) + "," + ys(1); };
    svgEl("path", { d: step(D.hpl), fill: "none", stroke: theme.hpl, "stroke-width": 1.8, "class": "vpa-line vpa-hpl" }, g);
    svgEl("path", { d: step(D.rtpl), fill: "none", stroke: theme.rtpl, "stroke-width": 1.8, "stroke-dasharray": "4 2", "class": "vpa-line vpa-rtpl" }, g);
    var cdf = function (a, v) { var lo2 = 0, hi2 = a.length; while (lo2 < hi2) { var m = (lo2 + hi2) >> 1; if (a[m] <= v) lo2 = m + 1; else hi2 = m; } return lo2 / a.length; };
    var at = res.test.ksAt, p1 = cdf(D.hpl, at), p2 = cdf(D.rtpl, at), kx = xs(at), z = res.test.zone;
    svgEl("line", { x1: kx, x2: kx, y1: ys(p1), y2: ys(p2), stroke: theme.zoneText[z], "stroke-width": 3, "class": "vpa-ksline" }, g);
    var kt = "KS " + num2(res.test.ks), ktw = textWidth(kt, fs, 700, fam), kl = kx + 8 + ktw > W ? kx - 8 : kx + 8;
    svgEl("rect", { x: (kx + 8 + ktw > W ? kl - ktw : kl) - 3, y: (ys(p1) + ys(p2)) / 2 - fs * 0.7, width: ktw + 6, height: fs * 1.4, rx: 3, fill: c.bg, "class": "vpa-lbg" }, g);
    label(g, kl, (ys(p1) + ys(p2)) / 2 + fs * 0.35, kt, { "text-anchor": kx + 8 + ktw > W ? "end" : "start", fill: theme.zoneText[z], "font-size": fs, "font-weight": 700, "class": "vpa-kslabel" });
    for (var i = 0; i <= 20; i++) {
      var v = nt.lo + (nt.hi - nt.lo) * i / 20, wx = (x1 - x0) / 20;
      c.items.push({ kind: "point", value: v, ph: cdf(D.hpl, v), pr: cdf(D.rtpl, v), x: xs(v) - wx / 2, y: top, w: wx, h: ph, px: xs(v), py: ys(Math.max(cdf(D.hpl, v), cdf(D.rtpl, v))) });
    }
    var notes = ["Spearman " + num2(res.test.spearman) + " (green above " + T.spearmanGreen.toFixed(2) + ", red below " + T.spearmanRed.toFixed(2) + ") · KS " + num2(res.test.ks) + " (green below " + T.ksGreen.toFixed(2) + ", red above " + T.ksRed.toFixed(2) + ")",
      "Share of the " + res.window + " days with P&L at or below each value"];
    var y2 = bottom + fs * 2 + 12;
    notes.forEach(function (t) { label(svg, 0, y2, fit(t + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1, "class": "vpa-note" }); y2 += fs + 3; });
    return Math.ceil(y2 - fs + 6);
  };

  Chart.prototype._tipLines = function (it) {
    var o = this.options, f = makeFormatters(o.data, o.locale), L = this._labels(), res = this._res, self = this;
    if (it.kind === "other") return [fill(L.other, { n: it.obj.count }), "Together " + f.signed(it.obj.contribution) + " of the unexplained volatility"];
    if (it.kind === "day") {
      var j = it.index, gaps = res.factors.map(function (x) { return { l: x.label, g: x.gap[j] }; }).filter(function (q) { return q.g !== 0; }).sort(function (a, b) { return Math.abs(b.g) - Math.abs(a.g); }).slice(0, 3);
      return [res.dates[j] + (j < res.start ? " · " + L.outside.toLowerCase() : ""), L.hpl + " " + f.signed(res.hpl[j]), L.rtpl + " " + f.signed(res.rtpl[j]), L.unexplained + " " + f.signed(res.unexplained[j])]
        .concat(gaps.length ? ["Largest gaps: " + gaps.map(function (q) { return q.l + " " + f.signed(q.g); }).join(", ")] : []);
    }
    if (it.kind === "point") return ["P&L at or below " + f.signed(it.value), "HPL " + f.percent(it.ph, 0) + " of days · RTPL " + f.percent(it.pr, 0), "Gap " + f.percent(Math.abs(it.ph - it.pr), 0) + " (KS is the largest gap: " + num2(res.test.ks) + ")"];
    var x = it.obj, t = x.ifFixed;
    return [x.label + (x.modelled ? "" : " (" + L.notModelled + ")"), x.group + " · rank " + x.rank + " of " + res.factors.length,
      "Share of unexplained volatility " + f.signed(x.contribution) + " (" + f.percent(x.share, 0) + ")",
      "Gap on its own ±" + f.value(x.sdGap) + " a day · mean " + f.signed(x.meanGap),
      "HPL " + f.signed(x.hplSum) + " · RTPL " + f.signed(x.rtplSum) + " over " + res.window + " days",
      L.ifFixed + ": " + self._zoneName(t.zone).toLowerCase() + " (Spearman " + num2(t.spearman) + ", KS " + num2(t.ks) + ")"];
  };

  Chart.prototype._detail = function (it) {
    if (!it) return null;
    var res = this._res, view = this._view;
    if (it.kind === "other") return { view: view, kind: "other", count: it.obj.count, contribution: it.obj.contribution, factors: it.obj.factors.map(function (x) { return x.key; }) };
    if (it.kind === "day") { var j = it.index; return { view: view, kind: "day", date: res.dates[j], hpl: res.hpl[j], rtpl: res.rtpl[j], unexplained: res.unexplained[j], inWindow: j >= res.start, gaps: res.factors.map(function (x) { return { key: x.key, gap: x.gap[j] }; }) }; }
    if (it.kind === "point") return { view: view, kind: "point", value: it.value, hplShare: it.ph, rtplShare: it.pr };
    var x = it.obj;
    return { view: view, kind: "factor", key: x.key, label: x.label, group: x.group, modelled: x.modelled, fixed: x.fixed, rank: x.rank, contribution: x.contribution, share: x.share, sdGap: x.sdGap, meanGap: x.meanGap,
      hplSum: x.hplSum, rtplSum: x.rtplSum, ifFixed: { spearman: x.ifFixed.spearman, ks: x.ifFixed.ks, zone: x.ifFixed.zone } };
  };

  Chart.prototype.howToRead = function () {
    var v = this._view || this.options.view;
    if (v === "daily") return "The dark line is front-office hypothetical P&L (HPL) and the dashed line the risk model's P&L (RTPL), day by day. Grey bars are the difference, the unexplained P&L. Only the most recent days, inside the test window, count for the test.";
    if (v === "distribution") return "Each line shows the share of days with P&L at or below a value, for HPL and for RTPL. If the risk model matched the front office, the two lines would sit on top of each other. The coloured bar marks the largest gap between them, the Kolmogorov-Smirnov (KS) statistic.";
    return "Each bar is one risk factor's share of the unexplained P&L volatility (HPL − RTPL). Shares add up exactly to the total; a bar to the left means the factor's gap offsets other gaps. The diamond is the factor's gap on its own, and the right column shows the test zone the desk would reach if that factor's gap were closed.";
  };

  Chart.prototype.describe = function () {
    var o = this.options, f = makeFormatters(o.data, o.locale), L = this._labels(), res = this._res || compute(o.data, this._opts()), t = res.test, T = res.thresholds, out = [], self = this;
    var why = [];
    if (t.spearman == null || t.spearman <= T.spearmanGreen) why.push("Spearman " + num2(t.spearman) + (t.spearman != null && t.spearman >= T.spearmanRed ? " is below " + T.spearmanGreen.toFixed(2) : " is below " + T.spearmanRed.toFixed(2)));
    if (t.ks >= T.ksGreen) why.push("KS " + num2(t.ks) + (t.ks <= T.ksRed ? " is above " + T.ksGreen.toFixed(2) : " is above " + T.ksRed.toFixed(2)));
    out.push("Over the last " + res.window + " days the desk is in the " + this._zoneName(t.zone).toLowerCase() + " zone of the P&L attribution test" + (why.length ? ": " + why.join(" and ") + "." : " (Spearman " + num2(t.spearman) + ", KS " + num2(t.ks) + ")."));
    out.push("Unexplained P&L is ±" + f.value(res.sdUnexplained) + " a day" + (res.volRatio != null ? ", " + f.percent(res.volRatio, 0) + " of the front office's P&L volatility" : "") + ".");
    var a = res.order[0], b = res.order[1];
    out.push(a.label + (a.modelled ? "" : ", which is not in the risk model,") + " explains " + f.percent(a.share, 0) + " of it" + (b ? ", followed by " + b.label + " (" + f.percent(b.share, 0) + ")" : "") + ".");
    var off = res.factors.filter(function (x) { return x.share < -0.02; }).sort(function (p, q) { return p.contribution - q.contribution; });
    if (off.length) out.push("The gap on " + off[0].label + " partly offsets the others.");
    if (t.zone !== "green") {
      if (res.pathReachesGreen) { var last = res.path[res.path.length - 1].test; out.push("Closing the gap on " + res.path.map(function (p) { return p.label; }).join(" and ") + " would bring the desk to green (Spearman " + num2(last.spearman) + ", KS " + num2(last.ks) + ")."); }
      else if (res.path.length) out.push("Even closing the gaps on " + res.path.map(function (p) { return p.label; }).join(", ") + " only reaches " + this._zoneName(res.path[res.path.length - 1].test.zone).toLowerCase() + ".");
    }
    if (res.fixed.length) out.push("Fixes applied: " + res.fixed.join(", ") + ".");
    return out.join(" ");
  };

  /* ======================================================================
     5. EXPORT AND NOTES
     ====================================================================== */
  Chart.prototype.getExportData = function () {
    var o = this.options, data = o.data, L = this._labels(), f = makeFormatters(data, o.locale), res = this._res || compute(data, this._opts()), self = this, T = res.thresholds;
    var unit = { prefix: data.prefix || "", suffix: data.suffix || "", decimals: data.decimals != null ? data.decimals : 0, negatives: data.negatives };
    var money = function (label) { return { label: label, type: "number", unit: unit }; };
    var ratio = function (label) { return { label: label, type: "number", unit: { decimals: 3 } }; };
    var pct = function (label) { return { label: label, type: "percent", decimals: 1 }; };
    var txt = function (label) { return { label: label, type: "text" }; };
    var sheets = [];
    sheets.push({ name: "Factors", columns: [{ label: "Rank", type: "number", unit: { decimals: 0 } }, txt("Risk factor"), txt("Group"), txt("In risk model"), txt("Fixed"), money("HPL over window"), money("RTPL over window"), money("Mean daily gap"), money("Gap volatility"), money("Share of unexplained volatility"), pct("Share (%)"), ratio("Spearman if fixed"), ratio("KS if fixed"), txt("Zone if fixed")],
      rows: res.order.map(function (x) { return [x.rank, x.label, x.group, x.modelled ? "Yes" : "No", x.fixed ? "Yes" : "No", x.hplSum, x.rtplSum, x.meanGap, x.sdGap, x.contribution, x.share, x.ifFixed.spearman, x.ifFixed.ks, self._zoneName(x.ifFixed.zone)]; }),
      text: res.order.map(function (x) { return [String(x.rank), x.label, x.group, x.modelled ? "Yes" : "No", x.fixed ? "Yes" : "No", f.signed(x.hplSum), f.signed(x.rtplSum), f.signed(x.meanGap), f.value(x.sdGap), f.signed(x.contribution), f.percent(x.share), num2(x.ifFixed.spearman), num2(x.ifFixed.ks), self._zoneName(x.ifFixed.zone)]; }),
      flag: res.order.map(function (x) { return !x.modelled; }) });
    var cap = o.exportDays != null ? o.exportDays : 20000, from = Math.max(0, res.dates.length - cap), idx = [];
    for (var j = from; j < res.dates.length; j++) idx.push(j);
    sheets.push({ name: "Daily", columns: [txt("Date"), money("HPL"), money("RTPL"), money("Unexplained"), txt("In test window")],
      rows: idx.map(function (j) { return [res.dates[j], res.hpl[j], res.rtpl[j], res.unexplained[j], j >= res.start ? "Yes" : "No"]; }),
      text: idx.map(function (j) { return [res.dates[j], f.signed(res.hpl[j]), f.signed(res.rtpl[j]), f.signed(res.unexplained[j]), j >= res.start ? "Yes" : "No"]; }) });
    var tr = [["Spearman correlation", res.test.spearman, "green above " + T.spearmanGreen + ", red below " + T.spearmanRed], ["Kolmogorov-Smirnov statistic", res.test.ks, "green below " + T.ksGreen + ", red above " + T.ksRed],
      ["Unexplained volatility ÷ HPL volatility", res.volRatio, ""], ["Mean unexplained ÷ HPL volatility", res.meanRatio, ""], ["Variance of unexplained ÷ variance of HPL", res.varRatio, ""]];
    res.path.forEach(function (p, i) { tr.push(["Path step " + (i + 1) + ": fix " + p.label + " → Spearman", p.test.spearman, self._zoneName(p.test.zone)], ["Path step " + (i + 1) + ": fix " + p.label + " → KS", p.test.ks, self._zoneName(p.test.zone)]); });
    sheets.push({ name: "Test", columns: [txt("Measure"), ratio("Value"), txt("Note")], rows: tr, text: tr.map(function (r) { return [r[0], r[1] == null ? "n/a" : r[1].toFixed(3), r[2]]; }) });
    var notes = (o.annotations || []).map(function (a, i) { return [String(i + 1), a.factor != null ? String(a.factor) : "Date: " + String(a.date || ""), a.text || ""]; });
    if (notes.length) sheets.push({ name: "Notes", columns: [txt("No."), txt("Factor or date"), txt("Note")], rows: notes });
    return {
      title: data.title || "P&L attribution", subtitle: data.subtitle || "", summary: this.describe(), library: "Veyforma P&L Attribution " + VERSION, sheets: sheets,
      meta: [["Unit", data.unit], ["As of", data.asOf], ["Desk", data.desk], ["Test window", res.window + " days (" + res.dates[res.start] + " to " + res.dates[res.dates.length - 1] + ")"],
        ["PLA test zone", self._zoneName(res.test.zone) + " (Spearman " + num2(res.test.spearman) + ", KS " + num2(res.test.ks) + ")"],
        ["Fixes applied", res.fixed.length ? res.fixed.join(", ") : null],
        ["Method", "Spearman = correlation of the ranks of daily HPL and RTPL (ties averaged); KS = largest gap between their empirical distribution functions; green if Spearman > " + T.spearmanGreen + " and KS < " + T.ksGreen + ", red if Spearman < " + T.spearmanRed + " or KS > " + T.ksRed + ", otherwise amber; factor share = cov(gap, unexplained) ÷ sd(unexplained), adds up to sd(unexplained); \"if fixed\" sets that factor's RTPL equal to its HPL" + (from > 0 ? "; daily sheet limited to the last " + cap + " days" : "")],
        ["Data source", data.source]]
    };
  };
  Chart.prototype._annotationPoint = function (a) {
    var p = this._points || {};
    if (a.factor != null) return p[String(a.factor)] || null;
    if (a.date != null) return p["date:" + String(a.date)] || null;
    return null;
  };
  Chart.prototype._annotationTarget = function (evt) {
    var items = this._items || [], it = null;
    if (!evt) it = items[this._active];
    else {
      var svg = this.plotHost.querySelector("svg"), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      var x = (evt.clientX - r.left) * (vb.width / r.width), y = (evt.clientY - r.top) * (vb.height / r.height);
      for (var i = 0; i < items.length; i++) { var q = items[i]; if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) { it = q; break; } }
    }
    if (!it) return null;
    if (it.kind === "factor") return { factor: it.obj.key };
    if (it.kind === "day") return { date: this._res.dates[it.index] };
    return null;
  };
  Chart.prototype._annotationLabel = function (a) {
    if (a.date != null) return String(a.date);
    var x = (this._res || this.getResult()).factors.filter(function (q) { return q.key === String(a.factor); })[0];
    return x ? x.label : String(a.factor || "");
  };

  /* ======================================================================
     6. PUBLIC API
     ====================================================================== */
  root.VeyPlaAttribution = {
    version: VERSION,
    /** Draws the chart inside a container element or CSS selector. */
    create: function (target, options) { return new Chart(target, options); },
    /** Works out every figure without drawing. opts: { window, fix, thresholds, pathSteps }. */
    compute: function (data, opts) { return compute(data, opts); },
    /** The test on two series of daily P&L: { spearman, ks, zone }. */
    test: function (hpl, rtpl, thresholds) { return test(hpl, rtpl, assign({}, THRESHOLDS, thresholds || {})); },
    thresholds: THRESHOLDS,
    listThemes: function () { return Object.keys(THEMES); },
    getTheme: function (t) { return resolvePaTheme(t); },
    defaults: { options: DEFAULT_OPTIONS, labels: DEFAULT_LABELS, theme: BASE_THEME }
  };
})(typeof window !== "undefined" ? window : this);

/*!
 * Veyforma Charts
 * One entry point for every chart in this package. Each chart is also available
 * on its own global (VeyHeatmap, VeyRiskTornado, VeyPlaAttribution).
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
    version: "1.0.1",
    /** Exposure heatmap: concentrations by any two fields, e.g. sector × country. */
    heatmap: function (target, options) { return need("VeyHeatmap").create(target, options); },
    /** Risk-factor tornado: down and up impact per factor, with convexity, limits and hedges. */
    tornado: function (target, options) { return need("VeyRiskTornado").create(target, options); },
    /** P&L attribution: HPL vs RTPL by factor, with the FRTB PLA test and the path to green. */
    plaAttribution: function (target, options) { return need("VeyPlaAttribution").create(target, options); }
  };
})(typeof window !== "undefined" ? window : this);
