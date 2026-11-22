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
