// Debt Maturity Ladder – Veyforma Chart Library · https://www.veyforma.com/charts/debt-maturity-ladder
/*
 * Debt maturity ladder with facility timeline and liquidity cover.
 *
 * Give the as-of date and the facilities (amount, maturity, optional
 * amortisation, revolver limit, extension option and coupon) and the chart
 * builds the maturity profile by fiscal year or quarter, flags refinancing
 * walls, dates when each refinancing should start, compares maturities with
 * cash and committed undrawn lines, works out the weighted average maturity
 * with and without extension options, and prices refinancing at today's rates.
 *
 * Load veyforma-toolkit.js as well to get the chart menu: full screen, print,
 * PNG/JPEG/SVG/PDF/CSV/Excel downloads, copy, notes and the explanation box.
 *
 * No dependencies. Works in any current browser, and compute() also runs in Node.
 *
 * Original work created for Veyforma. Contains no third-party code.
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DAY = 86400000, YEAR_DAYS = 365.25;
  var instanceCount = 0;

  /* ======================================================================
     1. SETTINGS
     ====================================================================== */
  var BASE_THEME = {
    types: {                       // colours by facility type; other types take the palette below in order
      "Bond": "#c2410c", "Term loan": "#1d4ed8", "Revolver": "#0f766e", "Private placement": "#7c3aed",
      "Commercial paper": "#854d0e", "Mortgage": "#be185d", "Lease": "#64748b"
    },
    palette: ["#4d7c0f", "#0369a1", "#a21caf", "#9a3412", "#475569"],
    wall: "#b91c1c",               // wall markers and threshold line
    liquidity: "#111827",          // liquidity-now line and sources line
    uses: "#c2410c",               // cumulative maturities line
    gap: "#b91c1c",                // funding gap shading
    contractual: "#6b7280",        // outline of the contractual profile
    today: "#111827",
    actNow: "#b91c1c", soon: "#a16207", later: "#15803d",
    grid: "#ececec", axis: "#9ca3af", text: "#111827", mutedText: "#4b5563", axisText: "#4b5563",
    cardBackground: "#f9fafb", background: "transparent",
    tooltipBackground: "#111827", tooltipText: "#ffffff", focus: "#c2410c", accent: "#c2410c",
    fontFamily: "inherit", fontSize: 12
  };
  var THEMES = {
    veyforma: {},
    mono: { types: { "Bond": "#111111", "Term loan": "#4b4b4b", "Revolver": "#767676", "Private placement": "#2e2e2e", "Commercial paper": "#5e5e5e", "Mortgage": "#3a3a3a", "Lease": "#858585" },
      palette: ["#1f1f1f", "#525252", "#6b6b6b", "#404040", "#7a7a7a"], wall: "#111111", uses: "#4b4b4b", gap: "#111111", accent: "#111111", focus: "#111111", actNow: "#111111", soon: "#4b4b4b", later: "#767676" },
    "colour-safe": { types: { "Bond": "#d55e00", "Term loan": "#0072b2", "Revolver": "#009e73", "Private placement": "#cc79a7", "Commercial paper": "#8a6d00", "Mortgage": "#3b7cae", "Lease": "#6b7280" },
      palette: ["#000000", "#8a6d00", "#3b7cae", "#b85b94", "#6b7280"], wall: "#b2182b", uses: "#d55e00", gap: "#b2182b", accent: "#0072b2", actNow: "#b2182b", soon: "#8a6d00", later: "#007a5e" },
    ocean: { types: { "Bond": "#0e7490", "Term loan": "#1e3a8a", "Revolver": "#0891b2", "Private placement": "#4338ca", "Commercial paper": "#b45309", "Mortgage": "#be185d", "Lease": "#64748b" },
      cardBackground: "#eef5f8", accent: "#0e7490", uses: "#0e7490" },
    forest: { types: { "Bond": "#4d6b31", "Term loan": "#7c4a1e", "Revolver": "#1f6f5c", "Private placement": "#6b4f9e", "Commercial paper": "#a16207", "Mortgage": "#9f1239", "Lease": "#78716c" },
      cardBackground: "#f2f4ee", accent: "#4d6b31", uses: "#4d6b31" },
    corporate: { types: { "Bond": "#1d4ed8", "Term loan": "#0f172a", "Revolver": "#0e7490", "Private placement": "#6d28d9", "Commercial paper": "#b45309", "Mortgage": "#be123c", "Lease": "#64748b" },
      cardBackground: "#f1f4f8", accent: "#1d4ed8", uses: "#1d4ed8" },
    midnight: { background: "#111418", types: { "Bond": "#f08a5d", "Term loan": "#60a5fa", "Revolver": "#2dd4bf", "Private placement": "#c4b5fd", "Commercial paper": "#fbbf24", "Mortgage": "#f472b6", "Lease": "#94a3b8" },
      palette: ["#a3e635", "#38bdf8", "#e879f9", "#fdba74", "#cbd5e1"], wall: "#fb7185", liquidity: "#f3f4f6", uses: "#f08a5d", gap: "#fb7185", contractual: "#9ca3af", today: "#f3f4f6",
      actNow: "#fb7185", soon: "#fbbf24", later: "#4ade80", grid: "#252a31", axis: "#4b5563", text: "#f3f4f6", mutedText: "#a3abb8", axisText: "#a3abb8",
      cardBackground: "#1b2027", tooltipBackground: "#f3f4f6", tooltipText: "#111418", focus: "#93c5fd", accent: "#f08a5d" }
  };

  var DEFAULT_OPTIONS = {
    data: null,             // required: { asOf, facilities: [...] } (chapter 3 of the manual)
    view: "ladder",         // "ladder" | "facilities" | "coverage"
    period: "year",         // "year" (fiscal years) or "quarter"
    horizon: null,          // periods shown before "Later": 10 years or 12 quarters by default
    stackBy: "type",        // ladder segments by facility "type" or by "facility"
    extensions: false,      // true: assume every extension option is exercised
    whatIf: null,           // [{ facility, maturity }]: move maturities to test a refinancing
    wallShare: 0.2,         // a period holding more than this share of debt is a refinancing wall
    leadMonths: 18,         // start refinancing this many months before maturity
    deadlineMonths: 12,     // and have it done this many months before maturity
    coverTarget: 1.2,       // target for liquidity sources / maturities over the next 12 months
    theme: "veyforma",
    locale: undefined,
    animate: true,
    summary: true,
    legend: true,
    labels: null,
    ariaLabel: undefined,
    caption: true,
    annotations: null,      // notes, e.g. [{ facility: "Bond 2028", text: "Tender planned" }] or [{ period: "2028", text: "..." }]
    onAnnotationsChange: null,
    onItemClick: null,
    toolbar: true
  };

  var DEFAULT_LABELS = {
    ladder: "Maturities by period", facilities: "Facilities by maturity", coverage: "Maturities against liquidity",
    wall: "Refinancing wall", due: "Due in 24 months", wam: "Weighted avg. maturity", stepUp: "Interest step-up", actBy: "Start refinancing",
    liquidityNow: "Liquidity now", threshold: "Wall threshold", contractual: "Contractual profile", later: "Later",
    uses: "Cumulative maturities", sources: "Liquidity sources", gap: "Funding gap", today: "Today",
    actNow: "Start now", overdue: "Inside deadline", soon: "Within 6 months", fine: "Later",
    extension: "Extension option", years: "yrs"
  };

  /* ======================================================================
     2. HELPERS
     ====================================================================== */
  var warned = {};
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k) && s[k] !== undefined) t[k] = s[k];
    }
    return t;
  }
  function warn(msg) { if (warned[msg]) return; warned[msg] = 1; if (root.console && console.warn) console.warn("VeyDebtLadder: " + msg); }
  function fail(msg) { throw new Error("VeyDebtLadder: " + msg); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function fill(t, map) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; }); }
  function num(v) { return typeof v === "number" ? v : v == null || v === "" ? NaN : +v; }
  function finite(v, what) { var x = num(v); if (!isFinite(x)) fail(what + " must be a number."); return x; }
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function htmlEl(tag, cls, parent) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }
  var measureCtx;
  function textWidth(text, size, weight, family) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = (weight || 400) + " " + size + "px " + (family || "sans-serif");
    return measureCtx.measureText(String(text)).width;
  }
  function fit(text, max, size, weight, family) {
    text = String(text);
    if (textWidth(text, size, weight, family) <= max) return text;
    while (text.length > 1 && textWidth(text + "…", size, weight, family) > max) text = text.slice(0, -1);
    return text + "…";
  }
  function hexRgb(c) {
    c = String(c).replace("#", "");
    if (c.length === 3) c = c.replace(/./g, function (m) { return m + m; });
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function rgbHex(r) { return "#" + r.map(function (v) { return ("0" + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2); }).join(""); }
  function mix(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return rgbHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function luminance(rgb) {
    var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var la = luminance(hexRgb(a)), lb = luminance(hexRgb(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function ensureContrast(col, bg, min) {
    if (!/^#/.test(String(col)) || !/^#/.test(String(bg))) return col;
    var dark = luminance(hexRgb(bg)) > 0.4, out = col;
    for (var t = 0; t <= 1.001 && contrast(out, bg) < min; t += 0.05) {
      var c = hexRgb(col);
      out = rgbHex(c.map(function (v) { return dark ? v * (1 - t) : v + (255 - v) * t; }));
    }
    return out;
  }
  function makeFormatters(data, locale) {
    var decimals = data.decimals != null ? finite(data.decimals, "data.decimals") : 0;
    var brackets = data.negatives === "brackets";
    var cache = {};
    function nf(d) {
      if (cache[d]) return cache[d];
      try { cache[d] = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }); }
      catch (e) { cache[d] = { format: function (v) { return v.toFixed(d); } }; }
      return cache[d];
    }
    function value(v, d) {
      if (v == null || !isFinite(v)) return "–";
      var dd = d == null ? decimals : d, body = (data.prefix || "") + nf(dd).format(Math.abs(v)) + (data.suffix || "");
      return v < -1e-12 ? (brackets ? "(" + body + ")" : "−" + body) : body;
    }
    function signed(v, d) { var s = value(v, d); return v != null && isFinite(v) && Number(v.toFixed(d == null ? decimals : d)) > 0 ? "+" + s : s; }
    function int(v) { if (v == null || !isFinite(v)) return "–"; return nf(0).format(v); }
    function percent(v, d) { return v == null || !isFinite(v) ? "–" : nf(d == null ? 1 : d).format(v * 100) + "%"; }
    function ratio(v) { return v == null ? "–" : !isFinite(v) ? "n/a" : nf(2).format(v) + "×"; }
    function years(v) { return v == null || !isFinite(v) ? "–" : nf(1).format(v); }
    function rate(v) { return v == null || !isFinite(v) ? "–" : nf(2).format(v * 100) + "%"; }
    return { value: value, signed: signed, int: int, percent: percent, ratio: ratio, years: years, rate: rate, decimals: decimals };
  }

  /* ======================================================================
     3. DATES
     ====================================================================== */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function parseDate(s, what) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? "" : s));
    if (!m) fail(what + ' must be a date written as YYYY-MM-DD (got "' + s + '").');
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) fail(what + ' is not a real date ("' + s + '").');
    return t;
  }
  function iso(t) { var d = new Date(t); return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
  function niceDate(t) { var d = new Date(t); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  /** Adds whole months, keeping the day of month where it exists (31 Jan + 1 month = 28/29 Feb). */
  function addMonths(t, n) {
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    var ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12, last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return Date.UTC(ty, tm, Math.min(day, last));
  }
  function yearsBetween(a, b) { return (b - a) / DAY / YEAR_DAYS; }

  /* ======================================================================
     4. DATA AND COMPUTE
     ====================================================================== */
  function readData(data) {
    if (!data || typeof data !== "object") fail("options.data is required.");
    var asOf = parseDate(data.asOf, "data.asOf");
    if (!Array.isArray(data.facilities) || !data.facilities.length) fail("data.facilities must be a non-empty array of { name, type, amount, maturity }.");
    var names = {}, out = [];
    data.facilities.forEach(function (f, k) {
      var w = "data.facilities[" + k + "]";
      if (!f || typeof f !== "object") fail(w + " must be an object.");
      var name = f.name != null && String(f.name).trim() ? String(f.name) : fail(w + ".name is required.");
      if (names[name]) fail('data.facilities repeats the name "' + name + '".');
      names[name] = 1;
      var amount = finite(f.amount, w + ".amount");
      if (amount < 0) fail(w + ".amount must be zero or more.");
      var limit = f.limit == null ? null : finite(f.limit, w + ".limit");
      if (limit != null && limit < amount) fail(w + ".limit (" + limit + ") is below the drawn amount (" + amount + ").");
      var maturity = parseDate(f.maturity, w + ".maturity");
      var amort = [];
      (f.amortisation || f.amortization || []).forEach(function (a, j) {
        var t = parseDate(a.date, w + ".amortisation[" + j + "].date"), v = finite(a.amount, w + ".amortisation[" + j + "].amount");
        if (v < 0) fail(w + ".amortisation[" + j + "].amount must be zero or more.");
        if (t > maturity) fail(w + ".amortisation[" + j + "].date is after the maturity.");
        amort.push({ t: t, amount: v });
      });
      amort.sort(function (a, b) { return a.t - b.t; });
      var past = amort.filter(function (a) { return a.t <= asOf; });
      if (past.length) warn("Amortisation dates on or before data.asOf are ignored (" + name + "): the amount is taken as outstanding today.");
      amort = amort.filter(function (a) { return a.t > asOf; });
      var amSum = amort.reduce(function (s, a) { return s + a.amount; }, 0);
      if (amSum > amount + 1e-9) fail(w + ": amortisation (" + amSum + ") is more than the amount outstanding (" + amount + ").");
      var ext = null;
      if (f.extension) {
        if (f.extension.to != null) ext = parseDate(f.extension.to, w + ".extension.to");
        else if (f.extension.years != null) ext = addMonths(maturity, Math.round(finite(f.extension.years, w + ".extension.years") * 12));
        else if (f.extension.months != null) ext = addMonths(maturity, Math.round(finite(f.extension.months, w + ".extension.months")));
        else fail(w + ".extension needs to, years or months.");
        if (ext <= maturity) fail(w + ".extension must end after the maturity.");
      }
      var coupon = f.coupon == null ? null : finite(f.coupon, w + ".coupon");
      if (coupon != null && (coupon < -0.05 || coupon > 1)) fail(w + ".coupon must be a decimal such as 0.045 for 4.5%.");
      out.push({ name: name, type: f.type != null ? String(f.type) : "Other", amount: amount, limit: limit, undrawn: limit != null ? limit - amount : 0,
        maturity: maturity, amort: amort, extension: ext, coupon: coupon, rateType: f.rateType || null, currency: f.currency || null,
        secured: f.secured == null ? null : !!f.secured, lender: f.lender || null, index: k });
    });
    var total = out.reduce(function (s, f) { return s + f.amount; }, 0);
    if (!(total > 0)) fail("the facilities hold no outstanding debt.");
    var cash = data.cash == null ? 0 : finite(data.cash, "data.cash");
    if (cash < 0) fail("data.cash must be zero or more.");
    var cashFlow = data.cashFlow == null ? 0 : finite(data.cashFlow, "data.cashFlow");
    var refi = data.refinanceRate;
    if (refi != null && typeof refi !== "number" && typeof refi !== "object") fail("data.refinanceRate must be a decimal or an object of decimals by facility type.");
    if (typeof refi === "number" && !isFinite(refi)) fail("data.refinanceRate must be a number.");
    var fy = data.fiscalYearStart == null ? 1 : Math.round(finite(data.fiscalYearStart, "data.fiscalYearStart"));
    if (fy < 1 || fy > 12) fail("data.fiscalYearStart must be a month number from 1 to 12.");
    return { asOf: asOf, facilities: out, total: total, cash: cash, cashFlow: cashFlow, refinanceRate: refi == null ? null : refi, fiscalYearStart: fy,
      title: data.title, subtitle: data.subtitle, company: data.company, unit: data.unit, source: data.source,
      prefix: data.prefix, suffix: data.suffix, decimals: data.decimals, negatives: data.negatives };
  }

  function isLease(type) { return /lease/i.test(type); }
  function isCP(type) { return /commercial paper|^cp$/i.test(type); }
  function refiRateFor(D, type) {
    var r = D.refinanceRate;
    if (r == null) return null;
    if (typeof r === "number") return r;
    if (r[type] != null) return +r[type];
    if (r["default"] != null) return +r["default"];
    return null;
  }

  /** Period buckets from the as-of date: fiscal years or calendar quarters, then "Later". */
  function buckets(D, period, horizon) {
    var out = [], d = new Date(D.asOf + DAY), y = d.getUTCFullYear(), m = d.getUTCMonth(), i, start, end;
    if (period === "quarter") {
      start = Date.UTC(y, Math.floor(m / 3) * 3, 1);
      for (i = 0; i < horizon; i++) {
        end = addMonths(start, 3);
        var q = new Date(start);
        out.push({ label: "Q" + (Math.floor(q.getUTCMonth() / 3) + 1) + " " + q.getUTCFullYear(), start: start, end: end });
        start = end;
      }
    } else {
      var fs = D.fiscalYearStart - 1, sy = m >= fs ? y : y - 1;
      start = Date.UTC(sy, fs, 1);
      for (i = 0; i < horizon; i++) {
        end = Date.UTC(sy + i + 1, fs, 1);
        var endYear = fs === 0 ? sy + i : sy + i + 1;
        out.push({ label: fs === 0 ? String(endYear) : "FY" + String(endYear).slice(-2), start: i === 0 ? start : Date.UTC(sy + i, fs, 1), end: end });
      }
    }
    out.push({ label: null, start: out[out.length - 1].end, end: Infinity, later: true });
    return out;
  }

  function compute(data, opts) {
    opts = opts || {};
    var D = readData(data), asOf = D.asOf, i, j, k;
    var period = opts.period === "quarter" ? "quarter" : "year";
    var horizon = Math.max(1, Math.min(period === "quarter" ? 40 : 30, Math.round(opts.horizon || (period === "quarter" ? 12 : 10))));
    var lead = opts.leadMonths == null ? 18 : Math.max(0, Math.round(opts.leadMonths));
    var deadlineM = opts.deadlineMonths == null ? 12 : Math.max(0, Math.round(opts.deadlineMonths));
    var wallShare = opts.wallShare == null ? 0.2 : +opts.wallShare;
    var coverTarget = opts.coverTarget == null ? 1.2 : +opts.coverTarget;
    var whatIf = {}, whatIfNames = [];
    (opts.whatIf || []).forEach(function (w, q) {
      var f = D.facilities.filter(function (x) { return x.name === String(w.facility); })[0];
      if (!f) fail('whatIf[' + q + '].facility "' + w.facility + '" is not a facility name.');
      var t = parseDate(w.maturity, "whatIf[" + q + "].maturity");
      if (f.amort.length && t < f.amort[f.amort.length - 1].t) fail("whatIf[" + q + "].maturity is before the facility's last amortisation date.");
      whatIf[f.name] = t; whatIfNames.push(f.name);
    });
    var B = buckets(D, period, horizon);
    function bucketOf(t) { for (var q = 0; q < B.length; q++) if (t < B[q].end) return q; return B.length - 1; }

    /** Every repayment of the book under one set of maturities. */
    function flowsFor(useExt, useWhatIf, sorted) {
      var fl = [];
      D.facilities.forEach(function (f) {
        var mat = useWhatIf && whatIf[f.name] != null ? whatIf[f.name] : useExt && f.extension ? f.extension : f.maturity;
        var am = 0, lease = isLease(f.type);
        for (var q = 0; q < f.amort.length; q++) { var a = f.amort[q]; fl.push({ facility: f.name, type: f.type, t: a.t, amount: a.amount, kind: "amortisation", fi: f.index, lease: lease }); am += a.amount; }
        var bullet = f.amount - am;
        if (bullet > 1e-12 || f.amort.length === 0) fl.push({ facility: f.name, type: f.type, t: Math.max(mat, asOf), amount: Math.max(0, bullet), kind: "maturity", overdue: mat <= asOf, fi: f.index, lease: lease });
      });
      if (sorted) fl.sort(function (a, b) { return a.t - b.t || a.fi - b.fi; });
      return fl;
    }
    function maturityOf(f, useExt, useWhatIf) { return useWhatIf && whatIf[f.name] != null ? whatIf[f.name] : useExt && f.extension ? f.extension : f.maturity; }
    function wamOf(fl) { var s = 0, w = 0; fl.forEach(function (x) { s += x.amount; w += x.amount * yearsBetween(asOf, x.t); }); return s > 0 ? w / s : null; }
    function profile(fl) { var p = B.map(function () { return 0; }); fl.forEach(function (x) { p[bucketOf(x.t)] += x.amount; }); return p; }

    var ext = !!opts.extensions, flows = flowsFor(ext, true, true), contractual = !ext && !whatIfNames.length ? flows : flowsFor(false, false, false);
    flows.forEach(function (x) { x.bucket = bucketOf(x.t); });
    var overdue = D.facilities.filter(function (f) { return maturityOf(f, ext, true) <= asOf; }).map(function (f) { return f.name; });
    if (overdue.length) warn("Maturity on or before data.asOf for " + overdue.join(", ") + ": shown as due now.");

    // Types in the order they first appear; colours are assigned from the theme.
    var types = [];
    D.facilities.forEach(function (f) { if (types.indexOf(f.type) < 0) types.push(f.type); });
    var byType = B.map(function () { var o = {}; types.forEach(function (t) { o[t] = 0; }); return o; });
    var byFacility = B.map(function () { return {}; });
    flows.forEach(function (x) { byType[x.bucket][x.type] += x.amount; byFacility[x.bucket][x.facility] = (byFacility[x.bucket][x.facility] || 0) + x.amount; });
    var totals = profile(flows), contractualTotals = profile(contractual);
    var changed = false;
    for (i = 0; i < B.length; i++) if (Math.abs(totals[i] - contractualTotals[i]) > 1e-9 * D.total) changed = true;

    // Refinancing wall: periods holding more than wallShare of all debt, and the peak period.
    var peak = 0;
    for (i = 1; i < B.length - 1; i++) if (totals[i] > totals[peak]) peak = i;
    var walls = [];
    for (i = 0; i < B.length - 1; i++) if (totals[i] > wallShare * D.total + 1e-12) walls.push(i);

    // Rolling windows from the as-of date, in the style of rating-agency liquidity tests:
    // a revolver's undrawn amount counts only if the revolver runs beyond the window; leases are not counted as maturities.
    function windowAt(months) {
      var t = addMonths(asOf, months), uses = 0, all = 0, sources = D.cash + D.cashFlow * months / 12, undrawn = 0;
      for (var q = 0; q < flows.length && flows[q].t <= t; q++) { all += flows[q].amount; if (!flows[q].lease) uses += flows[q].amount; }
      D.facilities.forEach(function (f) { if (f.undrawn > 0 && maturityOf(f, ext, true) > t) undrawn += f.undrawn; });
      sources += undrawn;
      return { months: months, end: t, due: all, uses: uses, undrawn: undrawn, sources: sources, ratio: uses > 0 ? sources / uses : Infinity, gap: uses - sources, share: all / D.total };
    }
    var w12 = windowAt(12), w24 = windowAt(24);

    // Cumulative maturities against liquidity at each period end.
    var coverage = [], cum = 0, firstGap = null, usesByBucket = B.map(function () { return 0; });
    flows.forEach(function (x) { if (!x.lease) usesByBucket[x.bucket] += x.amount; });
    for (i = 0; i < B.length - 1; i++) {
      var tEnd = B[i].end, undr = 0;
      cum += usesByBucket[i];
      D.facilities.forEach(function (f) { if (f.undrawn > 0 && maturityOf(f, ext, true) > tEnd) undr += f.undrawn; });
      var src = D.cash + undr + D.cashFlow * Math.max(0, yearsBetween(asOf, tEnd));
      coverage.push({ bucket: i, end: tEnd, uses: cum, undrawn: undr, sources: src, gap: cum - src });
      if (firstGap == null && cum - src > 1e-9) firstGap = i;
    }
    var liquidityNow = w12.sources - D.cashFlow;   // cash plus revolvers running beyond 12 months, before any cash flow

    // Facility schedule: maturity, extension, act-by date and deadline, refinancing cost.
    var facilities = D.facilities.map(function (f) {
      var mat = maturityOf(f, ext, true), actBy = addMonths(mat, -lead), deadline = addMonths(mat, -deadlineM);
      var refi = refiRateFor(D, f.type), bullet = f.amount - f.amort.reduce(function (s, a) { return s + a.amount; }, 0);
      // Commercial paper rolls over and leases run off, so neither needs a refinancing project; nor does a fully amortising loan.
      // A committed line has to be renewed whatever is drawn; otherwise an undrawn or fully amortising facility needs no refinancing.
      var timed = deadline <= asOf ? "overdue" : actBy <= asOf ? "actNow" : actBy <= addMonths(asOf, 6) ? "soon" : "fine";
      var status = isCP(f.type) ? "rolling" : isLease(f.type) ? "amortising" : f.limit > 0 ? timed : f.amount <= 0 ? "undrawn"
        : bullet <= 1e-9 && f.amort.length ? "amortising" : timed;
      var step = refi != null && f.coupon != null ? f.amount * (refi - f.coupon) : null;
      return { name: f.name, type: f.type, amount: f.amount, limit: f.limit, undrawn: f.undrawn, maturity: f.maturity, extension: f.extension, effective: mat,
        whatIf: whatIf[f.name] != null, actBy: actBy, deadline: deadline, status: status, yearsLeft: yearsBetween(asOf, mat), bullet: bullet,
        amort: f.amort, coupon: f.coupon, refiRate: refi, stepUp: step, rateType: f.rateType, currency: f.currency, secured: f.secured, lender: f.lender };
    });
    var schedule = facilities.slice().sort(function (a, b) { return a.effective - b.effective || b.amount - a.amount; });

    // Interest step-up: if every repayment in a period is refinanced at today's rate instead of its coupon.
    var stepByBucket = B.map(function () { return 0; }), stepKnown = false, stepMissing = [];
    var facByName = {}; facilities.forEach(function (f) { facByName[f.name] = f; });
    flows.forEach(function (x) {
      var f = facByName[x.facility];
      if (f.refiRate != null && f.coupon != null) { stepByBucket[x.bucket] += x.amount * (f.refiRate - f.coupon); stepKnown = true; }
      else if (stepMissing.indexOf(x.facility) < 0 && D.refinanceRate != null) stepMissing.push(x.facility);
    });
    var stepCum = [], sc = 0;
    for (i = 0; i < B.length; i++) { sc += stepByBucket[i]; stepCum.push(sc); }
    var step24 = 0;
    flows.forEach(function (x) { var f = facByName[x.facility]; if (x.t <= w24.end && f.refiRate != null && f.coupon != null) step24 += x.amount * (f.refiRate - f.coupon); });
    var avgCoupon = null, cw = 0, cs = 0;
    facilities.forEach(function (f) { if (f.coupon != null) { cw += f.amount * f.coupon; cs += f.amount; } });
    if (cs > 0) avgCoupon = cw / cs;

    var actNow = schedule.filter(function (f) { return f.status === "actNow" || f.status === "overdue"; });
    var nextAct = schedule.filter(function (f) { return f.status === "soon" || f.status === "fine"; }).sort(function (a, b) { return a.actBy - b.actBy; })[0] || null;
    var anyExt = D.facilities.some(function (f) { return !!f.extension; });

    return {
      asOf: asOf, period: period, horizon: horizon, buckets: B, types: types, byType: byType, byFacility: byFacility, totals: totals,
      contractualTotals: contractualTotals, changed: changed, extensions: ext, whatIfNames: whatIfNames, flows: flows,
      total: D.total, cash: D.cash, cashFlow: D.cashFlow, undrawnTotal: D.facilities.reduce(function (s, f) { return s + f.undrawn; }, 0),
      peak: peak, walls: walls, wallShare: wallShare, w12: w12, w24: w24, coverTarget: coverTarget, coverage: coverage, firstGap: firstGap, liquidityNow: liquidityNow,
      wam: wamOf(flows), wamContractual: wamOf(contractual), wamExtended: anyExt ? (ext ? wamOf(flows) : wamOf(flowsFor(true, true, false))) : null, anyExtension: anyExt,
      facilities: facilities, schedule: schedule, actNow: actNow, nextAct: nextAct, leadMonths: lead, deadlineMonths: deadlineM,
      stepByBucket: stepKnown ? stepByBucket : null, stepCum: stepKnown ? stepCum : null, step24: stepKnown ? step24 : null, stepMissing: stepMissing, avgCoupon: avgCoupon,
      overdue: overdue, data: D
    };
  }

  /* ======================================================================
     5. STYLES AND THEMES
     ====================================================================== */
  function injectStyles() {
    if (document.getElementById("vdl-styles")) return;
    var css =
      ".vdl{position:relative;color:var(--vdl-text);background:var(--vdl-bg);font-family:var(--vdl-font);line-height:1.4}" +
      ".vdl.vdl-filled{padding:14px 14px 8px;border-radius:10px}" +
      ".vdl-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px}" +
      ".vdl-stat{background:var(--vdl-card);border-radius:8px;padding:9px 12px;min-width:0}" +
      ".vdl-stat .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--vdl-card-muted);font-weight:600;overflow-wrap:anywhere;hyphens:auto}" +
      ".vdl-stat .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".vdl-stat .n{font-size:12px;color:var(--vdl-card-muted)}" +
      ".vdl-stat .v.vdl-wrap{white-space:normal;overflow-wrap:anywhere;line-height:1.2;font-size:17px}" +
      ".vdl-scope{font-size:12px;color:var(--vdl-muted);margin:0 0 4px}" +
      ".vdl-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;margin:0 0 6px;color:var(--vdl-text)}" +
      ".vdl-legend span{display:inline-flex;align-items:center;gap:6px}" +
      ".vdl-legend i{display:inline-block;width:12px;height:12px;border-radius:3px}" +
      ".vdl-legend i.vdl-tick{width:16px;height:3px;border-radius:1px}" +
      ".vdl-legend i.vdl-dash{width:16px;height:0;border-radius:0;border-top:2px dashed;background:none}" +
      ".vdl-legend i.vdl-diamond{width:9px;height:9px;border-radius:1px;transform:rotate(45deg);margin:0 2px}" +
      ".vdl-plot{display:block;width:100%;height:auto;overflow:visible;outline:none}" +
      ".vdl-plot:focus-visible{outline:2px solid var(--vdl-focus);outline-offset:4px;border-radius:4px}" +
      ".vdl-animate .vdl-grow{animation:vdl-fade .45s ease both}" +
      "@keyframes vdl-fade{from{opacity:0}to{opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.vdl-animate .vdl-grow{animation:none}}" +
      ".vdl-tip{position:absolute;left:0;top:0;pointer-events:none;background:var(--vdl-tip-bg);color:var(--vdl-tip-text);" +
      "font-size:12px;line-height:1.45;padding:8px 10px;border-radius:8px;opacity:0;transform:translateY(4px);" +
      "transition:opacity .12s,transform .12s;white-space:nowrap;z-index:5;font-variant-numeric:tabular-nums}" +
      ".vdl-tip.vdl-on{opacity:1;transform:none}.vdl-tip b{font-weight:600}" +
      ".vdl-table{border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin:0 0 14px;min-width:100%}" +
      ".vdl-table caption{text-align:left;font-weight:700;padding:0 0 6px}" +
      ".vdl-table th,.vdl-table td{padding:5px 8px;border-bottom:1px solid rgba(127,127,127,.25);text-align:right;white-space:nowrap}" +
      ".vdl-table th:first-child,.vdl-table td:first-child{text-align:left}" +
      ".vdl-table tr.vdl-flag td{color:var(--vdl-bad);font-weight:600}" +
      "@media (max-width:420px){.vdl-summary{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}.vdl-stat{padding:8px 10px}.vdl-stat .v{font-size:17px}}";
    var s = htmlEl("style");
    s.id = "vdl-styles";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  /* ======================================================================
     6. THE CHART
     ====================================================================== */
  function Chart(target, options) {
    var container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container || container.nodeType !== 1) fail("container not found (" + target + ").");
    if (!options || !options.data) fail("options.data is required.");
    injectStyles();
    this.id = ++instanceCount;
    this.container = container;
    this.options = assign({}, DEFAULT_OPTIONS, options);
    this.element = htmlEl("div", "vdl");
    this.element.setAttribute("role", "figure");
    this.summaryEl = htmlEl("div", "vdl-summary", this.element);
    this.scopeEl = htmlEl("p", "vdl-scope", this.element);
    this.legendEl = htmlEl("div", "vdl-legend", this.element);
    this.plotHost = htmlEl("div", "vdl-plot-host", this.element);
    this.tipEl = htmlEl("div", "vdl-tip", this.element);
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

  Chart.prototype.destroy = function () {
    if (this.toolkit && this.toolkit.destroy) this.toolkit.destroy();
    if (this._observer) this._observer.disconnect();
    if (this._onResize) root.removeEventListener("resize", this._onResize);
    document.removeEventListener("pointerdown", this._onDocTap);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  };
  Chart.prototype._hideTip = function () { this.tipEl.classList.remove("vdl-on"); if (this._hlEl) this._hlEl.setAttribute("opacity", 0); };
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
    tip.classList.add("vdl-on");
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(px - box.left - tw / 2, 4, Math.max(4, box.width - tw - 4)) + "px";
    var top = py - box.top - th - 14;
    if (top < 0) top = py - box.top + 18;
    tip.style.top = top + "px";
  };
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

  /* ======================================================================
     5. STYLES AND THEMES
     ====================================================================== */
  function resolveDlTheme(theme) {
    var t;
    if (theme == null || theme === "") theme = "veyforma";
    if (typeof theme === "string") {
      if (!THEMES.hasOwnProperty(theme)) { warn('Unknown theme "' + theme + '". The "veyforma" theme is used instead.'); theme = "veyforma"; }
      t = assign({}, BASE_THEME, THEMES[theme]);
      t.types = assign({}, BASE_THEME.types, THEMES[theme].types);
    } else if (typeof theme === "object") {
      var b = theme["extends"] ? resolveDlTheme(theme["extends"]) : assign({}, BASE_THEME, { types: assign({}, BASE_THEME.types) });
      var types = assign({}, b.types, theme.types);
      t = assign(b, theme);
      t.types = types;
      delete t["extends"];
    } else { warn("The theme option must be a theme name or an object."); t = assign({}, BASE_THEME, { types: assign({}, BASE_THEME.types) }); }
    var bg = /^#/.test(t.background) ? t.background : "#ffffff", card = /^#/.test(t.cardBackground) ? t.cardBackground : bg;
    ["axisText", "mutedText"].forEach(function (k) { t[k] = ensureContrast(t[k], bg, 4.5); });
    t.cardMuted = ensureContrast(t.mutedText, card, 4.5);
    ["wall", "actNow", "soon", "later", "uses", "accent"].forEach(function (k) { t[k + "Text"] = ensureContrast(ensureContrast(t[k], bg, 4.5), card, 4.5); });
    t.pageBg = bg;
    return t;
  }
  function typeColour(theme, type, types) {
    if (theme.types[type]) return theme.types[type];
    var unknown = types.filter(function (x) { return !theme.types[x]; });
    return theme.palette[Math.max(0, unknown.indexOf(type)) % theme.palette.length];
  }

  /* ======================================================================
     6. THE CHART
     ====================================================================== */
  Chart.prototype.update = function (partial) {
    if (!partial) return this;
    if (partial.data && partial.data !== this.options.data && this.options.animate) this._animateNext = true;
    if (partial.view && partial.view !== this.options.view && this.options.animate) this._animateNext = true;
    assign(this.options, partial);
    if (partial.whatIf === null) this.options.whatIf = null;
    return this.redraw();
  };
  Chart.prototype.setData = function (data) { return this.update({ data: data }); };
  Chart.prototype.setView = function (view) { return this.update({ view: view }); };
  Chart.prototype.setTheme = function (theme) { return this.update({ theme: theme }); };
  Chart.prototype.setPeriod = function (period) { return this.update({ period: period, horizon: null }); };
  Chart.prototype.setExtensions = function (on) { return this.update({ extensions: !!on }); };
  Chart.prototype.setWhatIf = function (list) { this.options.whatIf = list && list.length ? list : null; return this.redraw(); };
  Chart.prototype.getTheme = function () { return resolveDlTheme(this.options.theme); };
  Chart.prototype._opts = function () {
    var o = this.options;
    return { period: o.period, horizon: o.horizon, extensions: o.extensions, whatIf: o.whatIf, wallShare: o.wallShare, leadMonths: o.leadMonths, deadlineMonths: o.deadlineMonths, coverTarget: o.coverTarget };
  };
  Chart.prototype.getResult = function () { return compute(this.options.data, this._opts()); };
  Chart.prototype._labels = function () { return assign({}, DEFAULT_LABELS, this.options.labels); };

  Chart.prototype._bindInteraction = function (svg, W, H) {
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
      hl.setAttribute("x", it.x - 1); hl.setAttribute("y", it.y - 1); hl.setAttribute("width", it.w + 2); hl.setAttribute("height", it.h + 2); hl.setAttribute("opacity", 1);
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

  Chart.prototype.redraw = function () {
    var o = this.options, L = this._labels();
    var res = this._res = compute(o.data, this._opts());
    var theme = resolveDlTheme(o.theme), f = makeFormatters(res.data, o.locale), el = this.element, st = el.style;
    var family = theme.fontFamily === "inherit" ? (root.getComputedStyle ? root.getComputedStyle(this.container).fontFamily : "sans-serif") : theme.fontFamily;
    var filled = theme.background && theme.background !== "transparent", bg = filled ? theme.background : "#ffffff";
    st.setProperty("--vdl-text", theme.text); st.setProperty("--vdl-muted", theme.mutedText);
    st.setProperty("--vdl-bg", filled ? theme.background : "transparent"); st.setProperty("--vdl-font", family);
    st.setProperty("--vdl-card", theme.cardBackground); st.setProperty("--vdl-card-muted", theme.cardMuted);
    st.setProperty("--vdl-tip-bg", theme.tooltipBackground); st.setProperty("--vdl-tip-text", theme.tooltipText);
    st.setProperty("--vdl-focus", theme.focus); st.setProperty("--vdl-bad", theme.wallText);
    el.classList.toggle("vdl-filled", !!filled);
    el.setAttribute("aria-label", o.ariaLabel || res.data.title || "Debt maturity ladder");
    var view = o.view;
    if (["ladder", "facilities", "coverage"].indexOf(view) < 0) { warn('Unknown view "' + view + '". The ladder is shown instead.'); view = "ladder"; }
    if (o.stackBy && ["type", "facility"].indexOf(o.stackBy) < 0) warn('Unknown stackBy "' + o.stackBy + '". Segments are stacked by type instead.');
    if (o.period && ["year", "quarter"].indexOf(o.period) < 0) warn('Unknown period "' + o.period + '". Fiscal years are used instead.');
    this._view = view;
    this._renderSummary(res, f, L, theme);
    var scope = ["As of " + niceDate(res.asOf), "debt " + f.value(res.total), "cash " + f.value(res.cash)];
    if (res.undrawnTotal > 0) scope.push("undrawn committed " + f.value(res.undrawnTotal));
    if (res.extensions) scope.push("extension options exercised");
    if (res.whatIfNames.length) scope.push("what-if: " + res.whatIfNames.join(", "));
    if (res.data.unit) scope.push(res.data.unit);
    this.scopeEl.textContent = scope.join(" · ");
    this._renderLegend(view, theme, L, res);
    var W = Math.max(280, Math.round(this.plotHost.clientWidth || el.clientWidth || 720));
    this._lastWidth = Math.round(el.clientWidth);
    var fs = theme.fontSize || 12;
    this.plotHost.textContent = "";
    var svg = svgEl("svg", { "class": "vdl-plot", role: "img", tabindex: 0, "font-family": family }, this.plotHost);
    svg.style.fontSize = fs + "px";
    var animate = this._animateNext && o.animate; this._animateNext = false;
    if (animate) svg.classList.add("vdl-animate");
    var ctx = { svg: svg, W: W, fs: fs, theme: theme, f: f, L: L, family: family, bg: bg, res: res, items: [], points: {} };
    var H = view === "facilities" ? this._drawFacilities(ctx) : view === "coverage" ? this._drawCoverage(ctx) : this._drawLadder(ctx);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("aria-label", (o.ariaLabel || res.data.title || "Debt maturity ladder") + ". " + this.describe());
    this._items = ctx.items; this._points = ctx.points;
    this._hlEl = svgEl("rect", { x: 0, y: 0, width: 0, height: 0, rx: 3, fill: "none", stroke: theme.focus, "stroke-width": 2, opacity: 0, "pointer-events": "none" }, svg);
    this._bindInteraction(svg, W, H);
    return this;
  };

  Chart.prototype._bucketLabel = function (i) { var b = this._res.buckets[i]; return b.later ? this._labels().later : b.label; };

  Chart.prototype._renderSummary = function (res, f, L, theme) {
    var box = this.summaryEl, o = this.options;
    box.textContent = "";
    box.style.display = o.summary === false ? "none" : "";
    if (o.summary === false) return;
    function stat(k, v, n2, colour) {
      var s = htmlEl("div", "vdl-stat", box);
      htmlEl("div", "k", s).textContent = k;
      var vv = htmlEl("div", "v", s); vv.textContent = v; if (colour) vv.style.color = colour;
      if (n2) htmlEl("div", "n", s).textContent = n2;
    }
    var pk = res.peak, share = res.totals[pk] / res.total, isWall = res.walls.length > 0;
    stat(L.wall, this._bucketLabel(pk) + " · " + f.percent(share, 0),
      f.value(res.totals[pk]) + (isWall ? " · " + res.walls.length + " period" + (res.walls.length === 1 ? "" : "s") + " above " + f.percent(res.wallShare, 0) : " · no period above " + f.percent(res.wallShare, 0)),
      isWall ? theme.wallText : null);
    var low = isFinite(res.w12.ratio) && res.w12.ratio < res.coverTarget;
    stat(L.due, f.value(res.w24.due), f.percent(res.w24.share, 0) + " of debt · " + (isFinite(res.w12.ratio) ? "12-month cover " + f.ratio(res.w12.ratio) + " (target " + f.ratio(res.coverTarget) + ")" : "nothing to refinance in 12 months"), low ? theme.wallText : null);
    if (res.actNow.length) stat(L.actBy, res.actNow.length + " now", res.actNow.slice(0, 2).map(function (x) { return x.name; }).join(", ") + (res.actNow.length > 2 ? " and " + (res.actNow.length - 2) + " more" : "") + " · " + this._leadText(), theme.actNowText);
    else if (res.nextAct) stat(L.actBy, niceDate(res.nextAct.actBy), res.nextAct.name + " · " + this._leadText(), res.nextAct.status === "soon" ? theme.soonText : null);
    else stat(L.actBy, "None", "no maturities to plan");
    var wamNote = res.whatIfNames.length ? f.years(res.wamContractual) + " before the what-if" : res.extensions ? f.years(res.wamContractual) + " contractual" : res.anyExtension ? f.years(res.wamExtended) + " with extension options" : "by repayment date";
    stat(L.wam, f.years(res.wam) + " " + L.years, wamNote);
    if (res.step24 != null) stat(L.stepUp, f.signed(res.step24), "a year if the next 24 months refinance at today's rates" + (res.avgCoupon != null ? " · coupon now " + f.rate(res.avgCoupon) : ""), res.step24 > 0 ? theme.wallText : null);
    Array.prototype.forEach.call(box.querySelectorAll(".vdl-stat .v"), function (v) {
      v.style.fontSize = "";
      var size = parseFloat(root.getComputedStyle ? root.getComputedStyle(v).fontSize : 19) || 19;
      while (v.scrollWidth > v.clientWidth && size > 12) { size -= 1; v.style.fontSize = size + "px"; }
    });
  };
  Chart.prototype._leadText = function () { var r = this._res; return "start " + r.leadMonths + " months before maturity"; };

  Chart.prototype._renderLegend = function (view, theme, L, res) {
    var box = this.legendEl;
    box.textContent = "";
    box.style.display = this.options.legend === false ? "none" : "";
    if (this.options.legend === false) return;
    function item(colour, text, cls) {
      var s = htmlEl("span", null, box), i = htmlEl("i", cls || null, s);
      if (cls === "vdl-dash") i.style.borderTopColor = colour; else i.style.background = colour;
      s.appendChild(document.createTextNode(text));
    }
    if (view === "coverage") {
      item(theme.uses, L.uses + " (excl. leases)", "vdl-tick"); item(theme.liquidity, L.sources, "vdl-tick"); item(theme.gap, L.gap);
      return;
    }
    res.types.forEach(function (t) { item(typeColour(theme, t, res.types), t); });
    if (view === "ladder") {
      if (res.liquidityNow > 0) item(theme.liquidity, L.liquidityNow, "vdl-dash");
      item(theme.wall, L.threshold + " " + Math.round(res.wallShare * 100) + "%", "vdl-dash");
      if (res.changed) item(theme.contractual, L.contractual, "vdl-dash");
    } else {
      item(theme.actNow, L.actNow, "vdl-diamond"); item(theme.soon, L.soon, "vdl-diamond"); item(theme.later, "Start later", "vdl-diamond");
      if (res.anyExtension) item(theme.contractual, L.extension, "vdl-dash");
    }
  };

  /** The ladder: stacked columns per period, by type or by facility. */
  Chart.prototype._drawLadder = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, self = this;
    var B = res.buckets, n = B.length, i, ph = W < 480 ? 230 : 290, top = fs * 2 + 8;
    var stackBy = this.options.stackBy === "facility" ? "facility" : "type";
    var maxBar = 0;
    for (i = 0; i < n; i++) maxBar = Math.max(maxBar, res.totals[i], res.changed ? res.contractualTotals[i] : 0);
    var threshold = res.wallShare * res.total, liq = res.liquidityNow;
    var showLiq = liq > 0 && liq <= Math.max(maxBar, threshold) * 1.8;
    var ax = niceTicks(0, Math.max(maxBar, threshold, showLiq ? liq : 0) * 1.08, 5);
    var tickW = 10;
    ax.ticks.forEach(function (t) { tickW = Math.max(tickW, textWidth(f.value(t, 0), fs - 1, 400, fam)); });
    var x0 = tickW + 10, x1 = W - 4, slot = (x1 - x0) / n, bw = Math.min(64, slot * 0.66), bottom = top + ph;
    var ys = function (v) { return top + (ax.hi - v) / (ax.hi - ax.lo || 1) * ph; };
    ax.ticks.forEach(function (t) {
      svgEl("line", { x1: x0, y1: ys(t), x2: x1, y2: ys(t), stroke: theme.grid, "stroke-width": 1 }, svg);
      label(svg, x0 - 6, ys(t) + fs * 0.36, f.value(t, 0), { "text-anchor": "end", fill: theme.axisText, "font-size": fs - 1 });
    });
    var g = svgEl("g", { "class": "vdl-bars vdl-grow" }, svg);
    var facOrder = res.schedule.slice().sort(function (a, b) { return res.types.indexOf(a.type) - res.types.indexOf(b.type) || a.effective - b.effective; });
    var biggest = {}, occupied = [];
    var lastLabelRight = -Infinity, labelEvery = 1;
    for (i = 0; i < n; i++) { var lw = textWidth(this._bucketLabel(i), fs - 1, 400, fam) + 6; if (lw > slot) labelEvery = Math.max(labelEvery, Math.ceil(lw / slot)); }
    for (i = 0; i < n; i++) {
      var cx = x0 + slot * i + slot / 2, bx = cx - bw / 2, acc = 0, isWall = res.walls.indexOf(i) >= 0;
      if (i === n - 1) svgEl("rect", { x: x0 + slot * i + 1, y: top, width: slot - 2, height: ph, fill: theme.grid, opacity: 0.45 }, svg);
      var segs = stackBy === "type" ? res.types.map(function (t) { return { key: t, type: t, v: res.byType[i][t] }; })
        : facOrder.map(function (fc, q) { return { key: fc.name, type: fc.type, v: res.byFacility[i][fc.name] || 0, q: q }; });
      segs.forEach(function (s) {
        if (!(s.v > 0)) return;
        var y1 = ys(acc + s.v), y2 = ys(acc), col = typeColour(theme, s.type, res.types);
        if (stackBy === "facility") { var same = facOrder.filter(function (x) { return x.type === s.type; }), r = same.map(function (x) { return x.name; }).indexOf(s.key); col = mix(col, c.bg, same.length > 1 ? (r % 3) * 0.22 : 0); }
        svgEl("rect", { x: bx, y: y1, width: bw, height: Math.max(0.5, y2 - y1), fill: col, stroke: c.bg, "stroke-width": stackBy === "facility" ? 1 : 0.5 }, g);
        if (stackBy === "facility" && (!biggest[s.key] || s.v > biggest[s.key].v)) biggest[s.key] = { v: s.v, x: cx, y: (y1 + y2) / 2 };
        acc += s.v;
      });
      if (res.changed && Math.abs(res.contractualTotals[i] - res.totals[i]) > 1e-9 && res.contractualTotals[i] > 0)
        svgEl("rect", { x: bx - 2, y: ys(res.contractualTotals[i]), width: bw + 4, height: ys(0) - ys(res.contractualTotals[i]), fill: "none", stroke: theme.contractual, "stroke-width": 1.5, "stroke-dasharray": "4 3" }, svg);
      if (res.totals[i] > 0) {
        var tTxt = f.value(res.totals[i], 0), tw = textWidth(tTxt, fs - 1, 600, fam);
        var topY = Math.min(ys(res.totals[i]), res.changed ? ys(res.contractualTotals[i]) : Infinity);
        if (tw <= slot - 2) { label(svg, cx, topY - 5, tTxt, { "text-anchor": "middle", fill: isWall ? theme.wallText : theme.text, "font-size": fs - 1, "font-weight": 600 }); occupied.push({ x: cx - tw / 2, y: topY - 5 - fs, w: tw, h: fs + 2 }); }
        if (isWall && slot > 14) { var my = topY - 5 - (tw <= slot - 2 ? fs + 2 : 0), mk = label(svg, cx, my, "▲", { "text-anchor": "middle", fill: theme.wallText, "font-size": fs - 2 }); occupied.push({ x: cx - fs / 2, y: my - fs, w: fs, h: fs + 2, marker: mk }); }
      }
      if (i % labelEvery === 0 || i === n - 1) {
        var bl = this._bucketLabel(i), bwid = textWidth(bl, fs - 1, 400, fam), lx = Math.max(cx, x0 + bwid / 2 + 1);
        if (lx - bwid / 2 > lastLabelRight + 4 && lx + bwid / 2 <= W) { label(svg, lx, bottom + fs + 4, bl, { "text-anchor": "middle", fill: isWall ? theme.wallText : theme.axisText, "font-size": fs - 1, "font-weight": isWall ? 600 : 400 }); lastLabelRight = lx + bwid / 2; }
      }
      c.items.push({ kind: "bucket", bucket: i, x: x0 + slot * i + 1, y: top, w: slot - 2, h: ph, px: cx, py: ys(res.totals[i]) });
      c.points["period:" + this._bucketLabel(i)] = { x: cx, y: Math.max(top + 10, ys(res.totals[i]) - fs * 2 - 6) };
    }
    Object.keys(biggest).forEach(function (k) { c.points["facility:" + k] = { x: biggest[k].x, y: biggest[k].y }; });
    svgEl("line", { x1: x0, y1: bottom, x2: x1, y2: bottom, stroke: theme.axis, "stroke-width": 1 }, svg);
    // Reference lines: wall threshold and liquidity now, labelled at the left inside the plot.
    var refs = [{ v: threshold, col: theme.wall, txt: L.threshold + " " + f.percent(res.wallShare, 0) + " · " + f.value(threshold, 0), tc: theme.wallText }];
    if (showLiq) refs.push({ v: liq, col: theme.liquidity, txt: L.liquidityNow + " " + f.value(liq, 0), tc: theme.text });
    refs.sort(function (a, b) { return b.v - a.v; });
    // Each reference label goes left or right, above or below its line, wherever it does not cover a column label.
    function over(a, o) { return a.x < o.x + o.w + 2 && a.x + a.w + 2 > o.x && a.y < o.y + o.h && a.y + a.h > o.y; }
    function hits(a, skipMarkers) { return occupied.some(function (o) { return !(skipMarkers && o.marker) && over(a, o); }); }
    refs.forEach(function (r) {
      var y = ys(r.v), txt = fit(r.txt, x1 - x0 - 10, fs - 1, 600, fam), tw = Math.min(textWidth(txt, fs - 1, 600, fam), x1 - x0 - 8);
      svgEl("line", { x1: x0, y1: y, x2: x1, y2: y, stroke: r.col, "stroke-width": 1.5, "stroke-dasharray": "6 4" }, svg);
      var cands = [[x0 + 3, y - 4], [x1 - tw - 9, y - 4], [x0 + 3, y + fs + 2], [x1 - tw - 9, y + fs + 2]], pickC = null;
      for (var sk = 1; sk < n; sk++) { var sx = x0 + slot * sk - (tw + 6) / 2; if (sx > x0 && sx + tw + 6 < x1) cands.push([sx, y - 4], [sx, y + fs + 2]); }
      // First a free place; failing that, a place that only covers wall markers (the red period label still marks the wall), which are then removed.
      for (var pass = 0; pass < 2 && !pickC; pass++)
        for (var q = 0; q < cands.length && !pickC; q++) { var box = { x: cands[q][0], y: cands[q][1] - fs + 1, w: tw + 6, h: fs + 3 }; if (!hits(box, pass === 1) && box.y >= top - fs) pickC = { x: cands[q][0], y: cands[q][1], box: box }; }
      if (!pickC) pickC = { x: x0 + 3, y: y - 4, box: { x: x0 + 3, y: y - 3 - fs, w: tw + 6, h: fs + 3 } };
      occupied = occupied.filter(function (o) { if (o.marker && over(pickC.box, o)) { o.marker.parentNode.removeChild(o.marker); return false; } return true; });
      svgEl("rect", { x: pickC.x, y: pickC.y - fs + 1, width: tw + 6, height: fs + 3, rx: 3, fill: c.bg, opacity: 0.85 }, svg);
      label(svg, pickC.x + 3, pickC.y, txt, { fill: r.tc, "font-size": fs - 1, "font-weight": 600 });
      occupied.push(pickC.box);
    });
    if (!showLiq && liq > 0) label(svg, x1, top - fs - 2, fit(L.liquidityNow + " " + f.value(liq, 0) + " (above the scale)", W * 0.6, fs - 1, 400, fam), { "text-anchor": "end", fill: theme.mutedText, "font-size": fs - 1 });
    var noteY = bottom + fs * 2 + 14;
    var notes = [];
    if (res.buckets[0].start < res.asOf) notes.push("The first " + (res.period === "quarter" ? "quarter" : "year") + " counts from " + niceDate(res.asOf) + " only");
    notes.push("“" + L.later + "” holds everything after " + this._bucketLabel(n - 2));
    label(svg, 0, noteY, fit(notes.join("; ") + ".", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1 });
    return noteY + 6;
  };

  /** Facilities: one row per facility on a time axis, with extension options and the date to start refinancing. */
  Chart.prototype._drawFacilities = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg;
    var rows = res.schedule, rh = 26, top = fs + 12, i;
    var nameW = 10, amtW = 10;
    rows.forEach(function (r) { nameW = Math.max(nameW, textWidth(r.name, fs, 600, fam)); amtW = Math.max(amtW, textWidth(f.value(r.amount, 0), fs - 1, 400, fam)); });
    nameW = Math.min(nameW + 10, W * (W < 480 ? 0.34 : 0.26)); amtW += 10;
    var x0 = nameW + 6, x1 = W - amtW - 6;
    var tMax = res.asOf;
    rows.forEach(function (r) { tMax = Math.max(tMax, r.effective, r.maturity, r.extension || 0); });
    tMax = Math.max(tMax, addMonths(res.asOf, 24));
    var y0 = new Date(res.asOf).getUTCFullYear(), y1 = new Date(tMax).getUTCFullYear() + 1, tEnd = Date.UTC(y1, 0, 1);
    var xs = function (t) { return x0 + (t - res.asOf) / (tEnd - res.asOf) * (x1 - x0); };
    var bottom = top + rows.length * rh;
    // Wall periods shaded behind the rows.
    res.walls.forEach(function (wi) {
      var b = res.buckets[wi], a = Math.max(xs(Math.max(b.start, res.asOf)), x0), z = Math.min(xs(Math.min(b.end, tEnd)), x1);
      if (z > a) svgEl("rect", { x: a, y: top - 4, width: z - a, height: bottom - top + 8, fill: theme.wall, opacity: 0.08 }, svg);
    });
    var step = Math.max(1, Math.ceil((y1 - y0) / Math.max(2, Math.floor((x1 - x0) / 46))));
    for (var yy = y0 + 1; yy <= y1; yy += step) {
      var gx = xs(Date.UTC(yy, 0, 1));
      if (gx < x0 + 8 || gx > x1 + 1) continue;
      svgEl("line", { x1: gx, y1: top - 4, x2: gx, y2: bottom + 2, stroke: theme.grid, "stroke-width": 1 }, svg);
      label(svg, gx, bottom + fs + 4, String(yy), { "text-anchor": "middle", fill: theme.axisText, "font-size": fs - 1 });
    }
    svgEl("line", { x1: x0, y1: top - 6, x2: x0, y2: bottom + 2, stroke: theme.today, "stroke-width": 1.5 }, svg);
    label(svg, x0, top - 8, L.today, { "text-anchor": "start", fill: theme.text, "font-size": fs - 1, "font-weight": 600 });
    label(svg, W - 2, top - 8, "Outstanding", { "text-anchor": "end", fill: theme.mutedText, "font-size": fs - 1 });
    var g = svgEl("g", { "class": "vdl-rows vdl-grow" }, svg);
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], y = top + i * rh, col = typeColour(theme, r.type, res.types), bh = 12, by = y + (rh - bh) / 2;
      label(svg, nameW, y + rh / 2 + fs * 0.36, fit(r.name, nameW - 4, fs, 600, fam), { "text-anchor": "end", fill: theme.text, "font-size": fs, "font-weight": 600 });
      var xe = Math.max(xs(r.effective), x0 + 2);
      svgEl("rect", { x: x0, y: by, width: xe - x0, height: bh, rx: 2, fill: col }, g);
      if (r.undrawn > 0 && r.limit > 0) svgEl("rect", { x: x0, y: by + bh * r.amount / r.limit, width: xe - x0, height: bh * r.undrawn / r.limit, rx: 2, fill: c.bg, opacity: 0.55 }, g);
      r.amort.forEach(function (a) { var ax2 = xs(a.t); if (ax2 > x0 + 1 && ax2 < xe - 1) svgEl("line", { x1: ax2, y1: by, x2: ax2, y2: by + bh, stroke: c.bg, "stroke-width": 1.5 }, g); });
      var other = r.whatIf ? r.maturity : res.extensions && r.extension ? r.maturity : r.extension;
      if (other && Math.abs(other - r.effective) > DAY) {
        var xa = xs(Math.min(other, r.effective)), xb = xs(Math.max(other, r.effective));
        if (other > r.effective) svgEl("rect", { x: xa, y: by, width: xb - xa, height: bh, rx: 2, fill: "none", stroke: theme.contractual, "stroke-width": 1.2, "stroke-dasharray": "3 2" }, g);
        else svgEl("line", { x1: xa, y1: by - 3, x2: xa, y2: by + bh + 3, stroke: theme.contractual, "stroke-width": 1.5, "stroke-dasharray": "2 2" }, g);
      }
      var stCol = r.status === "overdue" || r.status === "actNow" ? theme.actNow : r.status === "soon" ? theme.soon : r.status === "fine" ? theme.later : theme.contractual;
      var dx = Math.max(xs(r.actBy), x0), dy = y + rh / 2;
      svgEl("path", { d: "M " + dx + " " + (dy - 6) + " L " + (dx + 6) + " " + dy + " L " + dx + " " + (dy + 6) + " L " + (dx - 6) + " " + dy + " Z", fill: stCol, stroke: c.bg, "stroke-width": 1.5 }, g);
      label(svg, W - 2, y + rh / 2 + fs * 0.36, f.value(r.amount, 0), { "text-anchor": "end", fill: theme.text, "font-size": fs - 1 });
      c.items.push({ kind: "facility", name: r.name, x: 0, y: y + 1, w: W, h: rh - 2, px: xe, py: by });
      c.points["facility:" + r.name] = { x: Math.min(xe + 10, x1 - 4), y: dy };
    }
    var noteY = bottom + fs * 2 + 12;
    label(svg, 0, noteY, fit("Diamonds mark the date to start refinancing (" + res.leadMonths + " months before maturity); white ticks are amortisation dates.", W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1 });
    return noteY + 6;
  };

  /** Coverage: cumulative maturities against liquidity sources at each period end. */
  Chart.prototype._drawCoverage = function (c) {
    var res = c.res, theme = c.theme, f = c.f, L = c.L, fs = c.fs, fam = c.family, W = c.W, svg = c.svg, i;
    var cov = res.coverage, ph = W < 480 ? 220 : 270, top = fs * 2 + 10, bottom = top + ph;
    var start = { end: res.asOf, uses: 0, sources: res.cash + res.data.facilities.reduce(function (s, x) { return s + x.undrawn; }, 0) };
    var pts = [start].concat(cov);
    var maxV = 0;
    pts.forEach(function (p) { maxV = Math.max(maxV, p.uses, p.sources); });
    var ax = niceTicks(0, maxV * 1.08, 5), tickW = 10;
    ax.ticks.forEach(function (t) { tickW = Math.max(tickW, textWidth(f.value(t, 0), fs - 1, 400, fam)); });
    var x0 = tickW + 10, x1 = W - 8, tEnd = cov[cov.length - 1].end;
    var xs = function (t) { return x0 + (t - res.asOf) / (tEnd - res.asOf) * (x1 - x0); };
    var ys = function (v) { return top + (ax.hi - v) / (ax.hi - ax.lo || 1) * ph; };
    ax.ticks.forEach(function (t) {
      svgEl("line", { x1: x0, y1: ys(t), x2: x1, y2: ys(t), stroke: theme.grid, "stroke-width": 1 }, svg);
      label(svg, x0 - 6, ys(t) + fs * 0.36, f.value(t, 0), { "text-anchor": "end", fill: theme.axisText, "font-size": fs - 1 });
    });
    var g = svgEl("g", { "class": "vdl-cov vdl-grow" }, svg);
    for (i = 0; i < pts.length - 1; i++) {
      var p = pts[i], q = pts[i + 1], dp = p.uses - p.sources, dq = q.uses - q.sources;
      var P = [xs(p.end), ys(p.uses), ys(p.sources)], Q = [xs(q.end), ys(q.uses), ys(q.sources)], poly = null;
      if (dp > 0 && dq > 0) poly = [[P[0], P[1]], [Q[0], Q[1]], [Q[0], Q[2]], [P[0], P[2]]];
      else if (dp > 0 || dq > 0) {
        var t = dp / (dp - dq), cx = P[0] + (Q[0] - P[0]) * t, cy = P[2] + (Q[2] - P[2]) * t;
        poly = dp > 0 ? [[P[0], P[1]], [cx, cy], [P[0], P[2]]] : [[cx, cy], [Q[0], Q[1]], [Q[0], Q[2]]];
      }
      if (poly) svgEl("path", { d: "M " + poly.map(function (z) { return z[0].toFixed(1) + " " + z[1].toFixed(1); }).join(" L ") + " Z", fill: theme.gap, opacity: 0.22 }, g);
    }
    [12, 24].forEach(function (m) {
      var w = m === 12 ? res.w12 : res.w24, x = xs(w.end);
      if (x <= x0 || x >= x1) return;
      svgEl("line", { x1: x, y1: top - 4, x2: x, y2: bottom, stroke: theme.axis, "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
      var txt = m + " months: " + (isFinite(w.ratio) ? f.ratio(w.ratio) : "nothing due");
      var tx = Math.min(x + 4, x1 - textWidth(txt, fs - 1, 600, fam));
      label(svg, tx, top - 6 - (m === 24 ? 0 : fs + 2), txt, { fill: isFinite(w.ratio) && w.ratio < (m === 12 ? res.coverTarget : 1) ? theme.wallText : theme.text, "font-size": fs - 1, "font-weight": 600 });
    });
    function line(key, col) {
      var d = pts.map(function (p, k) { return (k ? "L " : "M ") + xs(p.end).toFixed(1) + " " + ys(p[key]).toFixed(1); }).join(" ");
      svgEl("path", { d: d, fill: "none", stroke: col, "stroke-width": 2.2, "class": "vdl-line" }, g);
      pts.forEach(function (p) { svgEl("circle", { cx: xs(p.end), cy: ys(p[key]), r: 3, fill: col }, g); });
    }
    line("sources", theme.liquidity); line("uses", theme.uses);
    svgEl("line", { x1: x0, y1: bottom, x2: x1, y2: bottom, stroke: theme.axis, "stroke-width": 1 }, svg);
    var lastRight = -Infinity;
    for (i = 0; i < cov.length; i++) {
      var b = res.buckets[i], bl = b.label, bw2 = textWidth(bl, fs - 1, 400, fam), mid = Math.max(xs((Math.max(b.start, res.asOf) + b.end) / 2), x0 + bw2 / 2 + 2);
      if (mid - bw2 / 2 > lastRight + 4 && mid + bw2 / 2 <= W) { label(svg, mid, bottom + fs + 4, bl, { "text-anchor": "middle", fill: res.firstGap === i ? theme.wallText : theme.axisText, "font-size": fs - 1 }); lastRight = mid + bw2 / 2; }
      var xe2 = xs(b.end), xa2 = xs(Math.max(b.start, res.asOf));
      c.items.push({ kind: "coverage", bucket: i, x: xa2, y: top, w: Math.max(4, xe2 - xa2), h: ph, px: xe2, py: ys(cov[i].uses) });
      c.points["period:" + bl] = { x: xe2, y: Math.max(top + 8, ys(Math.max(cov[i].uses, cov[i].sources)) - 14) };
    }
    var noteY = bottom + fs * 2 + 14;
    var nt = "Sources: cash" + (res.cashFlow ? ", " + f.value(res.cashFlow) + " free cash flow a year" : "") + " and undrawn committed lines that run past each date. No new borrowing assumed.";
    label(svg, 0, noteY, fit(nt, W, fs - 1, 400, fam), { fill: theme.mutedText, "font-size": fs - 1 });
    return noteY + 6;
  };

  Chart.prototype._drawNotes = function () {};

  Chart.prototype._tipLines = function (it) {
    var res = this._res, f = makeFormatters(res.data, this.options.locale), L = this._labels(), lines = [], self = this;
    if (it.kind === "bucket") {
      var i = it.bucket, tot = res.totals[i];
      lines.push(this._bucketLabel(i) + ": " + f.value(tot) + " (" + f.percent(tot / res.total, 1) + " of debt)");
      var parts = this.options.stackBy === "facility" ? Object.keys(res.byFacility[i]).map(function (k) { return [k, res.byFacility[i][k]]; }) : res.types.map(function (t) { return [t, res.byType[i][t]]; });
      parts.filter(function (p) { return p[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5).forEach(function (p) { lines.push(p[0] + " " + f.value(p[1])); });
      if (res.changed) lines.push(L.contractual + " " + f.value(res.contractualTotals[i]));
      if (res.stepByBucket && res.stepByBucket[i]) lines.push("Interest step-up " + f.signed(res.stepByBucket[i]) + " a year");
      if (res.walls.indexOf(i) >= 0) lines.push("Above the " + f.percent(res.wallShare, 0) + " wall threshold");
    } else if (it.kind === "facility") {
      var r = res.facilities.filter(function (x) { return x.name === it.name; })[0];
      lines.push(r.name + " · " + r.type);
      lines.push(f.value(r.amount) + (r.limit != null ? " drawn of " + f.value(r.limit) : "") + ", matures " + niceDate(r.effective) + (r.whatIf ? " (what-if)" : res.extensions && r.extension ? " (extended)" : ""));
      if (r.extension && !res.extensions) lines.push("Extension option to " + niceDate(r.extension));
      if (r.whatIf || (res.extensions && r.extension)) lines.push("Contractual maturity " + niceDate(r.maturity));
      if (r.status === "rolling") lines.push("Commercial paper: rolled over, backed by committed lines");
      else if (r.status === "amortising") lines.push("Runs off through scheduled repayments; no refinancing needed");
      else lines.push("Start by " + niceDate(r.actBy) + " · done by " + niceDate(r.deadline) + (r.status === "overdue" ? " (inside the deadline)" : r.status === "actNow" ? " (start now)" : ""));
      if (r.coupon != null) lines.push("Coupon " + f.rate(r.coupon) + (r.refiRate != null ? " → " + f.rate(r.refiRate) + " today, " + f.signed(r.stepUp) + " a year" : ""));
      if (r.amort.length) lines.push(r.amort.length + " amortisation payment" + (r.amort.length === 1 ? "" : "s") + ", " + f.value(r.bullet) + " at maturity");
    } else if (it.kind === "coverage") {
      var cv = res.coverage[it.bucket];
      lines.push("By end of " + res.buckets[it.bucket].label + " (" + niceDate(cv.end - DAY) + ")");
      lines.push(L.uses + " " + f.value(cv.uses));
      lines.push(L.sources + " " + f.value(cv.sources) + (cv.undrawn ? " (" + f.value(cv.undrawn) + " undrawn)" : ""));
      lines.push(cv.gap > 0 ? L.gap + " " + f.value(cv.gap) : "Headroom " + f.value(-cv.gap));
    }
    return lines;
  };

  Chart.prototype._detail = function (it) {
    var res = this._res;
    if (it.kind === "bucket") return { kind: "period", period: this._bucketLabel(it.bucket), total: res.totals[it.bucket], share: res.totals[it.bucket] / res.total,
      byType: assign({}, res.byType[it.bucket]), byFacility: assign({}, res.byFacility[it.bucket]), contractual: res.contractualTotals[it.bucket], wall: res.walls.indexOf(it.bucket) >= 0 };
    if (it.kind === "facility") {
      var r = res.facilities.filter(function (x) { return x.name === it.name; })[0];
      return { kind: "facility", name: r.name, type: r.type, amount: r.amount, limit: r.limit, maturity: iso(r.maturity), effective: iso(r.effective), extension: r.extension ? iso(r.extension) : null,
        actBy: iso(r.actBy), deadline: iso(r.deadline), status: r.status, coupon: r.coupon, refiRate: r.refiRate, stepUp: r.stepUp };
    }
    var cv = res.coverage[it.bucket];
    return { kind: "coverage", period: res.buckets[it.bucket].label, end: iso(cv.end), uses: cv.uses, sources: cv.sources, gap: cv.gap };
  };

  Chart.prototype.howToRead = function () {
    var v = this._view || this.options.view;
    if (v === "facilities") return "Each row is a facility, ordered by maturity; the bar runs from today to the maturity date, with amortisation dates as white ticks and a dashed outline for an extension option. The diamond marks when refinancing should start: red means now, amber within six months, green later. Shaded columns are refinancing walls.";
    if (v === "coverage") return "The orange line adds up the debt falling due by the end of each period; the dark line shows the liquidity available by then — cash, expected free cash flow and committed undrawn lines that run past that date. Where the orange line rises above the dark one, the red area is a funding gap that has to be refinanced in advance.";
    return "Each column is the debt falling due in a period, split by facility type or by facility. A column above the red dashed line holds more than the wall threshold of all debt — a refinancing wall. The dark dashed line is the liquidity available today; any column above it cannot be repaid from today's cash and committed lines.";
  };

  Chart.prototype.describe = function () {
    var o = this.options, res = this._res || compute(o.data, this._opts()), f = makeFormatters(res.data, o.locale), out = [];
    var pk = res.peak;
    out.push("Total debt of " + f.value(res.total) + " has a weighted average maturity of " + f.years(res.wam) + " years" + (res.anyExtension && !res.extensions ? " (" + f.years(res.wamExtended) + " with extension options)" : "") + ".");
    out.push(res.walls.length ? "The refinancing wall is " + this._bucketLabel(pk) + ", with " + f.value(res.totals[pk]) + " (" + f.percent(res.totals[pk] / res.total, 0) + " of debt) due" + (res.walls.length > 1 ? "; " + res.walls.length + " periods are above the " + f.percent(res.wallShare, 0) + " threshold" : "") + "."
      : "No period holds more than " + f.percent(res.wallShare, 0) + " of debt; the largest is " + this._bucketLabel(pk) + " with " + f.value(res.totals[pk]) + ".");
    out.push(f.value(res.w12.due) + " falls due in the next 12 months and " + f.value(res.w24.due) + " in 24 months" + (isFinite(res.w12.ratio) ? "; liquidity covers the next 12 months " + f.ratio(res.w12.ratio) + (res.w12.ratio < res.coverTarget ? ", below the " + f.ratio(res.coverTarget) + " target" : "") : "; apart from leases, nothing falls due in the next 12 months") + ".");
    if (res.firstGap != null) out.push("Without refinancing, cumulative maturities exceed liquidity from " + res.buckets[res.firstGap].label + " (gap " + f.value(res.coverage[res.firstGap].gap) + ").");
    if (res.actNow.length) out.push("Refinancing should already be under way for " + res.actNow.map(function (x) { return x.name + " (matures " + niceDate(x.effective) + ")"; }).join(", ") + ".");
    else if (res.nextAct) out.push("The next refinancing to start is " + res.nextAct.name + ", by " + niceDate(res.nextAct.actBy) + ".");
    if (res.step24 != null && Math.abs(res.step24) > 0) out.push("Refinancing the next 24 months' maturities at today's rates would change interest cost by " + f.signed(res.step24) + " a year.");
    return out.join(" ");
  };

  Chart.prototype.createTable = function () {
    var ex = this.getExportData(), wrap = htmlEl("div", "vdl-tables");
    ex.sheets.forEach(function (sh) {
      if (sh.name === "Notes") return;
      var tb = htmlEl("table", "vdl-table", wrap);
      htmlEl("caption", null, tb).textContent = sh.name;
      var hr = htmlEl("tr", null, htmlEl("thead", null, tb));
      sh.columns.forEach(function (c2) { var th = htmlEl("th", null, hr); th.scope = "col"; th.textContent = c2.label; });
      var body = htmlEl("tbody", null, tb);
      sh.text.forEach(function (r, i) {
        var tr = htmlEl("tr", sh.flag && sh.flag[i] ? "vdl-flag" : null, body);
        r.forEach(function (v, j) { var td = htmlEl(j ? "td" : "th", null, tr); if (!j) td.scope = "row"; td.textContent = v; });
      });
    });
    return wrap;
  };

  /* ======================================================================
     7. EXPORT AND NOTES
     ====================================================================== */
  Chart.prototype.getExportData = function () {
    var o = this.options, L = this._labels(), res = this._res || compute(o.data, this._opts()), f = makeFormatters(res.data, o.locale), self = this;
    var data = res.data, B = res.buckets;
    var unit = { prefix: data.prefix || "", suffix: data.suffix || "", decimals: data.decimals != null ? data.decimals : 0, negatives: data.negatives };
    var money = function (lbl) { return { label: lbl, type: "number", unit: unit }; };
    var dec = function (lbl, d) { return { label: lbl, type: "number", unit: { decimals: d } }; };
    var pct = function (lbl) { return { label: lbl, type: "percent", decimals: 2 }; };
    var txt = function (lbl) { return { label: lbl, type: "text" }; };
    var sheets = [], cum = 0;
    var lCols = [txt("Period")].concat(res.types.map(money)).concat([money("Total"), pct("Share of debt"), money("Cumulative")]).concat(res.changed ? [money("Contractual")] : []).concat(res.stepByBucket ? [money("Interest step-up a year")] : []);
    var lRows = B.map(function (b, i) {
      cum += res.totals[i];
      return [self._bucketLabel(i)].concat(res.types.map(function (t) { return res.byType[i][t]; })).concat([res.totals[i], res.totals[i] / res.total, cum]).concat(res.changed ? [res.contractualTotals[i]] : []).concat(res.stepByBucket ? [res.stepByBucket[i]] : []);
    });
    function textRow(cols, r) { return r.map(function (v, k) { var c2 = cols[k]; return v == null ? "–" : c2.type === "percent" ? f.percent(v, 2) : c2.type === "text" ? String(v) : c2.unit && c2.unit.prefix !== undefined ? f.value(v) : (+v).toFixed(c2.unit.decimals); }); }
    sheets.push({ name: "Ladder", columns: lCols, rows: lRows, text: lRows.map(function (r) { return textRow(lCols, r); }), flag: B.map(function (b, i) { return res.walls.indexOf(i) >= 0; }) });
    var fCols = [txt("Facility"), txt("Type"), money("Outstanding"), money("Limit"), money("Undrawn"), txt("Maturity"), txt("Extension to"), txt("Maturity used"), dec("Years left", 2),
      pct("Coupon"), pct("Refinance rate"), money("Interest step-up a year"), txt("Start refinancing by"), txt("Done by"), txt("Status"), txt("Rate type"), txt("Currency"), txt("Secured"), txt("Lender")];
    var stName = { overdue: "Inside deadline", actNow: "Start now", soon: "Within 6 months", fine: "Later", rolling: "Rolls over", amortising: "Amortises", undrawn: "Undrawn" };
    var fRows = res.schedule.map(function (r) { return [r.name, r.type, r.amount, r.limit, r.limit != null ? r.undrawn : null, iso(r.maturity), r.extension ? iso(r.extension) : "", iso(r.effective), r.yearsLeft,
      r.coupon, r.refiRate, r.stepUp, iso(r.actBy), iso(r.deadline), stName[r.status], r.rateType || "", r.currency || "", r.secured == null ? "" : r.secured ? "Yes" : "No", r.lender || ""]; });
    sheets.push({ name: "Facilities", columns: fCols, rows: fRows, text: fRows.map(function (r) { return textRow(fCols, r); }), flag: res.schedule.map(function (r) { return r.status === "overdue" || r.status === "actNow"; }) });
    var rCols = [txt("Facility"), txt("Type"), txt("Date"), money("Amount"), txt("Kind"), txt("Period")];
    var rRows = res.flows.map(function (x) { return [x.facility, x.type, iso(x.t), x.amount, x.kind === "maturity" ? "Maturity" : "Amortisation", self._bucketLabel(x.bucket)]; });
    sheets.push({ name: "Repayments", columns: rCols, rows: rRows, text: rRows.map(function (r) { return textRow(rCols, r); }) });
    var cCols = [txt("Period"), txt("Period end"), money("Cumulative maturities (excl. leases)"), money("Undrawn lines available"), money("Liquidity sources"), money("Gap")];
    var cRows = res.coverage.map(function (cv) { return [B[cv.bucket].label, iso(cv.end - DAY), cv.uses, cv.undrawn, cv.sources, cv.gap]; });
    sheets.push({ name: "Coverage", columns: cCols, rows: cRows, text: cRows.map(function (r) { return textRow(cCols, r); }), flag: res.coverage.map(function (cv) { return cv.gap > 1e-9; }) });
    var ind = [["Total debt", res.total, f.value(res.total)], ["Cash", res.cash, f.value(res.cash)], ["Undrawn committed lines", res.undrawnTotal, f.value(res.undrawnTotal)],
      ["Free cash flow a year", res.cashFlow, f.value(res.cashFlow)], ["Due in 12 months", res.w12.due, f.value(res.w12.due)], ["Due in 24 months", res.w24.due, f.value(res.w24.due)],
      ["Liquidity sources, 12 months", res.w12.sources, f.value(res.w12.sources)], ["Cover, 12 months", isFinite(res.w12.ratio) ? res.w12.ratio : null, f.ratio(res.w12.ratio)],
      ["Liquidity sources, 24 months", res.w24.sources, f.value(res.w24.sources)], ["Cover, 24 months", isFinite(res.w24.ratio) ? res.w24.ratio : null, f.ratio(res.w24.ratio)],
      ["Cover target, 12 months", res.coverTarget, f.ratio(res.coverTarget)], ["Peak period", null, this._bucketLabel(res.peak)], ["Peak share of debt", res.totals[res.peak] / res.total, f.percent(res.totals[res.peak] / res.total, 2)],
      ["Periods above the wall threshold", res.walls.length, res.walls.map(function (i) { return self._bucketLabel(i); }).join(", ")],
      ["Weighted average maturity (years)", res.wam, f.years(res.wam)], ["Weighted average maturity, contractual", res.wamContractual, f.years(res.wamContractual)],
      ["Weighted average maturity, with extensions", res.wamExtended, res.wamExtended == null ? "no extension options" : f.years(res.wamExtended)],
      ["Average coupon", res.avgCoupon, f.rate(res.avgCoupon)], ["Interest step-up a year, next 24 months", res.step24, res.step24 == null ? "no refinance rate" : f.signed(res.step24)],
      ["First funding gap", null, res.firstGap == null ? "none in the horizon" : res.buckets[res.firstGap].label]];
    sheets.push({ name: "Indicators", columns: [txt("Measure"), dec("Value", 4), txt("Shown as")], rows: ind.map(function (r) { return [r[0], r[1], r[2]]; }),
      text: ind.map(function (r) { return [r[0], r[1] == null ? "–" : (+r[1]).toFixed(4), r[2]]; }) });
    var notes = (o.annotations || []).map(function (a, i2) { return [String(i2 + 1), self._annotationLabel(a), a.text || ""]; });
    if (notes.length) sheets.push({ name: "Notes", columns: [txt("No."), txt("Where"), txt("Note")], rows: notes });
    return {
      title: data.title || "Debt maturity ladder", subtitle: data.subtitle || "", summary: this.describe(), library: "Veyforma Debt Maturity Ladder " + VERSION, sheets: sheets,
      meta: [["Unit", data.unit], ["As of", iso(res.asOf)], ["Company", data.company], ["Periods", (res.period === "quarter" ? "Calendar quarters" : "Fiscal years starting in month " + data.fiscalYearStart) + ", " + res.horizon + " shown before Later"],
        ["Maturities", res.whatIfNames.length ? "What-if for " + res.whatIfNames.join(", ") : res.extensions ? "Extension options exercised" : "Contractual"],
        ["Wall threshold", f.percent(res.wallShare, 0) + " of total debt in one period"], ["Refinancing lead time", res.leadMonths + " months to start, " + res.deadlineMonths + " months to finish before maturity"],
        ["Method", "Repayments from amortisation schedules and bullet maturities; weighted average maturity by amount and time to each repayment; liquidity cover as cash, free cash flow and undrawn committed lines running past the window, over maturities excluding leases; step-up as amount × (refinance rate − coupon)"],
        ["Data source", data.source]]
    };
  };
  Chart.prototype._annotationPoint = function (a) {
    var p = this._points || {};
    if (a.facility != null) return p["facility:" + String(a.facility)] || null;
    if (a.period != null) return p["period:" + String(a.period)] || null;
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
    if (it.kind === "facility") return { facility: it.name };
    if (it.kind === "bucket") return { period: this._bucketLabel(it.bucket) };
    if (it.kind === "coverage") return { period: this._res.buckets[it.bucket].label };
    return null;
  };
  Chart.prototype._annotationLabel = function (a) { return a.facility != null ? String(a.facility) : a.period != null ? String(a.period) : ""; };

  /* ======================================================================
     8. PUBLIC API
     ====================================================================== */
  root.VeyDebtLadder = {
    version: VERSION,
    /** Draws the chart inside a container element or CSS selector. */
    create: function (target, options) { return new Chart(target, options); },
    /** Works out every figure without drawing. opts: { period, horizon, extensions, whatIf, wallShare, leadMonths, deadlineMonths, coverTarget }. */
    compute: function (data, opts) { return compute(data, opts); },
    /** Adds whole months to a YYYY-MM-DD date and returns YYYY-MM-DD. */
    addMonths: function (date, months) { return iso(addMonths(parseDate(date, "date"), months)); },
    listThemes: function () { return Object.keys(THEMES); },
    getTheme: function (t) { return resolveDlTheme(t); },
    defaults: { options: DEFAULT_OPTIONS, labels: DEFAULT_LABELS, theme: BASE_THEME }
  };
})(typeof window !== "undefined" ? window : this);
