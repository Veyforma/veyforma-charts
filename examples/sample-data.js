/*!
 * Sample data for the Veyforma Charts examples.
 * Every name and figure is invented for illustration ("Illustrative sample data").
 * Generated from fixed seeds, so every load gives the same figures.
 * MIT License. Copyright (c) 2026 Veyforma.
 */
(function (root) {
  "use strict";

  // Small seeded random number generator (mulberry32) and a normal draw.
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function normal(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pick(r, weights) { var x = r() * weights.total, i = 0; while (x > weights.cum[i]) i++; return i; }
  function cumulate(w) { var cum = [], s = 0; w.forEach(function (v) { s += v; cum.push(s); }); return { cum: cum, total: s }; }
  function round(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }

  /* ------------------------------------------------------------------
     1. Exposure heatmap: a fictional bank's corporate loan book.
     ------------------------------------------------------------------ */
  var SECTORS = ["Commercial real estate", "Energy", "Utilities", "Manufacturing", "Retail", "Technology", "Transport", "Healthcare", "Agriculture", "Financial services"];
  var SECTOR_W = [17, 10, 8, 14, 9, 11, 7, 8, 4, 12];
  var COUNTRIES = ["United Kingdom", "Germany", "France", "Netherlands", "Spain", "Italy", "United States", "Poland"];
  var COUNTRY_W = [24, 17, 13, 9, 8, 7, 16, 6];
  var RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"];
  var RATING_W = [3, 9, 22, 34, 20, 9, 3];

  // Loan-level records: { sector, country, rating, value } in USD m.
  // A deliberate hot spot: UK commercial real estate carries extra weight.
  function loanRecords(n, seed) {
    var r = rng(seed || 7), s = cumulate(SECTOR_W), c = cumulate(COUNTRY_W), g = cumulate(RATING_W);
    var scale = 4200 / n * 1.0, out = new Array(n);
    for (var i = 0; i < n; i++) {
      var si = pick(r, s), ci = pick(r, c), gi = pick(r, g);
      var v = Math.exp(0.9 * normal(r)) * scale;
      if (si === 0 && ci === 0) v *= 3.2;           // concentration: UK CRE
      if (si === 1 && ci === 6) v *= 1.8;           // US energy
      out[i] = { sector: SECTORS[si], country: COUNTRIES[ci], rating: RATINGS[gi], value: v };
    }
    return out;
  }

  var heatmap = {
    title: "Corporate loan exposure by sector",
    subtitle: "Fictional European bank, USD m",
    prefix: "$", suffix: "m", decimals: 0,
    records: loanRecords(6000, 7),
    rows: "sector", columns: "country",
    dimensions: {
      sector: { label: "Sector" },
      country: { label: "Country" },
      rating: { label: "Rating", order: RATINGS, ordered: true }
    },
    limit: { share: 0.08 }
  };

  /* ------------------------------------------------------------------
     2. Risk-factor tornado: a fictional multi-asset macro book.
     ------------------------------------------------------------------ */
  function t(label, group, unit, shock, delta, gamma) { return { key: label, label: label, group: group, unit: unit, shock: shock, delta: delta, gamma: gamma || 0 }; }
  function rv(label, group, unit, shock, down, up) { return { key: label, label: label, group: group, unit: unit, shockDown: -shock, shockUp: shock, down: down, up: up }; }
  var factors = [
    t("USD 10Y rate", "Rates", "bp", 25, -0.064, 0.0006),
    t("EUR 10Y rate", "Rates", "bp", 25, 0.041, 0.0003),
    t("USD 2Y rate", "Rates", "bp", 25, 0.022, 0),
    t("GBP 10Y rate", "Rates", "bp", 25, -0.018, 0.0001),
    t("S&P 500", "Equity", "%", 10, 0.142, -0.0045),
    t("Euro Stoxx 50", "Equity", "%", 10, 0.071, -0.0021),
    t("Nikkei 225", "Equity", "%", 10, -0.038, 0),
    rv("VIX", "Volatility", "vol pts", 5, 0.21, -0.64),
    rv("EUR/USD", "FX", "%", 5, -0.48, 0.39),
    rv("USD/JPY", "FX", "%", 5, 0.27, -0.31),
    t("Brent crude", "Commodities", "%", 20, -0.009, -0.0006),
    t("Gold", "Commodities", "%", 10, 0.035, 0),
    t("US IG credit spread", "Credit", "bp", 20, -0.019, 0.0002),
    t("EUR HY credit spread", "Credit", "bp", 50, -0.006, 0.00004)
  ];
  function total(side) {
    return factors.reduce(function (a, f) {
      if (f.delta == null) return a + f[side];
      var s = side === "down" ? -f.shock : f.shock; return a + f.delta * s + 0.5 * f.gamma * s * s;
    }, 0);
  }
  var tornado = {
    title: "P&L sensitivity – Multi-asset macro book",
    subtitle: "±25 bp rates, ±10% equity, ±5% FX; one factor at a time",
    unit: "USD m", prefix: "$", suffix: "m", decimals: 2,
    asOf: "2026-10-30", limit: 1.5,
    correlation: { within: 0.7, across: 0.25 },
    joint: { down: round(total("down") - 0.42, 2), up: round(total("up") + 0.18, 2) },
    factors: factors
  };

  /* ------------------------------------------------------------------
     3. P&L attribution: a fictional credit trading desk, 260 days.
     ------------------------------------------------------------------ */
  var DATES = (function () {
    var out = [], d = new Date(Date.UTC(2026, 9, 30));
    while (out.length < 260) { var w = d.getUTCDay(); if (w !== 0 && w !== 6) out.unshift(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 86400000); }
    return out;
  })();
  // model: "good" (small noise), "noise" (a proxy: extra noise), "lag" (stale prices), "missing" (not in the risk model)
  function desk(seed, rho, spec) {
    var r = rng(seed), n = DATES.length, m = [], i;
    for (i = 0; i < n; i++) m.push(normal(r));
    return spec.map(function (f) {
      var hpl = [], rtpl = [], prev = 0;
      for (var k = 0; k < n; k++) {
        var s = Math.sqrt(rho) * m[k] + Math.sqrt(1 - rho) * normal(r);
        var h = f.vol * f.sign * s, q;
        if (f.model === "noise") q = h + f.amount * f.vol * normal(r);
        else if (f.model === "lag") q = (1 - f.amount) * h + f.amount * prev + 0.05 * f.vol * normal(r);
        else q = h + 0.04 * f.vol * normal(r);
        prev = h; hpl.push(round(h, 4)); rtpl.push(round(q, 4));
      }
      return { key: f.label, label: f.label, group: f.group, hpl: hpl, rtpl: f.model === "missing" ? null : rtpl };
    });
  }
  var pla = {
    title: "P&L attribution – Credit trading desk",
    subtitle: "Front-office HPL vs risk model RTPL by risk factor",
    unit: "USD m", prefix: "$", suffix: "m", decimals: 2, asOf: "2026-10-30",
    dates: DATES,
    factors: desk(23, 0.4, [
      { label: "US IG index (CDX IG)", group: "Index spreads", vol: 0.30, sign: 1 },
      { label: "EUR IG index (iTraxx Main)", group: "Index spreads", vol: 0.24, sign: 1 },
      { label: "US HY index (CDX HY)", group: "Index spreads", vol: 0.14, sign: -1 },
      { label: "Single-name spreads", group: "Single names", vol: 0.24, sign: 1, model: "noise", amount: 1.8 },
      { label: "Index-to-single-name basis", group: "Basis", vol: 0.13, sign: -1, model: "lag", amount: 0.6 },
      { label: "UST 5Y", group: "Rates", vol: 0.10, sign: -1 },
      { label: "UST 10Y", group: "Rates", vol: 0.12, sign: 1 },
      { label: "Recovery rates", group: "Recovery", vol: 0.05, sign: 1, model: "missing" }
    ])
  };

  /* ------------------------------------------------------------------
     4. Debt maturity ladder: a fictional logistics group.
     ------------------------------------------------------------------ */
  // Equal instalments every `months` months from `first` to `last` (inclusive).
  function instalments(first, last, months, amount) {
    var out = [], d = new Date(first + "T00:00:00Z"), end = new Date(last + "T00:00:00Z");
    while (d <= end) {
      out.push({ date: d.toISOString().slice(0, 10), amount: amount });
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0));
    }
    return out;
  }
  var debtLadder = {
    title: "Aldermoor Logistics – debt maturities",
    subtitle: "Bonds, term loans and the revolver",
    company: "Aldermoor Logistics (fictional)",
    asOf: "2026-10-31", unit: "EUR m", prefix: "€", suffix: "m", decimals: 0,
    source: "Illustrative sample data",
    cash: 120, cashFlow: 55,
    refinanceRate: { "Bond": 0.0475, "Term loan": 0.056, "Revolver": 0.05, "default": 0.052 },
    facilities: [
      { name: "Commercial paper", type: "Commercial paper", amount: 60, maturity: "2027-01-29", coupon: 0.034, rateType: "Floating" },
      { name: "Term loan A", type: "Term loan", amount: 180, maturity: "2028-03-31", coupon: 0.047, rateType: "Floating", lender: "Bank syndicate",
        amortisation: instalments("2026-12-31", "2027-12-31", 3, 10) },
      { name: "Bond 2028", type: "Bond", amount: 350, maturity: "2028-06-15", coupon: 0.01625, rateType: "Fixed" },
      { name: "Fleet financing", type: "Lease", amount: 70, maturity: "2030-12-31", coupon: 0.051, rateType: "Fixed",
        amortisation: instalments("2027-06-30", "2030-06-30", 6, 7) },
      { name: "Revolver (€300m)", type: "Revolver", amount: 45, limit: 300, maturity: "2029-09-30", coupon: 0.045, rateType: "Floating",
        lender: "Club of 5 banks", extension: { years: 1 } },
      { name: "Schuldschein 2029", type: "Private placement", amount: 90, maturity: "2029-11-15", coupon: 0.0285, rateType: "Fixed" },
      { name: "Green bond 2031", type: "Bond", amount: 300, maturity: "2031-04-10", coupon: 0.03375, rateType: "Fixed" },
      { name: "Bond 2034", type: "Bond", amount: 250, maturity: "2034-09-22", coupon: 0.04125, rateType: "Fixed" }
    ]
  };

  /* ------------------------------------------------------------------
     5. Exposure accumulation map: a fictional coastal property insurer.
     ------------------------------------------------------------------ */
  // Each cluster: [name, lon, lat, spread in degrees, share of locations, perils (1 wind, 2 flood, 4 quake), value multiplier]
  var CLUSTERS = [
    ["Miami", -80.2, 25.8, 0.18, 9, 3, 1.5], ["Fort Lauderdale", -80.14, 26.12, 0.12, 6, 3, 1.4],
    ["West Palm Beach", -80.05, 26.71, 0.12, 4, 3, 1.2], ["Tampa", -82.46, 27.95, 0.2, 6, 3, 1.1],
    ["Orlando", -81.38, 28.54, 0.25, 5, 1, 0.8], ["Jacksonville", -81.66, 30.33, 0.2, 4, 3, 0.8],
    ["Houston", -95.37, 29.76, 0.3, 9, 3, 1.2], ["Galveston", -94.8, 29.3, 0.1, 2, 3, 1],
    ["New Orleans", -90.07, 29.95, 0.15, 5, 3, 1.1], ["Mobile", -88.04, 30.69, 0.15, 2, 3, 0.8],
    ["Charleston", -79.93, 32.78, 0.12, 3, 3, 0.9], ["Norfolk", -76.29, 36.85, 0.15, 3, 3, 0.8],
    ["New York", -74.0, 40.71, 0.25, 8, 3, 1.3], ["Boston", -71.06, 42.36, 0.15, 3, 1, 1],
    ["Los Angeles", -118.24, 34.05, 0.3, 9, 4, 1.3], ["San Diego", -117.16, 32.72, 0.15, 3, 4, 1],
    ["San Francisco", -122.42, 37.77, 0.15, 5, 4, 1.4], ["San Jose", -121.89, 37.34, 0.12, 3, 4, 1.2],
    ["Seattle", -122.33, 47.61, 0.15, 3, 4, 0.9], ["Chicago", -87.63, 41.88, 0.25, 4, 0, 0.9],
    ["Dallas", -96.8, 32.78, 0.25, 3, 0, 0.8], ["Atlanta", -84.39, 33.75, 0.2, 3, 0, 0.8]
  ];
  function accumulationLocations(n, seed) {
    var r = rng(seed || 41), w = cumulate(CLUSTERS.map(function (c) { return c[4]; })), out = [];
    for (var i = 0; i < n; i++) {
      var c = CLUSTERS[pick(r, w)], s = c[3];
      var lon = c[1] + normal(r) * s * 1.2, lat = c[2] + normal(r) * s;
      var value = Math.exp(0.8 * normal(r)) * 2.2 * c[6];
      out.push([round(lon, 3), round(lat, 3), round(value, 2), c[5]]);
    }
    return out;
  }
  var accumulation = {
    title: "Harbourline Mutual – property accumulation",
    subtitle: "Insured value one event could hit, as a share of the limit",
    areas: CLUSTERS.map(function (c) { return [c[0], c[1], c[2]]; }),
    locations: accumulationLocations(4000, 41)
  };

  root.VeyformaSamples = { heatmap: heatmap, loanRecords: loanRecords, tornado: tornado, pla: pla, debtLadder: debtLadder, accumulation: accumulation };
})(typeof window !== "undefined" ? window : this);
