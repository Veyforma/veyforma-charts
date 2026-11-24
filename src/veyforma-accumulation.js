// Exposure Accumulation Map – Veyforma Chart Library · https://www.veyforma.com/charts/exposure-accumulation-map
/*!
 * Veyforma Exposure Accumulation Map v1.0.0
 * Original work created for Veyforma. Contains no third-party code.
 * Released under the MIT License. Copyright (c) 2026 Veyforma.
 * https://github.com/veyforma/veyforma-charts
 *
 * For every point on the map it works out how much insured value one event of a
 * chosen radius would hit if it were centred there, and colours the map by that
 * amount as a share of the accumulation limit. The worst areas are found by search,
 * re-measured exactly with great-circle distances and called out by name.
 *
 * Load veyforma-toolkit.js as well to get the chart menu: full screen, print,
 * PNG, JPEG, SVG, PDF, CSV and Excel downloads, data table, copy and notes.
 *
 * File layout
 *   1. Settings and wording
 *   2. Helpers .......... colours, formatting, distances
 *   3. Projection ....... Albers equal-area conic for the lower 48
 *   4. Calculation ...... binning, focal sums, exact sums, hotspot search
 *   5. Contours ......... marching squares for the stepped bands
 *   6. Chart ............ layout, drawing, callouts, legend, controls
 *   7. Interaction ...... hover, click, keyboard
 *   8. Text, export and notes
 *   9. Public API ....... window.VeyAccumulation
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0", NS = "http://www.w3.org/2000/svg", PFX = "vac", instanceCount = 0;

  /* ======================================================================
     1. SETTINGS AND WORDING
     ====================================================================== */
  var BASE_THEME = {
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    background: "#f7f5f2", text: "#1f1d2b", mutedText: "#4b4b5c", faint: "#5f5f70", accent: "#8b7ae6", focus: "#5b47c9",
    sky0: "#f7f5f2", sky1: "#dde8f4", land: "#efe9df", coast: "#9fb4ca", border: "#7c7f8a", label: "#464954",
    under: ["#efebfc", "#6550cc"], over: ["#cf769f", "#fa8b6d"], darkInk: "#1f1147", limitLine: "#7a1f4b",
    pill: "#ffffff", pillInk: "#1f1d2b", tip: "#1f1d2b", tipInk: "#ffffff", marker: "#1f1d2b", halo: "#ffffff"
  };
  var THEMES = {
    veyforma: {},
    mono: { limitLine: "#111111", accent: "#4b5563", focus: "#111827", under: ["#f2f2f2", "#6b6b6b"], over: ["#4a4a4a", "#141414"] },
    "colour-safe": { limitLine: "#7a3300", accent: "#3b7cae", focus: "#1f5f94", under: ["#eaf2fa", "#2f6fae"], over: ["#f2b46b", "#c15f12"] },
    ocean: { limitLine: "#7a2a12", accent: "#0e7490", focus: "#0e7490", under: ["#e6f6f8", "#1b869c"], over: ["#f4a582", "#c4502f"] },
    forest: { limitLine: "#6e3405", accent: "#3f7d4e", focus: "#2f6b3e", under: ["#eef6ea", "#4c8a3f"], over: ["#e9b262", "#c0611b"] },
    corporate: { limitLine: "#7f1d1d", accent: "#1e3a8a", focus: "#1e3a8a", under: ["#eef1f8", "#4762a6"], over: ["#e7a1a1", "#bd3f3f"] },
    midnight: { background: "#141826", text: "#f3f4f6", mutedText: "#c9cbd3", faint: "#b4b7c2", accent: "#a99cf0", focus: "#c4b8ff", sky0: "#141826", sky1: "#1c2436",
      land: "#262c3c", coast: "#4b5d78", border: "#8a90a2", label: "#d3d6de", under: ["#2e2f52", "#8c6ad2"], over: ["#d4789f", "#fa8b6d"], darkInk: "#140f2b",
      pill: "#1f2433", pillInk: "#f3f4f6", tip: "#f3f4f6", tipInk: "#111827", marker: "#f3f4f6", halo: "#141826", limitLine: "#ffd6e4" }
  };
  var DEFAULT_OPTIONS = {
    theme: "veyforma",
    radius: 100, radii: [25, 50, 75, 100, 150, 200, 250],
    limit: null, limits: null,
    peril: "all",
    perils: [{ key: "all", label: "All perils", bit: 0 }, { key: "wind", label: "Windstorm", bit: 1 }, { key: "flood", label: "Flood", bit: 2 }, { key: "quake", label: "Earthquake", bit: 4 }],
    thresholds: [5, 10, 20, 30, 45, 60, 75, 87.5, 100, 112, 124],
    legendTicks: [75, 100],
    currency: "$", unit: "m",
    cell: 4, smooth: 1,
    callouts: 2, hotspots: 6,
    relief: true, stateLabels: true, bandLabels: true, controls: true, keyboard: true,
    compactBelow: 900,
    caption: true, toolbar: true, annotations: [],
    ariaLabel: null, labels: null
  };
  var DEFAULT_LABELS = {
    legendTitle: "Exposure vs. limit", within: "within", km: "km", overLimit: "over limit", belowLimit: "below limit", atLimit: "at the limit",
    selected: "Selected spot", near: "near", ofLimit: "of the", limitWord: "limit", eventHere: "Event centred here", radiusSuffix: "km radius", limitSuffix: "limit",
    note: "Illustrative sample data", perilAria: "Peril", radiusAria: "Event radius", limitAria: "Accumulation limit", locations: "locations",
    since: "vs", official: "official figure", noData: "No insured value for this peril"
  };

  /* ======================================================================
     2. HELPERS
     ====================================================================== */
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; } return t; }
  function warn(m) { if (typeof console !== "undefined") console.warn("VeyAccumulation: " + m); }
  function fail(m) { throw new Error("VeyAccumulation: " + m); }
  function svgEl(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function htmlEl(tag, cls, parent, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
  function hexRgb(h) { h = String(h).replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1"); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mixHex(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return "#" + A.map(function (v, i) { return ("0" + Math.round(v + (B[i] - v) * t).toString(16)).slice(-2); }).join(""); }
  function lum(h) { var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function bestInk(bg, dark, light) { return contrast(bg, dark) >= contrast(bg, light) ? dark : light; }
  function overlap(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }
  function fitText(s, n) { s = String(s == null ? "" : s); return s.length > n + 2 ? s.slice(0, n) + "…" : s; }
  function bandColours(theme, thresholds) {
    var under = thresholds.filter(function (v) { return v < 100; }).length, over = thresholds.length - under, out = [], i;
    for (i = 0; i < under; i++) out.push(mixHex(theme.under[0], theme.under[1], under < 2 ? 1 : Math.pow(i / (under - 1), 0.95)));
    for (i = 0; i < over; i++) out.push(mixHex(theme.over[0], theme.over[1], over < 2 ? 1 : i / (over - 1)));
    return out;
  }
  var R = Math.PI / 180, EARTH = 6371.0088;
  /** Great-circle distance in km (haversine, mean Earth radius 6,371.0088 km). */
  function hav(lo1, la1, lo2, la2) { var a = Math.sin((la2 - la1) * R / 2), b = Math.sin((lo2 - lo1) * R / 2); return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(a * a + Math.cos(la1 * R) * Math.cos(la2 * R) * b * b))); }
  /** Money in the data's unit ("m" = millions by default) shown compactly: $2.04bn, $540m, $8.5m, $420k. */
  function money(v, cur, unit, trim) {
    if (v == null || !isFinite(v)) return "–";
    var m = unit === "bn" ? v * 1000 : unit === "k" ? v / 1000 : unit === "" ? v / 1e6 : v, a = Math.abs(m), s = m < 0 ? "−" : "";
    if (a >= 1000) { var bn = (a / 1000).toFixed(2); if (trim) bn = bn.replace(/\.?0+$/, ""); return s + cur + bn + "bn"; }
    if (a >= 10) return s + cur + Math.round(a) + "m";
    if (a >= 1) { var one = a.toFixed(1); if (trim) one = one.replace(/\.0$/, ""); return s + cur + one + "m"; }
    if (a === 0) return cur + "0";
    return s + cur + Math.round(a * 1000) + "k";
  }
  function pctTxt(p) { return isFinite(p) ? Math.round(p) + "%" : "–"; }
  function signedMoney(v, cur, unit) { return v == null ? "–" : (v > 0 ? "▲ +" : v < 0 ? "▼ " : "") + money(v, cur, unit); }

  /* ======================================================================
     3. PROJECTION
     Albers equal-area conic (standard parallels 29.5° and 45.5°, central
     meridian 96° W, the usual choice for maps of the lower 48 states).
     Scale and translate come from the basemap so points line up with it; a
     basemap for another region can set parallels, rotate and center too.
     ====================================================================== */
  function albers(k, tx, ty, par, rotateDeg, centre) {
    par = par || [29.5, 45.5]; centre = centre || [-0.6, 38.7];
    var p0 = par[0] * R, p1 = par[1] * R, s0 = Math.sin(p0), n = (s0 + Math.sin(p1)) / 2, C = 1 + s0 * (2 * n - s0), r0 = Math.sqrt(C) / n, rot = (rotateDeg == null ? 96 : rotateDeg) * R;
    function raw(l, p) { var r = Math.sqrt(C - 2 * n * Math.sin(p)) / n; return [r * Math.sin(l * n), r0 - r * Math.cos(l * n)]; }
    var c = raw(centre[0] * R, centre[1] * R), dx = tx - c[0] * k, dy = ty + c[1] * k;
    return {
      fwd: function (lon, lat) { var q = raw(lon * R + rot, lat * R); return [q[0] * k + dx, dy - q[1] * k]; },
      inv: function (sx, sy) {
        var x = (sx - dx) / k, y = (dy - sy) / k, r0y = r0 - y, l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y);
        if (r0y * n < 0) l -= Math.PI * Math.sign(x) * Math.sign(r0y);
        return [(l / n - rot) / R, Math.asin(Math.max(-1, Math.min(1, (C - (x * x + r0y * r0y) * n * n) / (2 * n)))) / R];
      }
    };
  }

  function projOf(bm) { return albers(bm.scale, bm.translate[0], bm.translate[1], bm.parallels, bm.rotate, bm.center); }

  /* ======================================================================
     4. CALCULATION
     ====================================================================== */
  var dataCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  /** Reads locations once per array ([lon, lat, value, perilBits] or {lon, lat, value, perils}) and projects them. */
  function prepare(locations, basemap, perils) {
    if (!Array.isArray(locations)) fail("data.locations must be an array.");
    var key = dataCache && locations, hit = key && dataCache.get(key);
    if (hit && hit.basemap === basemap) return hit;
    var bits = {}; perils.forEach(function (p) { bits[p.key] = p.bit || 0; });
    var n = locations.length, lon = new Float64Array(n), lat = new Float64Array(n), val = new Float64Array(n), mask = new Uint8Array(n), px = new Float64Array(n), py = new Float64Array(n), cosl = new Float64Array(n), bad = 0;
    var P = projOf(basemap);
    for (var i = 0; i < n; i++) {
      var d = locations[i], a, b, v, m = 0;
      if (Array.isArray(d)) { a = d[0] == null ? NaN : +d[0]; b = d[1] == null ? NaN : +d[1]; v = d[2] == null ? NaN : +d[2]; m = d[3] | 0; }
      else if (d) { a = d.lon == null ? NaN : +d.lon; b = d.lat == null ? NaN : +d.lat; v = d.value == null ? NaN : +d.value; if (Array.isArray(d.perils)) d.perils.forEach(function (k) { m |= bits[k] || 0; }); else m = d.perils | 0; }
      if (!isFinite(a) || !isFinite(b) || !isFinite(v) || v < 0 || Math.abs(b) > 90 || Math.abs(a) > 180) { bad++; a = 0; b = 0; v = 0; }
      lon[i] = a; lat[i] = b; val[i] = v; mask[i] = m; cosl[i] = Math.cos(b * R);
      if (v > 0) { var q = P.fwd(a, b); px[i] = q[0]; py[i] = q[1]; } else { px[i] = -1e9; py[i] = -1e9; }
    }
    if (bad) warn(bad + " location(s) had a missing or negative value or an impossible position and were ignored.");
    var out = { lon: lon, lat: lat, val: val, mask: mask, px: px, py: py, cosl: cosl, n: n, bad: bad, basemap: basemap, P: P };
    if (key) dataCache.set(key, out);
    return out;
  }

  /** Works out the accumulation surface and the worst areas. Uses no DOM, so it runs in Node too. */
  function compute(data, options) {
    if (!data || !data.basemap) fail("data.basemap is required (load veyforma-accumulation-usa.js and pass VeyAccumulationMaps.usa).");
    var o = assign({}, DEFAULT_OPTIONS, options || {}), bm = data.basemap;
    if (!(o.limit > 0)) o.limit = data.limit > 0 ? data.limit : 1500;
    if (!(o.radius > 0)) fail("radius must be a positive number of km.");
    var L = prepare(data.locations || [], bm, o.perils), P = L.P, cell = o.cell, ext = bm.extent || [[0, 0], [bm.W, bm.H]];
    var x0 = ext[0][0], y0 = ext[0][1], nx = Math.ceil((ext[1][0] - x0) / cell) + 1, ny = Math.ceil((ext[1][1] - y0) / cell) + 1, nc = nx * ny;
    var peril = o.perils.filter(function (p) { return p.key === o.peril; })[0] || o.perils[0], bit = peril.bit || 0;
    var bins = new Float64Array(nc), count = new Int32Array(nc), cellOf = new Int32Array(L.n), total = 0, used = 0, outside = 0, i, j;
    for (i = 0; i < L.n; i++) {
      cellOf[i] = -1;
      if (!(L.val[i] > 0) || (bit && !(L.mask[i] & bit))) continue;
      var ci = Math.floor((L.px[i] - x0) / cell), cj = Math.floor((L.py[i] - y0) / cell);
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) { outside++; continue; }
      cellOf[i] = cj * nx + ci; bins[cellOf[i]] += L.val[i]; count[cellOf[i]]++; total += L.val[i]; used++;
    }
    var start = new Int32Array(nc + 1); for (i = 0; i < nc; i++) start[i + 1] = start[i] + count[i];
    var fillAt = start.slice(0, nc), idx = new Int32Array(used); for (i = 0; i < L.n; i++) if (cellOf[i] >= 0) idx[fillAt[cellOf[i]]++] = i;
    // km per screen unit along x and y for each row, measured through the projection at the middle of the map
    var kx = new Float64Array(ny), ky = new Float64Array(ny), cxm = (ext[0][0] + ext[1][0]) / 2;
    for (j = 0; j < ny; j++) { var yy = y0 + (j + 0.5) * cell, a0 = P.inv(cxm, yy), a1 = P.inv(cxm + 1, yy), a2 = P.inv(cxm, yy + 1); kx[j] = hav(a0[0], a0[1], a1[0], a1[1]); ky[j] = hav(a0[0], a0[1], a2[0], a2[1]); }
    // focal sum: value within the radius of every cell centre, from row prefix sums over each row's elliptical kernel
    var W1 = nx + 1, pre = new Float64Array(ny * W1);
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) pre[j * W1 + i + 1] = pre[j * W1 + i] + bins[j * nx + i];
    var S = new Float64Array(nc), r = o.radius;
    for (j = 0; j < ny; j++) {
      var span = Math.floor(r / (ky[j] * cell)), offs = [], wid = [];
      for (var d = -span; d <= span; d++) { var jj = j + d; if (jj < 0 || jj >= ny) continue; var t = 1 - Math.pow(d * cell * ky[jj] / r, 2); offs.push(jj * W1); wid.push(t <= 0 ? 0 : Math.floor(Math.sqrt(t) * r / (kx[jj] * cell))); }
      for (i = 0; i < nx; i++) { var s = 0; for (var h = 0; h < offs.length; h++) { var w = wid[h], aa = i - w < 0 ? 0 : i - w, bb = i + w >= nx ? nx - 1 : i + w; s += pre[offs[h] + bb + 1] - pre[offs[h] + aa]; } S[j * nx + i] = s; }
    }
    var pct = new Float64Array(nc); for (i = 0; i < nc; i++) pct[i] = S[i] / o.limit * 100;
    var model = { opts: o, data: data, P: P, L: L, x0: x0, y0: y0, nx: nx, ny: ny, cell: cell, S: S, pct: pct, kx: kx, ky: ky, start: start, idx: idx, bit: bit, peril: peril,
      total: total, used: used, outside: outside, limit: o.limit, radius: r };
    model.src = { lon: L.lon, lat: L.lat, val: L.val, cosl: L.cosl, cnt: null, start: start, idx: idx };
    if (used * Math.pow(Math.max(1, r / 100), 2) > (o.exactSearchBelow || 50000)) { L.micro = L.micro || {}; var mk = bit + ':' + cell; model.search = L.micro[mk] || (L.micro[mk] = microCells(model)); } else model.search = model.src;
    model.sumAt = function (lon, lat, rad) { return sumAt(model, lon, lat, rad); };
    model.hotspots = o._noHotspots ? [] : findHotspots(model, data.areas || [], Math.max(o.callouts, o.hotspots));
    model.maxPct = model.hotspots.length ? model.hotspots[0].sum / o.limit * 100 : 0;
    return model;
  }

  /** Exact insured value within the radius of a point: great-circle distance to every location in the nearby cells. */
  function sumAt(m, lon, lat, rad) { return sumSrc(m, m.src, lon, lat, rad); }
  function sumSrc(m, S, lon, lat, rad) {
    var r = rad || m.opts.radius, q = m.P.fwd(lon, lat), ci = Math.floor((q[0] - m.x0) / m.cell), cj = Math.floor((q[1] - m.y0) / m.cell);
    var row = Math.max(0, Math.min(m.ny - 1, cj)), wx = Math.ceil(r / (Math.min(m.kx[row], m.kx[Math.max(0, row - 1)]) * m.cell) * 1.1) + 1, wy = Math.ceil(r / (m.ky[row] * m.cell) * 1.1) + 1;
    var s = 0, n = 0, big = 0, bigI = -1, wlo = 0, wla = 0, cl = Math.cos(lat * R), dLat = r / 111.0 * 1.02, sinH = Math.sin(r / (2 * EARTH)), lim = sinH * sinH;
    var LON = S.lon, LAT = S.lat, VAL = S.val, COS = S.cosl, CNT = S.cnt, ST = S.start, IX = S.idx;
    for (var j = Math.max(0, cj - wy); j <= Math.min(m.ny - 1, cj + wy); j++) for (var i = Math.max(0, ci - wx); i <= Math.min(m.nx - 1, ci + wx); i++) {
      var c = j * m.nx + i;
      for (var t = ST[c]; t < ST[c + 1]; t++) {
        var k = IX[t], dl = LAT[k] - lat; if (dl > dLat || dl < -dLat) continue;
        var a = Math.sin(dl * R / 2), b = Math.sin((LON[k] - lon) * R / 2), hv = a * a + cl * COS[k] * b * b;
        if (hv <= lim) { var v = VAL[k]; s += v; n += CNT ? CNT[k] : 1; wlo += v * LON[k]; wla += v * LAT[k]; if (v > big) { big = v; bigI = k; } }
      }
    }
    return { sum: s, n: n, largest: big, largestIndex: bigI, cLon: s > 0 ? wlo / s : lon, cLat: s > 0 ? wla / s : lat };
  }
  /** Value-weighted micro-cells (one map unit, about 4 km) used to search large books quickly; reported figures are re-measured exactly. */
  function microCells(m) {
    var L = m.L, src = m.src, nc = m.nx * m.ny, sub = Math.max(1, Math.round(m.cell)), mnx = m.nx * sub, mny = m.ny * sub, idOf = new Int32Array(mnx * mny).fill(-1);
    var cap = Math.min(m.used, mnx * mny), lon = new Float64Array(cap), lat = new Float64Array(cap), val = new Float64Array(cap), cnt = new Int32Array(cap), cellOf = new Int32Array(cap), n = 0;
    for (var c = 0; c < nc; c++) for (var t = src.start[c]; t < src.start[c + 1]; t++) {
      var k = src.idx[t], mi = Math.min(mnx - 1, Math.floor((L.px[k] - m.x0) * sub / m.cell)), mj = Math.min(mny - 1, Math.floor((L.py[k] - m.y0) * sub / m.cell)), key = mj * mnx + mi, id = idOf[key];
      if (id < 0) { id = idOf[key] = n++; cellOf[id] = c; }
      var v = L.val[k]; lon[id] += L.lon[k] * v; lat[id] += L.lat[k] * v; val[id] += v; cnt[id]++;
    }
    var cosl = new Float64Array(n), per = new Int32Array(nc), i;
    for (i = 0; i < n; i++) { lon[i] /= val[i]; lat[i] /= val[i]; cosl[i] = Math.cos(lat[i] * R); per[cellOf[i]]++; }
    var start = new Int32Array(nc + 1); for (c = 0; c < nc; c++) start[c + 1] = start[c] + per[c];
    var fill = start.slice(0, nc), idx = new Int32Array(n); for (i = 0; i < n; i++) idx[fill[cellOf[i]]++] = i;
    return { lon: lon.subarray(0, n), lat: lat.subarray(0, n), val: val.subarray(0, n), cosl: cosl, cnt: cnt.subarray(0, n), start: start, idx: idx };
  }


  function nearestArea(areas, lon, lat) {
    var best = null, bd = Infinity; for (var i = 0; i < areas.length; i++) { var d = hav(lon, lat, areas[i][1], areas[i][2]); if (d < bd) { bd = d; best = areas[i][0]; } }
    return { name: best, km: bd };
  }

  /** Worst areas: highest cells first, at least two radii apart, each re-measured exactly on a finer grid around the cell. */
  function findHotspots(m, areas, want) {
    var o = m.opts, order = [], i;
    for (i = 0; i < m.S.length; i++) if (m.S[i] > 0) order.push(i);
    order.sort(function (a, b) { return m.S[b] - m.S[a] || a - b; });
    var out = [], gap = Math.max(250, o.radius * 2), rejected = [], climbs = 0;
    for (var t = 0; t < order.length && out.length < want && climbs < 14; t++) {
      var c = order[t], cx = m.x0 + (c % m.nx + 0.5) * m.cell, cy = m.y0 + (Math.floor(c / m.nx) + 0.5) * m.cell, ll = m.P.inv(cx, cy);
      if (out.some(function (h) { return hav(h.lon, h.lat, ll[0], ll[1]) < gap; })) continue;
      if (rejected.some(function (rj) { return hav(rj[0], rj[1], ll[0], ll[1]) < gap; })) continue;
      climbs++;
      // exact sums on a half-cell grid around the cell, then a hill-climb from the best few starts
      var starts = [], step = m.cell / 2;
      var big = m.search !== m.src, span = big ? 2 : 3, nStart = big ? 3 : 8;
      for (var a = -span; a <= span; a++) for (var b = -span; b <= span; b++) { var p = m.P.inv(cx + a * step, cy + b * step), r = sumSrc(m, m.search, p[0], p[1]); starts.push(assign({ lon: p[0], lat: p[1] }, r)); }
      starts.sort(function (u, v) { return v.sum - u.sum; });
      var best = null;
      for (var si = 0; si < Math.min(nStart, starts.length); si++) { var hc = climb(m, shift(m, climb(m, shift(m, starts[si])))); if (!best || hc.sum > best.sum + 1e-9) best = hc; }
      if (big) best = assign({ lon: best.lon, lat: best.lat }, sumAt(m, best.lon, best.lat));   // exact figure at the chosen centre
      if (!(best.sum > 0)) continue;
      if (out.some(function (h) { return hav(h.lon, h.lat, best.lon, best.lat) < gap; })) { rejected.push(ll); continue; }   // climbed into an area already listed
      var q = m.P.fwd(best.lon, best.lat), na = nearestArea(areas, best.lon, best.lat);
      out.push(assign(best, { x: q[0], y: q[1], name: na.name || ("Area " + (out.length + 1)), areaKm: na.km, pct: best.sum / o.limit * 100 }));
    }
    out.sort(function (a, b) { return b.sum - a.sum; });
    return out;
  }

  /** Moves the circle to the value-weighted centre of what it covers while that adds value (a flat-kernel mean shift). */
  function shift(m, cur) {
    for (var it = 0; it < 25; it++) { var r = sumSrc(m, m.search, cur.cLon, cur.cLat); if (!(r.sum > cur.sum + 1e-9)) break; cur = assign({ lon: cur.cLon, lat: cur.cLat }, r); }
    return cur;
  }
  /** Pattern search with exact sums: moves to the best of eight neighbours, halving the step down to about 0.2 km. */
  function climb(m, start) {
    var cur = start, q = m.P.fwd(cur.lon, cur.lat), x = q[0], y = q[1], j0 = Math.max(0, Math.min(m.ny - 1, Math.floor((y - m.y0) / m.cell))), rpx = m.radius / ((m.kx[j0] + m.ky[j0]) / 2), st = Math.max(m.cell / 2, rpx / 6), stop = Math.min(0.04, rpx / 400), guard = 0, D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (st > stop && guard++ < 400) {
      var bestN = null;
      for (var k = 0; k < 8; k++) { var p = m.P.inv(x + D[k][0] * st, y + D[k][1] * st), r = sumSrc(m, m.search, p[0], p[1]); if (r.sum > (bestN ? bestN.sum : cur.sum) + 1e-9) bestN = assign({ lon: p[0], lat: p[1], x: x + D[k][0] * st, y: y + D[k][1] * st }, r); }
      if (bestN) { cur = bestN; x = bestN.x; y = bestN.y; } else st /= 2;
    }
    return cur;
  }

  /* ======================================================================
     5. CONTOURS
     Marching squares, written for Veyforma. Segments keep the inside on
     their left, so they join head to tail into closed rings; the grid is
     padded with -Infinity so every ring closes. Filled with even-odd.
     ====================================================================== */
  var CASES = [[], [["B", "L"]], [["R", "B"]], [["R", "L"]], [["T", "R"]], [["T", "R"], ["B", "L"]], [["T", "B"]], [["T", "L"]],
    [["L", "T"]], [["B", "T"]], [["L", "T"], ["R", "B"]], [["R", "T"]], [["L", "R"]], [["B", "R"]], [["L", "B"]], []];
  function contourPath(v, nx, ny, thr, toX, toY) {
    var W = nx + 2, H = ny + 2, segs = {};
    function val(i, j) { return v[j * W + i]; }
    function frac(a, b) { var f = (thr - a) / (b - a); return !isFinite(f) ? 0.5 : f < 0 ? 0 : f > 1 ? 1 : f; }
    function pt(e, i, j) {
      if (e === "T") return [(j * (W + 1) + i) * 2, i + frac(val(i, j), val(i + 1, j)), j];
      if (e === "B") return [((j + 1) * (W + 1) + i) * 2, i + frac(val(i, j + 1), val(i + 1, j + 1)), j + 1];
      if (e === "L") return [(j * (W + 1) + i) * 2 + 1, i, j + frac(val(i, j), val(i, j + 1))];
      return [(j * (W + 1) + i + 1) * 2 + 1, i + 1, j + frac(val(i + 1, j), val(i + 1, j + 1))];
    }
    for (var j = 0; j < H - 1; j++) for (var i = 0; i < W - 1; i++) {
      var c = (val(i, j) >= thr ? 8 : 0) | (val(i + 1, j) >= thr ? 4 : 0) | (val(i + 1, j + 1) >= thr ? 2 : 0) | (val(i, j + 1) >= thr ? 1 : 0), list = CASES[c];
      for (var s = 0; s < list.length; s++) { var p = pt(list[s][0], i, j), q = pt(list[s][1], i, j); segs[p[0]] = { a: p, b: q, used: false }; }
    }
    var out = [];
    for (var k in segs) {
      var sg = segs[k]; if (sg.used) continue;
      var ring = [], cur = sg, guard = 0;
      while (cur && !cur.used && guard++ < 1e7) { cur.used = true; ring.push(cur.a); cur = segs[cur.b[0]]; }
      if (ring.length < 3) continue;
      out.push("M" + ring.map(function (p) { return (Math.round(toX(p[1] - 1) * 10) / 10) + "," + (Math.round(toY(p[2] - 1) * 10) / 10); }).join("L") + "Z");
    }
    return out.join("");
  }
  /** Gaussian smoothing for display only; figures always come from the exact sums. */
  function blurGrid(src, nx, ny, sigma) {
    if (!sigma) return src;
    var rad = Math.ceil(sigma * 3), ker = [], sum = 0, i, j, t, s;
    for (t = -rad; t <= rad; t++) { var w = Math.exp(-t * t / (2 * sigma * sigma)); ker.push(w); sum += w; }
    for (t = 0; t < ker.length; t++) ker[t] /= sum;
    var tmp = new Float64Array(nx * ny), out = new Float64Array(nx * ny);
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { s = 0; for (t = -rad; t <= rad; t++) { var ii = i + t < 0 ? 0 : i + t >= nx ? nx - 1 : i + t; s += src[j * nx + ii] * ker[t + rad]; } tmp[j * nx + i] = s; }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { s = 0; for (t = -rad; t <= rad; t++) { var jj = j + t < 0 ? 0 : j + t >= ny ? ny - 1 : j + t; s += tmp[jj * nx + i] * ker[t + rad]; } out[j * nx + i] = s; }
    return out;
  }

  /* ======================================================================
     6. CHART
     ====================================================================== */
  function injectStyles() {
    if (document.getElementById("vac-styles")) return;
    var css = ".vac{position:relative;width:100%;line-height:1.35;-webkit-tap-highlight-color:transparent}" +
      ".vac-plot{position:relative;width:100%}.vac-plot svg{display:block;width:100%;height:auto;touch-action:manipulation}" +
      ".vac-plot svg:focus{outline:none}.vac-plot svg:focus-visible{outline:3px solid var(--vac-focus);outline-offset:-3px}" +
      ".vac-head{display:none;margin:0 0 8px}.vac-compact .vac-head{display:block}.vac-head-t{font-weight:800;font-size:20px;line-height:1.2}.vac-head-s{font-size:14px;margin-top:2px}" +
      ".vac-controls{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;border-radius:999px;white-space:nowrap;z-index:3;box-shadow:0 8px 24px rgba(31,29,43,.16)}" +
      ".vac-compact .vac-controls{position:static;transform:none;margin:10px 0 0;flex-wrap:wrap;white-space:normal;border-radius:12px;box-shadow:none;border:1px solid rgba(127,127,140,.35);justify-content:flex-start}" +
      ".vac-sel{position:relative;display:inline-flex;align-items:center;min-height:36px}" +
      ".vac-sel select{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer;padding:4px 0}" +
      ".vac-sel select:focus-visible{outline:2px solid var(--vac-focus);outline-offset:3px;border-radius:4px}" +
      ".vac-sel select option{color:#111827;background:#ffffff}" +
      ".vac-chev{display:inline-flex;align-items:center;pointer-events:none}" +
      ".vac-sep{width:1.5px;align-self:stretch;margin:2px 0;opacity:.45}.vac-compact .vac-sep{display:none}" +
      ".vac-tip{position:absolute;pointer-events:none;display:none;z-index:8;padding:9px 12px;border-radius:8px;font-size:13px;line-height:1.45;white-space:nowrap;box-shadow:0 6px 18px rgba(17,24,39,.18)}" +
      ".vac-tip.vac-on{display:block}.vac-tip-arrow{position:absolute;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent}" +
      ".vac-cards{display:none;margin:10px 0 0;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}.vac-compact .vac-cards{display:grid}" +
      ".vac-card{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid rgba(127,127,140,.3);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:44px}" +
      ".vac-card:focus-visible{outline:2px solid var(--vac-focus);outline-offset:2px}.vac-card-body b{display:block;font-size:15px}.vac-card-body span{display:block;font-size:13px}" +
      ".vac-badge{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:700}" +
      ".vac-hlegend{display:none;margin:10px 0 0;font-size:12px}.vac-compact .vac-hlegend{display:block}.vac-hlegend-t{font-weight:700;margin-bottom:4px;font-size:13px}" +
      ".vac-hbar{display:flex;height:14px;border-radius:3px;overflow:hidden}.vac-hbar i{flex:1}.vac-hticks{position:relative;height:16px;margin-top:2px}.vac-hticks span{position:absolute;transform:translateX(-50%);white-space:nowrap}" +
      ".vac-table{border-collapse:collapse;font-size:12.5px;width:100%}.vac-table caption{text-align:left;font-weight:700;padding:0 0 6px}" +
      ".vac-table th,.vac-table td{padding:5px 8px;border-bottom:1px solid rgba(127,127,140,.25);text-align:right;white-space:nowrap}.vac-table th:first-child,.vac-table td:first-child{text-align:left}" +
      ".vac-table thead th{font-weight:600}.vac-table tr.vac-flag th,.vac-table tr.vac-flag td{font-weight:700}" +
      ".vac-sr{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important}";
    var st = document.createElement("style"); st.id = "vac-styles"; st.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(st);
  }

  function resolveTheme(t, thresholds) {
    var th = assign({}, BASE_THEME, typeof t === "object" && t ? (t.extends ? assign({}, THEMES[t.extends] || {}, t) : t) : (THEMES[t] || {}));
    th.bands = Array.isArray(th.bands) && th.bands.length === thresholds.length ? th.bands : bandColours(th, thresholds);
    return th;
  }

  function Chart(target, options) {
    var container = typeof target === "string" ? document.querySelector(target) : target;
    if (!container || container.nodeType !== 1) fail("container not found (" + target + ").");
    if (!options || !options.data) fail("options.data is required.");
    if (!options.data.basemap) fail("data.basemap is required (load veyforma-accumulation-usa.js and pass VeyAccumulationMaps.usa).");
    injectStyles();
    this.id = ++instanceCount;
    this.container = container;
    this.options = assign({}, DEFAULT_OPTIONS, options);
    if (!(this.options.limit > 0)) this.options.limit = options.data.limit > 0 ? options.data.limit : 1500;
    if (!this.options.limits) this.options.limits = defaultLimits(this.options.limit);
    if (this.options.radii.indexOf(this.options.radius) < 0) this.options.radii = this.options.radii.concat([this.options.radius]).sort(function (a, b) { return a - b; });
    this.element = htmlEl("div", PFX);
    this.element.setAttribute("role", "figure");
    this.headEl = htmlEl("div", PFX + "-head", this.element);
    this.headT = htmlEl("div", PFX + "-head-t", this.headEl); this.headS = htmlEl("div", PFX + "-head-s", this.headEl);
    this.plotHost = htmlEl("div", PFX + "-plot", this.element);
    this.svg = svgEl("svg", { role: "img", tabindex: "0" }, this.plotHost);
    this.cardsEl = htmlEl("div", PFX + "-cards", this.element);
    this.hLegendEl = htmlEl("div", PFX + "-hlegend", this.element);
    this.tipEl = htmlEl("div", PFX + "-tip", this.element); this.tipEl.setAttribute("role", "tooltip");
    this.tipArrow = htmlEl("div", PFX + "-tip-arrow", this.tipEl); this.tipText = htmlEl("div", null, this.tipEl);
    this.liveEl = htmlEl("div", PFX + "-sr", this.element); this.liveEl.setAttribute("aria-live", "polite"); this.liveEl.setAttribute("data-vfx-skip", "");
    container.appendChild(this.element);
    if (this.options.controls) this._buildControls();
    this.selected = null; this._dirty = true; this._lastWidth = 0;
    var self = this;
    this.svg.addEventListener("mousemove", function (e) { self._hover(e); });
    this.svg.addEventListener("mouseleave", function () { self._hideTip(); });
    this.svg.addEventListener("click", function (e) { self._click(e); });
    this.svg.addEventListener("keydown", function (e) { self._key(e); });
    if (root.ResizeObserver) {
      this._observer = new root.ResizeObserver(function () { var w = Math.round(self.element.clientWidth); if (w && Math.abs(w - self._lastWidth) > 1) self.redraw(); });
      this._observer.observe(this.element);
    } else { this._onResize = function () { self.redraw(); }; root.addEventListener("resize", this._onResize); }
    this.redraw();
    if (this.options.toolbar !== false && root.VeyformaToolkit) this.toolkit = root.VeyformaToolkit.attach(this, this.options.toolbar);
  }
  function defaultLimits(l) { var out = [0.5, 0.75, 1, 1.5, 2].map(function (f) { return Math.round(l * f * 100) / 100; }); return out; }

  Chart.prototype.getTheme = function () { return resolveTheme(this.options.theme, this.options.thresholds); };
  Chart.prototype._labels = function () { return assign({}, DEFAULT_LABELS, this.options.labels || {}); };
  Chart.prototype.isZoomed = function () { return false; };

  Chart.prototype._buildControls = function () {
    var self = this, o = this.options, lb = this._labels(), bar = htmlEl("div", PFX + "-controls", this.plotHost); this.bar = bar;
    bar.setAttribute("data-vfx-skip", "");
    var icon = htmlEl("span", null, bar); icon.setAttribute("aria-hidden", "true"); this._icon = icon;
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" opacity=".45"><\/circle><circle cx="12" cy="12" r="4.5"><\/circle><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4"><\/path><\/svg>';
    this._sels = {};
    function sel(key, aria, items, value, bold) {
      if (bar.children.length > 1) htmlEl("span", PFX + "-sep", bar).setAttribute("aria-hidden", "true");
      var wrap = htmlEl("label", PFX + "-sel", bar), se = htmlEl("select", null, wrap); se.setAttribute("aria-label", aria);
      se.style.fontWeight = bold ? "700" : "500";
      items.forEach(function (it) { var op = htmlEl("option", null, se, it[1]); op.value = String(it[0]); if (String(it[0]) === String(value)) op.selected = true; });
      var chev = htmlEl("span", PFX + "-chev", wrap); chev.setAttribute("aria-hidden", "true");
      chev.innerHTML = '<svg viewBox="0 0 12 8" width="100%" height="100%"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><\/path><\/svg>';
      se.addEventListener("change", function () { var p = {}; p[key] = key === "peril" ? se.value : +se.value; self.setOptions(p); });
      self._sels[key] = { select: se, chev: chev };
    }
    sel("peril", lb.perilAria, o.perils.map(function (p) { return [p.key, p.label]; }), o.peril, true);
    sel("radius", lb.radiusAria, o.radii.map(function (r) { return [r, r + " " + lb.radiusSuffix]; }), o.radius);
    sel("limit", lb.limitAria, o.limits.map(function (l) { return [l, money(l, o.currency, o.unit, true) + " " + lb.limitSuffix]; }), o.limit);
  };
  Chart.prototype._syncControls = function () {
    if (!this._sels) return; var o = this.options, s = this._sels;
    s.peril.select.value = o.peril; s.radius.select.value = String(o.radius);
    if (o.limits.indexOf(o.limit) < 0) { var op = htmlEl("option", null, s.limit.select, money(o.limit, o.currency, o.unit, true) + " " + this._labels().limitSuffix); op.value = String(o.limit); }
    s.limit.select.value = String(o.limit);
  };
  Chart.prototype._styleControls = function (t, k, compact) {
    if (!this.bar) return;
    var fs = compact ? 15 : Math.max(12, 25 * k), padY = compact ? 6 : Math.max(6, 14 * k), padX = compact ? 12 : Math.max(10, 30 * k), bs = this.bar.style;
    bs.fontSize = fs + "px"; bs.padding = padY + "px " + padX + "px"; bs.gap = (compact ? 8 : Math.max(10, 26 * k)) + "px " + (compact ? 18 : Math.max(10, 26 * k)) + "px";
    bs.bottom = compact ? "" : Math.max(6, 22 * k) + "px"; bs.background = t.pill; bs.color = t.pillInk;
    this._icon.style.cssText = "display:inline-block;flex:none;width:" + fs * 1.3 + "px;height:" + fs * 1.3 + "px;color:" + t.accent;
    for (var key in this._sels) { var s = this._sels[key]; s.select.style.paddingRight = fs * 0.9 + "px"; s.select.style.marginRight = -(fs * 0.55) + "px"; s.chev.style.width = fs * 0.55 + "px"; s.chev.style.height = fs * 0.38 + "px"; }
    Array.prototype.forEach.call(this.bar.querySelectorAll("." + PFX + "-sep"), function (s) { s.style.background = t.faint; });
  };

  /** Changes options (peril, radius, limit, theme, callouts...) and redraws. */
  Chart.prototype.setOptions = function (o) {
    o = o || {}; assign(this.options, o);
    if (o.peril != null || o.radius != null || o.limit != null || o.perils || o.thresholds || o.cell) { this.selected = null; this._dirty = true; }
    if (o.radius != null && this.options.radii.indexOf(this.options.radius) < 0) this.options.radii = this.options.radii.concat([this.options.radius]).sort(function (a, b) { return a - b; });
    if (this._sels && o.radius != null && !Array.prototype.some.call(this._sels.radius.select.options, function (op) { return +op.value === o.radius; })) {
      var op = htmlEl("option", null, this._sels.radius.select, o.radius + " " + this._labels().radiusSuffix); op.value = String(o.radius);
    }
    this._syncControls(); this.redraw(); return this;
  };
  Chart.prototype.update = function (o) { return this.setOptions(o); };
  /** Replaces the data (locations, areas, basemap...). Arrays changed in place are re-read. */
  Chart.prototype.setData = function (d) {
    if (!d || !d.basemap) fail("data.basemap is required.");
    if (dataCache && d.locations) dataCache["delete"](d.locations);
    if (dataCache && d.previous) dataCache["delete"](d.previous);
    this.options.data = d; this.selected = null; this._dirty = true; this.redraw(); return this;
  };
  Chart.prototype.setTheme = function (t) { this.options.theme = t; this.redraw(); return this; };
  Chart.prototype.destroy = function () {
    if (this.toolkit && this.toolkit.destroy) this.toolkit.destroy();
    if (this._observer) this._observer.disconnect();
    if (this._onResize) root.removeEventListener("resize", this._onResize);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  };

  Chart.prototype._compute = function () {
    if (!this._dirty && this.model) return this.model;
    var d = this.options.data, o = this.options;
    this.model = compute(d, o);
    this.prevModel = d.previous ? compute({ basemap: d.basemap, locations: d.previous, areas: d.areas }, assign({}, o, { _noHotspots: true })) : null;
    this._dirty = false; this._landGrid = null;
    if (!this.selected && this.model.hotspots[0]) this.selected = { lon: this.model.hotspots[0].lon, lat: this.model.hotspots[0].lat, hot: 0 };
    return this.model;
  };

  /** Draws the chart (the toolkit wraps this to refresh menu, notes and caption). */
  Chart.prototype.redraw = function () {
    var m = this._compute(), o = this.options, d = o.data, t = this.getTheme(), lb = this._labels();
    var w = this.element.clientWidth || this.container.clientWidth || 1200; this._lastWidth = Math.round(w);
    var compact = w < o.compactBelow; this._compact = compact;
    this.element.classList.toggle(PFX + "-compact", compact);
    this.element.style.setProperty("--vac-focus", t.focus);
    this.element.style.fontFamily = t.font; this.element.style.color = t.text;
    this.headT.textContent = d.title || ""; this.headS.textContent = d.subtitle || ""; this.headS.style.color = t.mutedText;
    var bm = d.basemap, vb = compact ? [0, 118, 1330, 708] : [0, 0, bm.W, bm.H];
    this._vb = vb;
    this.svg.setAttribute("viewBox", vb.join(" "));
    this.svg.setAttribute("aria-label", (o.ariaLabel || d.title || "Exposure accumulation map") + ". " + this.describe());
    var k = w / vb[2]; this._k = k;
    this._draw(m, t, lb, compact, k);
    this._styleControls(t, w / bm.W, compact);
    this._renderCompact(m, t, lb, compact);
    this.tipEl.style.background = t.tip; this.tipEl.style.color = t.tipInk;
    return this;
  };

  Chart.prototype._bandIndex = function (p) { var th = this.options.thresholds, k = -1; for (var i = 0; i < th.length; i++) if (p >= th[i]) k = i; return k; };

  Chart.prototype._draw = function (m, t, lb, compact, k) {
    var self = this, svg = this.svg, o = this.options, d = o.data, bm = d.basemap, W = bm.W, H = bm.H;
    Array.prototype.slice.call(svg.childNodes).forEach(function (n) { svg.removeChild(n); });
    var uid = PFX + this.id;
    var defs = svgEl("defs", {}, svg), lg = svgEl("linearGradient", { id: uid + "bg", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    svgEl("stop", { offset: "0", "stop-color": t.sky0 }, lg); svgEl("stop", { offset: "1", "stop-color": t.sky1 }, lg);
    var cp = svgEl("clipPath", { id: uid + "land" }, defs); svgEl("path", { d: bm.land }, cp);
    svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#" + uid + "bg)" }, svg);
    svgEl("path", { d: bm.land, fill: t.land }, svg);
    var nx = m.nx, ny = m.ny, sm = blurGrid(m.pct, nx, ny, o.smooth), pad = new Float64Array((nx + 2) * (ny + 2));
    pad.fill(-Infinity); for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) pad[(j + 1) * (nx + 2) + i + 1] = sm[j * nx + i];
    this._sm = sm;
    var g = svgEl("g", { "clip-path": "url(#" + uid + "land)" }, svg), toX = function (gx) { return m.x0 + (gx + 0.5) * m.cell; }, toY = function (gy) { return m.y0 + (gy + 0.5) * m.cell; };
    var limitPath = null;
    o.thresholds.forEach(function (th, b) { var p = contourPath(pad, nx, ny, th, toX, toY); if (th === 100) limitPath = p; if (p) svgEl("path", { d: p, fill: t.bands[b], "fill-rule": "evenodd", "fill-opacity": 0.93 }, g); });
    if (limitPath == null) limitPath = contourPath(pad, nx, ny, 100, toX, toY);
    if (limitPath) svgEl("path", { d: limitPath, fill: "none", stroke: t.limitLine, "stroke-width": 1.8, "stroke-linejoin": "round", "class": PFX + "-limit" }, g);
    if (o.relief && d.relief) svgEl("image", { href: d.relief, x: 0, y: 0, width: W, height: H, "clip-path": "url(#" + uid + "land)", preserveAspectRatio: "none" }, svg);
    svgEl("path", { d: bm.mesh, fill: "none", stroke: t.border, "stroke-width": 0.9, "stroke-opacity": 0.55, "stroke-linejoin": "round" }, svg);
    svgEl("path", { d: bm.land, fill: "none", stroke: t.coast, "stroke-width": 1.3, "stroke-linejoin": "round" }, svg);
    function colourAt(x, y) { var gi = Math.round((x - m.x0) / m.cell - 0.5), gj = Math.round((y - m.y0) / m.cell - 0.5); if (gi < 0 || gj < 0 || gi >= nx || gj >= ny) return t.land; var b = self._bandIndex(sm[gj * nx + gi]); return b < 0 ? t.land : t.bands[b]; }
    this._colourAt = colourAt;
    var boxes = [], small = compact && k < 0.45;
    var haloAttrs = { "paint-order": "stroke", stroke: t.halo, "stroke-width": 4, "stroke-opacity": 0.82, "stroke-linejoin": "round" };
    var gState = svgEl("g", assign({ "font-family": t.mono, "font-size": 17, "letter-spacing": "0.06em", "text-anchor": "middle" }, haloAttrs), svg);
    var gBand = svgEl("g", assign({ "font-family": t.font, "font-size": 18, "font-weight": 700, "text-anchor": "middle" }, haloAttrs), svg), gCall = svgEl("g", {}, svg);
    var tw = d.title ? Math.min(1320, 96 + String(d.title).length * 0.56 * Math.max(30, Math.min(46, 1240 / (String(d.title).length * 0.56)))) : 0;
    this._reserved = compact ? [] : [[0, 0, Math.max(tw, d.subtitle ? 96 + String(d.subtitle).length * 12.5 : 0, 400), 124], [1330, 560, W, H]].concat(o.controls && !(o.toolbar && o.toolbar._exportOnly) ? [[400, 790, 1200, H]] : []);
    if (!m.used) boxes.push([400, 430, 920, 490]);
    this._callouts(gCall, t, lb, boxes, compact, k);
    if (o.bandLabels && !small) this._bandLabels(gBand, sm, boxes, colourAt, t);
    if (o.stateLabels && bm.states && !small) bm.states.forEach(function (s) {
      if (!s.lp) return; var bx = [s.lp[0] - 17, s.lp[1] - 9, s.lp[0] + 17, s.lp[1] + 9];
      if (boxes.some(function (b) { return overlap(b, bx); })) return;
      var tx = svgEl("text", { x: s.lp[0], y: s.lp[1] + 6, fill: t.label }, gState); tx.textContent = s.id; boxes.push(bx);
    });
    if (!compact) {
      var exportOnly = o.toolbar && o.toolbar._exportOnly;
      if (d.title && !exportOnly) {
        svgEl("rect", { x: 44, y: 30, width: 7, height: 76, rx: 3.5, fill: t.accent }, svg);
        var tfs = Math.max(30, Math.min(46, 1240 / (String(d.title).length * 0.56)));
        var tt = svgEl("text", { x: 76, y: 70, "font-family": t.font, "font-size": tfs, "font-weight": 800, fill: t.text, "letter-spacing": "-0.01em" }, svg); tt.textContent = fitText(d.title, 70);
        if (d.subtitle) { var st = svgEl("text", { x: 78, y: 104, "font-family": t.font, "font-size": 24, fill: t.mutedText }, svg); st.textContent = fitText(d.subtitle, 60); }
      }
      this._legend(svg, t, lb, m);
      var note = svgEl("text", { x: W - 26, y: H - 22, "text-anchor": "end", "font-family": t.font, "font-size": 17, "font-style": "italic", fill: t.faint }, svg); note.textContent = d.note || lb.note;
    }
    if (!m.used) { var nd = svgEl("text", { x: 660, y: 470, "text-anchor": "middle", "font-family": t.font, "font-size": 28, "font-weight": 700, fill: t.mutedText }, svg); nd.textContent = lb.noData; }
  };

  Chart.prototype._bandLabels = function (g, sm, boxes, colourAt, t) {
    var m = this.model, nx = m.nx, ny = m.ny, sel = this.selected, marks = [], seen = [], self = this;
    function at(x, y) { var ci = Math.round((x - m.x0) / m.cell - 0.5), cj = Math.round((y - m.y0) / m.cell - 0.5); return (ci < 0 || cj < 0 || ci >= nx || cj >= ny) ? -1 : sm[cj * nx + ci]; }
    m.hotspots.forEach(function (h, idx) {
      if (seen.some(function (s) { return Math.hypot(s[0] - h.x, s[1] - h.y) < 120; })) return; seen.push([h.x, h.y]);
      var isSel = sel && sel.hot === idx, peak = at(h.x, h.y);
      if (!isSel && h.pct >= 100) marks.push([h.x, h.y - 16, pctTxt(h.pct), 3]);
      [100, 75].forEach(function (lev) {
        if (peak < lev) return; var bestP = null, bestD = 0;
        for (var a = 0; a < 12; a++) {
          var ang = a * Math.PI / 6 + 0.2, x = h.x, y = h.y;
          for (var st = 0; st < 160; st++) { x += Math.cos(ang) * 2; y += Math.sin(ang) * 2; var v = at(x, y); if (v < 0) break;
            if (v < lev) { var dd = Math.hypot(x - h.x, y - h.y); if (dd > 24 && dd > bestD && colourAt(x, y) !== t.land) { bestD = dd; bestP = [x - Math.cos(ang) * 10, y - Math.sin(ang) * 10]; } break; } }
        }
        if (bestP && !marks.some(function (q) { return Math.hypot(q[0] - bestP[0], q[1] - bestP[1]) < 44; })) marks.push([bestP[0], bestP[1], lev + "%", lev === 100 ? 2 : 1]);
      });
    });
    marks.sort(function (a, b) { return b[3] - a[3]; });
    marks.forEach(function (mk) {
      var w = mk[2].length * 10.5 + 8, bx = [mk[0] - w / 2, mk[1] - 12, mk[0] + w / 2, mk[1] + 10];
      if (boxes.some(function (b) { return overlap(b, bx); }) || self._reserved.some(function (b) { return overlap(b, bx); }) || bx[2] > 1325) return;
      boxes.push(bx); var tx = svgEl("text", { x: mk[0], y: mk[1] + 6, fill: contrast(t.darkInk, t.halo) >= 4.5 ? t.darkInk : t.text }, g); tx.textContent = mk[2];
    });
  };

  Chart.prototype._radiusPx = function (y) { var m = this.model, j = Math.max(0, Math.min(m.ny - 1, Math.round((y - m.y0) / m.cell))); return m.radius / ((m.kx[j] + m.ky[j]) / 2); };

  /** The spots that get a callout: the selected spot first, then the next worst areas. */
  Chart.prototype._calloutList = function () {
    var m = this.model, o = this.options, lb = this._labels(), sel = this.selected, list = [], d = o.data, self = this;
    if (sel) {
      var hs = sel.hot != null ? m.hotspots[sel.hot] : null, r = hs || assign({ lon: sel.lon, lat: sel.lat }, m.sumAt(sel.lon, sel.lat));
      var q = m.P.fwd(r.lon, r.lat), na = nearestArea(d.areas || [], r.lon, r.lat);
      list.push({ lon: r.lon, lat: r.lat, x: q[0], y: q[1], sum: r.sum, n: r.n, largest: r.largest, hot: sel.hot, main: true,
        name: hs ? hs.name : (na.name && na.km < 160 ? lb.near.charAt(0).toUpperCase() + lb.near.slice(1) + " " + na.name : lb.selected) });
    }
    m.hotspots.forEach(function (h, i) {
      if (list.length >= o.callouts) return; if (sel && sel.hot === i) return; if (sel && hav(h.lon, h.lat, sel.lon, sel.lat) < o.radius * 1.5) return;
      list.push({ lon: h.lon, lat: h.lat, x: h.x, y: h.y, sum: h.sum, n: h.n, largest: h.largest, hot: i, name: h.name });
    });
    list.forEach(function (c) { c.prev = self.prevModel ? self.prevModel.sumAt(c.lon, c.lat).sum : null; c.official = self._official(c); });
    return list;
  };
  Chart.prototype._official = function (c) {
    var off = this.options.data.official; if (!Array.isArray(off)) return null;
    for (var i = 0; i < off.length; i++) { var f = off[i]; if (f && isFinite(f.value) && ((f.name && f.name === c.name) || (isFinite(f.lon) && hav(f.lon, f.lat, c.lon, c.lat) <= this.options.radius / 2))) return f; }
    return null;
  };
  Chart.prototype._calloutLines = function (c) {
    var o = this.options, lb = this._labels(), shown = c.official ? +c.official.value : c.sum, over = shown - o.limit;
    var l2 = money(shown, o.currency, o.unit) + " " + lb.within + " " + o.radius + " " + lb.km;
    var l3 = Math.abs(over) < o.limit * 0.005 ? lb.atLimit : money(Math.abs(over), o.currency, o.unit) + " " + (over > 0 ? lb.overLimit : lb.belowLimit);
    var extra = [];
    if (c.official) extra.push("(" + lb.official + ")");
    if (c.prev != null) extra.push(signedMoney(c.sum - c.prev, o.currency, o.unit) + " " + lb.since + " " + (o.data.previousLabel || "previous"));
    return { l2: l2, l3: l3, extra: extra, l4: extra.join(" · ") || null, over: over > 0 };
  };

  Chart.prototype._callouts = function (g, t, lb, boxes, compact, k) {
    var m = this.model, o = this.options, self = this, list = this._calloutList(), W = o.data.basemap.W;
    this._list = list;
    list.forEach(function (c) { c.rp = c.main ? self._radiusPx(c.y) : 8; boxes.push([c.x - c.rp - 4, c.y - c.rp - 4, c.x + c.rp + 4, c.y + c.rp + 4]); });
    // circle and markers
    list.forEach(function (c, idx) {
      if (c.main) {
        svgEl("circle", { cx: c.x, cy: c.y, r: c.rp, fill: "none", stroke: t.halo, "stroke-width": 6, "stroke-opacity": 0.85 }, g);
        svgEl("circle", { cx: c.x, cy: c.y, r: c.rp, fill: "none", stroke: t.marker, "stroke-width": 2.6, "stroke-dasharray": "7 5" }, g);
        var cs = Math.max(8, Math.min(14, c.rp * 0.45)), cross = "M" + (c.x - cs) + "," + c.y + "H" + (c.x + cs) + "M" + c.x + "," + (c.y - cs) + "V" + (c.y + cs);
        svgEl("path", { d: cross, stroke: t.halo, "stroke-width": 4.5, "stroke-linecap": "round" }, g);
        svgEl("path", { d: cross, stroke: t.marker, "stroke-width": 1.8, "stroke-linecap": "round" }, g);
      } else svgEl("circle", { cx: c.x, cy: c.y, r: 5.5, fill: t.marker, stroke: t.halo, "stroke-width": 2 }, g);
      if (compact) {
        var br = 13 / Math.max(k, 0.2) * 0.75, vbx = self._vb || [0, 118, 1330, 708], bx = c.x + (c.main ? c.rp * 0.75 + br * 0.6 : br * 1.2), by = c.y - (c.main ? c.rp * 0.75 + br * 0.6 : br * 1.2);
        bx = Math.max(vbx[0] + br + 2, Math.min(vbx[0] + vbx[2] - br - 2, bx)); by = Math.max(vbx[1] + br + 2, Math.min(vbx[1] + vbx[3] - br - 2, by));
        svgEl("circle", { cx: bx, cy: by, r: br, fill: t.marker, stroke: t.halo, "stroke-width": br * 0.18 }, g);
        var nt = svgEl("text", { x: bx, y: by + br * 0.36, "text-anchor": "middle", "font-family": t.font, "font-size": br * 1.05, "font-weight": 700, fill: t.halo }, g); nt.textContent = String(idx + 1);
      }
    });
    if (compact) return;
    var BW = 262, BH = 104, slots = [], x, y;
    for (y = 150; y <= 470; y += 8) slots.push([1332, y, "R"]);
    for (y = 560; y <= 700; y += 8) slots.push([22, y, "L"]);
    for (x = 600; x <= 1000; x += 10) for (y = 640; y <= 690; y += 8) slots.push([x, y, "G"]);
    for (x = 1110; x <= 1330; x += 10) for (y = 430; y <= 690; y += 10) slots.push([x, y, "A"]);
    var placed = [];
    list.forEach(function (c) {
      var lines = self._calloutLines(c), bh = BH + lines.extra.length * 26, best = null, cand = slots.slice();
      for (var dist = 70; dist <= 300; dist += 30) for (var a = 0; a < 16; a++) {
        var ang = a * Math.PI / 8, ax = c.x + Math.cos(ang) * (dist + c.rp), ay = c.y + Math.sin(ang) * (dist + c.rp), left = Math.cos(ang) < 0;
        cand.push([left ? ax - BW : ax, ay - 34, "N"]);
      }
      cand.forEach(function (sl) {
        var rect = [sl[0], sl[1], sl[0] + BW, sl[1] + bh];
        if (rect[2] > W - 8 || rect[0] < 8 || rect[1] < 8) return;
        if (sl[2] === "N" && (rect[2] > 1325 || rect[3] > 812 || rect[1] < 128)) return;
        if (self._reserved.some(function (b) { return overlap(b, rect); }) || placed.some(function (b) { return overlap(b, rect); }) || boxes.some(function (b) { return overlap(b, rect); })) return;
        var busy = 0;
        if (sl[2] === "N") { busy = self._busyShare(rect); if (busy > 0.12) return; }
        else if (sl[2] !== "R" && self._rectOnLand(rect)) return;
        var leftOf = sl[0] + BW / 2 < c.x, ax2 = leftOf ? sl[0] + BW : sl[0], ay2 = sl[1] + 34;
        var len = Math.hypot(ax2 - c.x, ay2 - c.y), cost = sl[2] === "N" ? len + 190 + busy * 900 : len + 1.0 * Math.max(0, self._lineLand(c.x, c.y, ax2, ay2) - 40) + (sl[2] === "R" ? 0 : 30);
        if (!best || cost < best.cost) best = { cost: cost, sl: sl, rect: rect, ax: ax2, ay: ay2, leftOf: leftOf, plate: sl[2] === "N" };
      });
      if (!best) { var fy = 150 + placed.length * 128; best = { sl: [1332, fy, "R"], rect: [1332, fy, 1332 + BW, fy + bh], ax: 1332, ay: fy + 34, leftOf: false }; }
      best.rect = [best.rect[0] - 8, best.rect[1] - 8, best.rect[2] + 8, best.rect[3] + 6]; placed.push(best.rect); c.block = best; c.lines = lines;
    });
    list.forEach(function (c) {
      var bl = c.block, bx = bl.sl[0], by = bl.sl[1], uy = by + 34, ang = Math.atan2(bl.ay - c.y, bl.ax - c.x);
      var sx = c.main ? c.x + Math.cos(ang) * c.rp : c.x, sy = c.main ? c.y + Math.sin(ang) * c.rp : c.y, lineEnd = bl.leftOf ? bx : bx + BW;
      if (bl.plate) svgEl("rect", { x: bx - 6, y: by - 6, width: BW + 12, height: bl.rect[3] - by - 2, rx: 8, fill: t.sky0, "fill-opacity": 0.9 }, g);
      svgEl("path", { d: "M" + sx.toFixed(1) + "," + sy.toFixed(1) + "L" + bl.ax + "," + uy + "L" + lineEnd + "," + uy, fill: "none", stroke: t.text, "stroke-width": 1.3 }, g);
      var tx0 = bx + 4, L4 = c.lines;
      var nm = svgEl("text", { x: tx0, y: uy - 10, "font-family": t.font, "font-size": 25, "font-weight": 800, fill: t.text }, g); nm.textContent = fitText(c.name, 17);
      var a2 = svgEl("text", { x: tx0 + 2, y: uy + 30, "font-family": t.mono, "font-size": 18, fill: t.text }, g); a2.textContent = L4.l2;
      var b2 = svgEl("text", { x: tx0 + 2, y: uy + 56, "font-family": t.mono, "font-size": 18, fill: L4.over ? t.text : t.mutedText, "font-weight": L4.over ? 700 : 400 }, g); b2.textContent = L4.l3;
      L4.extra.forEach(function (ln, i) { var e = svgEl("text", { x: tx0 + 2, y: uy + 82 + i * 26, "font-family": t.mono, "font-size": 18, fill: t.mutedText }, g); e.textContent = ln; });
      boxes.push(bl.rect);
    });
  };
  /** Share of a rectangle covered by the stronger bands (where a callout would hide the picture). */
  Chart.prototype._busyShare = function (r) {
    var n = 0, busy = 0, col = this._colourAt, t = this.getTheme(), strong = t.bands.slice(3);
    for (var x = r[0] + 6; x <= r[2]; x += 16) for (var y = r[1] + 6; y <= r[3]; y += 16) { n++; if (strong.indexOf(col(x, y)) >= 0) busy++; }
    return n ? busy / n : 0;
  };
  Chart.prototype._rectOnLand = function (r) { for (var x = r[0]; x <= r[2]; x += 14) for (var y = r[1]; y <= r[3]; y += 14) if (this._isLand(x, y)) return true; return false; };
  Chart.prototype._lineLand = function (x1, y1, x2, y2) { var n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 8)), c = 0; for (var i = 0; i <= n; i++) if (this._isLand(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)) c++; return c * 8; };
  Chart.prototype._isLand = function (x, y) {
    var bm = this.options.data.basemap;
    if (this._landFor !== bm) {
      this._landFor = bm; this._landMask = null;
      try {
        var cv = document.createElement("canvas"), w = Math.ceil(bm.W / 2), h = Math.ceil(bm.H / 2); cv.width = w; cv.height = h;
        var ctx = cv.getContext("2d"); ctx.scale(0.5, 0.5); ctx.fillStyle = "#000"; ctx.fill(new Path2D(bm.land));
        var px = ctx.getImageData(0, 0, w, h).data, mk = new Uint8Array(w * h); for (var i = 0; i < w * h; i++) mk[i] = px[i * 4 + 3] > 127 ? 1 : 0;
        this._landMask = { w: w, h: h, m: mk };
      } catch (e) { this._landMask = null; }
    }
    var L = this._landMask; if (!L) return true;
    var i2 = Math.floor(x / 2), j2 = Math.floor(y / 2); return i2 >= 0 && j2 >= 0 && i2 < L.w && j2 < L.h && L.m[j2 * L.w + i2] === 1;
  };
