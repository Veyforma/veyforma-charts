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
