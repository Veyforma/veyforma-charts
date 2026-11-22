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
