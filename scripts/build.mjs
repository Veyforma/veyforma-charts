// Builds dist/ from src/ with no dependencies.
//   dist/veyforma-charts.js       every chart, as a plain <script> (browser globals)
//   dist/veyforma-charts.min.js   the same, minified (needs esbuild; skipped if it isn't installed)
//   dist/veyforma-charts.mjs      ES module: import VeyformaCharts from "@veyforma/charts"
//   dist/veyforma-charts.cjs      CommonJS: require("@veyforma/charts")
//   dist/veyforma-heatmap.js …    each chart on its own, as a plain <script>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const CHARTS = ["veyforma-heatmap.js", "veyforma-tornado.js", "veyforma-pla.js", "veyforma-debtladder.js"];
const PARTS = [...CHARTS, "veyforma-charts.js"];
const ROOT_ARG = '(typeof window !== "undefined" ? window : this)';
const banner = `/*! @veyforma/charts v${pkg.version} · MIT License · Copyright (c) 2026 Veyforma · https://github.com/veyforma/veyforma-charts */\n`;

mkdirSync("dist", { recursive: true });
const src = PARTS.map((f) => {
  const s = readFileSync(`src/${f}`, "utf8");
  if (s.split(ROOT_ARG).length !== 2) throw new Error(`${f}: expected exactly one ${ROOT_ARG}`);
  return s;
});

// 1. Browser script: the files one after another.
writeFileSync("dist/veyforma-charts.js", banner + src.join("\n"));

// 2. Modules: in a browser the charts still register on window (so the optional
//    Veyforma Toolkit can find them); elsewhere (server rendering, tests) they use a private object.
const moduleBody = (src) =>
  "var __vfRoot = typeof window !== \"undefined\" ? window : {};\n" +
  src.map((s) => s.replace(ROOT_ARG, "(__vfRoot)")).join("\n") + "\n";
const names = ["VeyformaCharts", "VeyHeatmap", "VeyRiskTornado", "VeyPlaAttribution", "VeyDebtLadder"];
writeFileSync("dist/veyforma-charts.mjs", banner + moduleBody(src) +
  names.map((n) => `export const ${n} = __vfRoot.${n};`).join("\n") +
  "\nexport default __vfRoot.VeyformaCharts;\n");
writeFileSync("dist/veyforma-charts.cjs", banner + moduleBody(src) +
  "module.exports = __vfRoot.VeyformaCharts;\n" +
  names.map((n) => `module.exports.${n} = __vfRoot.${n};`).join("\n") + "\n");

// 3. Each chart on its own.
for (const f of CHARTS) copyFileSync(`src/${f}`, `dist/${f}`);

// 4. Minified bundle, if esbuild is available.
try {
  for (const f of ["veyforma-charts.js", ...CHARTS]) {
    const out = `dist/${f.replace(/\.js$/, ".min.js")}`;
    execFileSync("npx", ["--no-install", "esbuild", `dist/${f}`, "--minify", "--legal-comments=none", "--log-level=warning", `--outfile=${out}`], { stdio: "inherit" });
    writeFileSync(out, banner + readFileSync(out, "utf8"));
  }
} catch {
  console.warn("esbuild not found: skipped dist/veyforma-charts.min.js (run npm install first).");
}
console.log("Built dist/ for v" + pkg.version);