;

  Chart.prototype._legend = function (svg, t, lb, m) {
    var o = this.options, x = 1372, y = 598, bw = 50, step = 19, n = o.thresholds.length, g = svgEl("g", { "font-family": t.font }, svg);
    var ti = svgEl("text", { x: x, y: y, "font-size": 20, "font-weight": 700, fill: t.text }, g); ti.textContent = lb.legendTitle;
    var top = y + 20, bx = x + 22;
    for (var b = 0; b < n; b++) svgEl("rect", { x: bx, y: top + (n - 1 - b) * step, width: bw, height: step, fill: t.bands[b] }, g);
    var lx = bx + bw + 24; svgEl("path", { d: "M" + lx + "," + (top + 6) + "V" + (top + n * step - 6), stroke: t.text, "stroke-width": 1.3 }, g);
    var li = o.thresholds.indexOf(100); if (li >= 0) { var ly = top + (n - 1 - li) * step + step; svgEl("path", { d: "M" + (bx - 4) + "," + ly + "H" + (bx + bw + 4), stroke: t.limitLine, "stroke-width": 2.4 }, g); }
    var ticks = o.legendTicks.filter(function (v) { return o.thresholds.indexOf(v) >= 0; }).map(function (v) { return [top + (n - 1 - o.thresholds.indexOf(v)) * step + step, v + "%"]; });
    var last = o.thresholds[n - 1];
    ticks.push(m.maxPct >= last ? [top + 6, pctTxt(m.maxPct)] : [top + step, last + "%"]);
    ticks.forEach(function (tk) { svgEl("path", { d: "M" + lx + "," + tk[0] + "h9", stroke: t.text, "stroke-width": 1.3 }, g); var tx = svgEl("text", { x: lx + 18, y: tk[0] + 7, "font-size": 20, fill: t.text }, g); tx.textContent = tk[1]; });
  };

  /** Phone layout: callout cards and a horizontal legend under the map. */
  Chart.prototype._renderCompact = function (m, t, lb, compact) {
    var self = this, o = this.options;
    this.cardsEl.textContent = ""; this.hLegendEl.textContent = "";
    if (!compact) return;
    (this._list || []).forEach(function (c, i) {
      var b = htmlEl("button", PFX + "-card", self.cardsEl); b.type = "button";
      var badge = htmlEl("span", PFX + "-badge", b, String(i + 1)); badge.style.background = t.marker; badge.style.color = t.halo;
      var body = htmlEl("span", PFX + "-card-body", b), L4 = self._calloutLines(c);
      htmlEl("b", null, body, c.name); htmlEl("span", null, body, L4.l2);
      var s3 = htmlEl("span", null, body, L4.l3); s3.style.fontWeight = L4.over ? "700" : "400"; if (!L4.over) s3.style.color = t.mutedText;
      if (L4.l4) { var s4 = htmlEl("span", null, body, L4.l4); s4.style.color = t.mutedText; }
      b.addEventListener("click", function () { self.select([c.lon, c.lat]); });
    });
    var tt = htmlEl("div", PFX + "-hlegend-t", this.hLegendEl, lb.legendTitle), bar = htmlEl("div", PFX + "-hbar", this.hLegendEl), n = o.thresholds.length;
    t.bands.forEach(function (c) { htmlEl("i", null, bar).style.background = c; });
    var ticks = htmlEl("div", PFX + "-hticks", this.hLegendEl);
    o.legendTicks.forEach(function (v) { var ix = o.thresholds.indexOf(v); if (ix < 0) return; var s = htmlEl("span", null, ticks, v + "%"); s.style.left = (ix / n * 100) + "%"; });
    var lastT = o.thresholds[n - 1], mx = htmlEl("span", null, ticks, m.maxPct >= lastT ? pctTxt(m.maxPct) : lastT + "%");
    if (m.maxPct >= lastT) { mx.style.left = "auto"; mx.style.right = "0"; mx.style.transform = "none"; } else mx.style.left = ((n - 1) / n * 100) + "%";
    var note = htmlEl("div", null, this.hLegendEl, o.data.note || lb.note); note.style.cssText = "font-style:italic;margin-top:6px;color:" + t.faint;
  };

  /* ======================================================================
     7. INTERACTION
     ====================================================================== */
  Chart.prototype._toMap = function (e) { var b = this.svg.getBoundingClientRect(), vb = this._vb, s = vb[2] / b.width; return [vb[0] + (e.clientX - b.left) * s, vb[1] + (e.clientY - b.top) * s, b]; };
  Chart.prototype._onMap = function (x, y) { return (this._compact || x < 1325) && this._isLand(x, y); };
  Chart.prototype._hideTip = function () { this.tipEl.classList.remove(PFX + "-on"); };
  Chart.prototype._hover = function (e) {
    var p = this._toMap(e), m = this.model, o = this.options, lb = this._labels();
    if (!this._onMap(p[0], p[1])) { this._hideTip(); this.svg.style.cursor = "default"; return; }
    this.svg.style.cursor = "crosshair";
    var ll = m.P.inv(p[0], p[1]), r = m.sumAt(ll[0], ll[1]), na = nearestArea(o.data.areas || [], ll[0], ll[1]);
    var lines = [lb.eventHere + (na.name && na.km < 160 ? " · " + lb.near + " " + na.name : ""),
      money(r.sum, o.currency, o.unit) + " " + lb.within + " " + o.radius + " " + lb.km + " (" + r.n.toLocaleString("en-US") + " " + lb.locations + ")",
      pctTxt(r.sum / o.limit * 100) + " " + lb.ofLimit + " " + money(o.limit, o.currency, o.unit, true) + " " + lb.limitWord];
    if (this.prevModel) lines.push(signedMoney(r.sum - this.prevModel.sumAt(ll[0], ll[1]).sum, o.currency, o.unit) + " " + lb.since + " " + (o.data.previousLabel || "the previous date"));
    this._showTip(lines, e.clientX, e.clientY);
  };
  Chart.prototype._showTip = function (lines, cx, cy) {
    var tip = this.tipEl, t = this.getTheme(), box = this.element.getBoundingClientRect();
    this.tipText.textContent = "";
    lines.forEach(function (ln, i) { var dv = htmlEl("div", null, null, ln); if (!i) dv.style.fontWeight = "700"; tip.lastChild.appendChild(dv); });
    tip.classList.add(PFX + "-on");
    var w = tip.offsetWidth, h = tip.offsetHeight, sx = cx - box.left, sy = cy - box.top, above = sy - h - 14 >= 0, left = Math.max(4, Math.min(box.width - w - 4, sx - w / 2));
    tip.style.left = left + "px"; tip.style.top = (above ? sy - h - 14 : sy + 14) + "px";
    var ar = this.tipArrow; ar.style.left = Math.max(6, Math.min(w - 22, sx - left - 8)) + "px";
    if (above) { ar.style.top = h + "px"; ar.style.borderTop = "9px solid " + t.tip; ar.style.borderBottom = "0"; }
    else { ar.style.top = "-9px"; ar.style.borderBottom = "9px solid " + t.tip; ar.style.borderTop = "0"; }
  };
  Chart.prototype._click = function (e) {
    if (this.element.classList.contains("vfx-picking")) return;
    var p = this._toMap(e), m = this.model;
    if (this._list && !this._compact) { var hit = null; this._list.forEach(function (c) { var r = c.block && c.block.rect; if (r && p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]) hit = c; }); if (hit) { this.select([hit.lon, hit.lat]); return; } }
    if (!this._onMap(p[0], p[1])) return;
    this.select(m.P.inv(p[0], p[1]));
    if (e.pointerType === "touch" || this._compact) this._hover(e);
  };
  /** Moves the event circle to [lon, lat]; snaps to a worst area within 15 km. */
  Chart.prototype.select = function (ll) {
    var m = this._compute(), hot = null;
    m.hotspots.forEach(function (h, i) { if (hot == null && hav(h.lon, h.lat, ll[0], ll[1]) < 15) hot = i; });
    this.selected = hot != null ? { lon: m.hotspots[hot].lon, lat: m.hotspots[hot].lat, hot: hot } : { lon: ll[0], lat: ll[1], hot: null };
    this.redraw();
    var c = this._list && this._list[0]; if (c) this.liveEl.textContent = c.name + ": " + this._calloutLines(c).l2 + ", " + this._calloutLines(c).l3 + ".";
    return this;
  };
  Chart.prototype.resetSelection = function () { this.selected = null; this._dirty = true; this.redraw(); return this; };
  Chart.prototype.getSelection = function () {
    var c = this._list && this._list[0]; if (!c) return null;
    return { name: c.name, lon: c.lon, lat: c.lat, value: c.sum, locations: c.n, largest: c.largest, shareOfLimit: c.sum / this.options.limit, previous: c.prev, official: c.official ? +c.official.value : null };
  };
  Chart.prototype._key = function (e) {
    if (!this.options.keyboard) return;
    if (e.key === "Escape") { this.resetSelection(); e.preventDefault(); return; }
    var d = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (!d || !this.selected) return;
    e.preventDefault();
    var step = Math.max(5, this.options.radius / 4) * (e.shiftKey ? 4 : 1), s = this.selected;
    this.selected = { lon: s.lon + d[0] * step / (111.32 * Math.cos(s.lat * R)), lat: s.lat + d[1] * step / 111.32, hot: null };
    this.redraw();
    var c = this._list[0], L4 = this._calloutLines(c); this.liveEl.textContent = c.name + ": " + L4.l2 + ", " + L4.l3 + ".";
  };

  /* ======================================================================
     8. TEXT, EXPORT AND NOTES
     ====================================================================== */
  Chart.prototype.howToRead = function () {
    var o = this.options;
    var s = "Each colour band shows how much insured value one " + o.radius + " km event would hit if it were centred at that spot, as a share of the " + money(o.limit, o.currency, o.unit, true) +
      " limit: purple is below the limit, rose to coral is above it. The dashed circle is the selected event; move it by clicking the map or with the arrow keys.";
    return s;
  };
  Chart.prototype.describe = function () {
    var m = this._compute(), o = this.options, h = m.hotspots, over = h.filter(function (x) { return x.sum > o.limit; }), cur = o.currency, u = o.unit;
    var peril = m.peril.key === "all" ? "all perils" : m.peril.label.toLowerCase();
    if (!h.length) return "No insured value matches " + peril + ".";
    var out = [money(m.total, cur, u) + " of insured value across " + m.used.toLocaleString("en-US") + " locations (" + peril + ")."];
    out.push("The worst " + o.radius + " km event is near " + h[0].name + ": " + money(h[0].sum, cur, u) + ", " + pctTxt(h[0].pct) + " of the " + money(o.limit, cur, u, true) + " limit" + (h[0].sum > o.limit ? ", " + money(h[0].sum - o.limit, cur, u) + " over it." : "."));
    out.push(over.length + " of the " + h.length + " largest areas " + (over.length === 1 ? "is" : "are") + " over the limit" + (over.length ? ": " + over.map(function (x) { return x.name + " (" + pctTxt(x.pct) + ")"; }).join(", ") : "") + ".");
    return out.join(" ");
  };
  /** Land area (km²) where an event centred there would reach each level; needs a browser (uses the land outline). */
  Chart.prototype.areaByLevel = function () {
    var m = this._compute(), o = this.options, self = this, levels = o.thresholds.slice();
    if (!this._landGrid) { var lgd = new Uint8Array(m.nx * m.ny); for (var j = 0; j < m.ny; j++) for (var i = 0; i < m.nx; i++) lgd[j * m.nx + i] = self._isLand(m.x0 + (i + 0.5) * m.cell, m.y0 + (j + 0.5) * m.cell) ? 1 : 0; this._landGrid = lgd; }
    var out = levels.map(function () { return 0; }), land = 0;
    for (var jj = 0; jj < m.ny; jj++) { var a = m.kx[jj] * m.ky[jj] * m.cell * m.cell; for (var ii = 0; ii < m.nx; ii++) { var c = jj * m.nx + ii; if (!this._landGrid[c]) continue; land += a; for (var k = 0; k < levels.length; k++) if (m.pct[c] >= levels[k]) out[k] += a; } }
    return { levels: levels, km2: out, landKm2: land };
  };
  Chart.prototype.createTable = function () {
    var ex = this.getExportData(), wrap = htmlEl("div", PFX + "-tables");
    ex.sheets.forEach(function (sh) {
      if (sh.name === "Notes" || sh.name === "Locations") return;
      var tb = htmlEl("table", PFX + "-table", wrap); htmlEl("caption", null, tb).textContent = sh.name;
      var hr = htmlEl("tr", null, htmlEl("thead", null, tb)); sh.columns.forEach(function (c) { var th = htmlEl("th", null, hr); th.scope = "col"; th.textContent = c.label; });
      var body = htmlEl("tbody", null, tb);
      sh.text.forEach(function (r, i) { var tr = htmlEl("tr", sh.flag && sh.flag[i] ? PFX + "-flag" : null, body); r.forEach(function (v, j) { var td = htmlEl(j ? "td" : "th", null, tr); if (!j) td.scope = "row"; td.textContent = v; }); });
    });
    return wrap;
  };
  Chart.prototype.getExportData = function () {
    var m = this._compute(), o = this.options, d = o.data, self = this, cur = o.currency, u = o.unit, lb = this._labels();
    var unitObj = { prefix: cur, suffix: u === "m" ? "m" : u === "bn" ? "bn" : u === "k" ? "k" : "", decimals: 2 };
    var mon = function (l) { return { label: l, type: "number", unit: unitObj }; }, pc = function (l) { return { label: l, type: "percent", decimals: 1 }; };
    var txt = function (l) { return { label: l, type: "text" }; }, num = function (l, dd) { return { label: l, type: "number", unit: { decimals: dd } }; }, int = function (l) { return { label: l, type: "integer" }; };
    function textRow(cols, r) { return r.map(function (v, k) { var c = cols[k]; if (v == null || v === "") return "–"; if (c.type === "percent") return (v * 100).toFixed(c.decimals) + "%"; if (c.type === "text") return String(v); if (c.type === "integer") return Math.round(v).toLocaleString("en-US"); if (c.unit && c.unit.prefix !== undefined) return money(v, cur, u); return (+v).toFixed(c.unit.decimals); }); }
    var sheets = [], hasPrev = !!this.prevModel, hasOff = Array.isArray(d.official) && d.official.length;
    var hc = [int("Rank"), txt("Area"), num("Centre latitude", 4), num("Centre longitude", 4), mon("Insured value within " + o.radius + " km"), pc("Share of limit"), mon("Over (+) or below (−) limit"), int("Locations inside"), mon("Largest location")]
      .concat(hasPrev ? [mon("Previous date"), mon("Change")] : []).concat(hasOff ? [mon("Official figure")] : []);
    var hr = m.hotspots.map(function (h, i) {
      var prev = hasPrev ? self.prevModel.sumAt(h.lon, h.lat).sum : null, off = hasOff ? self._official(h) : null;
      return [i + 1, h.name, h.lat, h.lon, h.sum, h.sum / o.limit, h.sum - o.limit, h.n, h.largest].concat(hasPrev ? [prev, h.sum - prev] : []).concat(hasOff ? [off ? +off.value : null] : []);
    });
    sheets.push({ name: "Worst areas", columns: hc, rows: hr, text: hr.map(function (r) { return textRow(hc, r); }), flag: m.hotspots.map(function (h) { return h.sum > o.limit; }) });
    var sel = this.getSelection();
    if (sel) {
      var sc = [txt("Spot"), num("Latitude", 4), num("Longitude", 4), mon("Insured value within " + o.radius + " km"), pc("Share of limit"), int("Locations inside"), mon("Largest location")].concat(hasPrev ? [mon("Previous date")] : []);
      var sr = [[sel.name, sel.lat, sel.lon, sel.value, sel.shareOfLimit, sel.locations, sel.largest].concat(hasPrev ? [sel.previous] : [])];
      sheets.push({ name: "Selected event", columns: sc, rows: sr, text: sr.map(function (r) { return textRow(sc, r); }), flag: [sel.value > o.limit] });
    }
    if (typeof document !== "undefined") {
      var ab = this.areaByLevel(), ac = [txt("Level (share of limit)"), txt("Colour"), num("Land area, km²", 0), pc("Share of land")];
      var ar = ab.levels.map(function (lv, i) { return [lv + "% or more", self.getTheme().bands[i], Math.round(ab.km2[i]), ab.km2[i] / ab.landKm2]; });
      sheets.push({ name: "Area by level", columns: ac, rows: ar, text: ar.map(function (r) { return textRow(ac, r); }), flag: ab.levels.map(function (lv) { return lv >= 100; }) });
    }
    var names = {}; o.perils.forEach(function (p) { if (p.bit) names[p.bit] = p.label; });
    var lc = [txt("Location"), num("Latitude", 4), num("Longitude", 4), mon("Insured value"), txt("Perils"), txt("In selected event")], L = m.L, lr = [], selc = this._list && this._list[0];
    for (var i = 0; i < L.n; i++) {
      if (!(L.val[i] > 0) || (m.bit && !(L.mask[i] & m.bit))) continue;
      var pr = []; for (var b in names) if (L.mask[i] & +b) pr.push(names[b]);
      var nm = d.locations[i] && d.locations[i].name ? d.locations[i].name : "L" + (i + 1);
      lr.push([nm, L.lat[i], L.lon[i], L.val[i], pr.join(", "), selc && hav(selc.lon, selc.lat, L.lon[i], L.lat[i]) <= o.radius ? "Yes" : "No"]);
    }
    sheets.push({ name: "Locations", columns: lc, rows: lr, text: lr.map(function (r) { return textRow(lc, r); }) });
    var ind = [["Insured value (" + (m.peril.key === "all" ? "all perils" : m.peril.label) + ")", m.total, money(m.total, cur, u)], ["Locations", m.used, m.used.toLocaleString("en-US")],
      ["Event radius (km)", o.radius, o.radius + " km"], ["Accumulation limit", o.limit, money(o.limit, cur, u, true)],
      ["Worst area", null, m.hotspots[0] ? m.hotspots[0].name : "–"], ["Worst event value", m.hotspots[0] ? m.hotspots[0].sum : null, m.hotspots[0] ? money(m.hotspots[0].sum, cur, u) : "–"],
      ["Worst event share of limit", m.hotspots[0] ? m.hotspots[0].sum / o.limit : null, m.hotspots[0] ? pctTxt(m.hotspots[0].pct) : "–"],
      ["Worst areas over the limit", m.hotspots.filter(function (h) { return h.sum > o.limit; }).length, String(m.hotspots.filter(function (h) { return h.sum > o.limit; }).length) + " of " + m.hotspots.length],
      ["Locations outside the map", m.outside, String(m.outside)]];
    sheets.push({ name: "Indicators", columns: [txt("Measure"), num("Value", 4), txt("Shown as")], rows: ind, text: ind.map(function (r) { return [r[0], r[1] == null ? "–" : (+r[1]).toFixed(4), r[2]]; }) });
    var notes = (o.annotations || []).map(function (a, i2) { return [String(i2 + 1), self._annotationLabel(a), a.text || ""]; });
    if (notes.length) sheets.push({ name: "Notes", columns: [txt("No."), txt("Where"), txt("Note")], rows: notes, text: notes });
    return {
      title: d.title || "Exposure accumulation map", subtitle: d.subtitle || "", summary: this.describe(), library: "Veyforma Exposure Accumulation Map " + VERSION, sheets: sheets,
      meta: [["Unit", cur + " " + (u === "m" ? "millions" : u === "bn" ? "billions" : u === "k" ? "thousands" : "units")], ["Peril", m.peril.label], ["Event radius", o.radius + " km"], ["Limit", money(o.limit, cur, u, true)],
        ["As of", d.asOf], ["Compared with", hasPrev ? (d.previousLabel || "previous date") : null],
        ["Method", "Insured value within the radius of every point (great-circle distance, Earth radius 6,371.0088 km); worst areas found on a " + o.cell + "-unit grid and re-measured exactly; map bands smoothed for display only"],
        ["Boundaries", d.basemap.source], ["Data source", d.source]].filter(function (p) { return p[1] != null && p[1] !== ""; })
    };
  };
  Chart.prototype._annotationPoint = function (a) {
    var m = this._compute(), ll = null;
    if (a && isFinite(a.lon) && isFinite(a.lat)) ll = [a.lon, a.lat];
    else if (a && a.area) { var ar = (this.options.data.areas || []).filter(function (x) { return x[0] === a.area; })[0]; if (ar) ll = [ar[1], ar[2]]; }
    if (!ll) return null;
    var q = m.P.fwd(ll[0], ll[1]), vb = this._vb || [0, 0, 1600, 900];
    if (q[0] < vb[0] || q[1] < vb[1] || q[0] > vb[0] + vb[2] || q[1] > vb[1] + vb[3]) return null;
    return { x: q[0], y: q[1], inside: false };
  };
  Chart.prototype._annotationTarget = function (evt) {
    var m = this._compute(), ll;
    if (!evt) { if (!this.selected) return null; ll = [this.selected.lon, this.selected.lat]; }
    else { var p = this._toMap(evt); if (!this._onMap(p[0], p[1])) return null; ll = m.P.inv(p[0], p[1]); }
    var na = nearestArea(this.options.data.areas || [], ll[0], ll[1]);
    return { lon: Math.round(ll[0] * 1000) / 1000, lat: Math.round(ll[1] * 1000) / 1000, area: na.name && na.km < 160 ? na.name : undefined };
  };
  Chart.prototype._annotationLabel = function (a) {
    if (!a) return ""; if (a.label) return String(a.label);
    if (a.area && !isFinite(a.lon)) return String(a.area);
    var near = a.area || nearestArea(this.options.data.areas || [], a.lon, a.lat).name;
    return (near ? "Near " + near + " " : "") + "(" + (+a.lat).toFixed(2) + ", " + (+a.lon).toFixed(2) + ")";
  };

  /* ======================================================================
     9. PUBLIC API
     ====================================================================== */
  var API = {
    version: VERSION,
    /** Draws the chart inside a container element or CSS selector. */
    create: function (target, options) { return new Chart(target, options); },
    /** Works out the surface and the worst areas without drawing (works in Node). */
    compute: function (data, options) { return compute(data, options); },
    /** Exact insured value within radiusKm of [lon, lat] for a computed model. */
    sumAt: function (model, lon, lat, radiusKm) { return sumAt(model, lon, lat, radiusKm); },
    /** Great-circle distance in km. */
    distance: function (lon1, lat1, lon2, lat2) { return hav(lon1, lat1, lon2, lat2); },
    /** The basemap projection: { fwd(lon, lat) → [x, y], inv(x, y) → [lon, lat] }. */
    projection: function (basemap) { return projOf(basemap); },
    listThemes: function () { return Object.keys(THEMES); },
    getTheme: function (t) { return resolveTheme(t || "veyforma", DEFAULT_OPTIONS.thresholds); },
    registerTheme: function (name, theme) { THEMES[name] = theme && theme.extends ? assign({}, THEMES[theme.extends] || {}, theme) : theme; return API; },
    defaults: { options: DEFAULT_OPTIONS, labels: DEFAULT_LABELS, theme: BASE_THEME },
    formatMoney: money
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.VeyAccumulation = API;
})(typeof window !== "undefined" ? window : this);
