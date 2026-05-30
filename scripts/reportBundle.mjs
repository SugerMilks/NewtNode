import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = path.resolve("dist");
const assetsDir = path.join(distDir, "assets");
const indexPath = path.join(distDir, "index.html");

const indexHtml = await readFile(indexPath, "utf8").catch(() => "");

if (!indexHtml) {
  console.error("No dist/index.html found. Run npm run build first.");
  process.exitCode = 1;
} else {
  const refs = collectIndexAssetRefs(indexHtml);
  const rows = [await bundleRow(indexPath, "document")];
  const assets = await readdir(assetsDir);

  for (const asset of assets.sort((a, b) => a.localeCompare(b))) {
    const assetPath = path.join(assetsDir, asset);
    const kind = refs.get(asset) || "lazy/generated";
    rows.push(await bundleRow(assetPath, kind));
  }

  const initialKinds = new Set(["document", "entry script", "entry style", "modulepreload"]);
  const initialRows = rows.filter((row) => initialKinds.has(row.kind));
  const lazyRows = rows.filter((row) => !initialKinds.has(row.kind));

  printTable("Initial shell assets", initialRows);
  printTable("Lazy/generated assets", lazyRows);
  printTotals(rows, initialRows, lazyRows);
}

function collectIndexAssetRefs(html) {
  const refs = new Map();
  const tagPattern = /<(script|link)\b[^>]*(?:src|href)="\/assets\/([^"]+)"[^>]*>/gi;
  let match = tagPattern.exec(html);

  while (match) {
    const [, tag, file] = match;
    const rawTag = match[0];
    if (tag.toLowerCase() === "script") {
      refs.set(file, "entry script");
    } else if (/rel="stylesheet"/i.test(rawTag)) {
      refs.set(file, "entry style");
    } else if (/rel="modulepreload"/i.test(rawTag)) {
      refs.set(file, "modulepreload");
    } else {
      refs.set(file, "index ref");
    }
    match = tagPattern.exec(html);
  }

  return refs;
}

async function bundleRow(filePath, kind) {
  const bytes = await readFile(filePath);
  const info = await stat(filePath);
  return {
    file: path.relative(distDir, filePath).replace(/\\/g, "/"),
    kind,
    bytes: info.size,
    gzipBytes: gzipSync(bytes).length
  };
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log("| File | Kind | Size | Gzip |");
  console.log("| --- | --- | ---: | ---: |");
  for (const row of rows) {
    console.log(`| ${row.file} | ${row.kind} | ${formatKb(row.bytes)} | ${formatKb(row.gzipBytes)} |`);
  }
}

function printTotals(rows, initialRows, lazyRows) {
  console.log("\nTotals");
  console.log(`- Initial shell: ${formatKb(sumBytes(initialRows, "bytes"))} (${formatKb(sumBytes(initialRows, "gzipBytes"))} gzip)`);
  console.log(`- Lazy/generated: ${formatKb(sumBytes(lazyRows, "bytes"))} (${formatKb(sumBytes(lazyRows, "gzipBytes"))} gzip)`);
  console.log(`- All assets: ${formatKb(sumBytes(rows, "bytes"))} (${formatKb(sumBytes(rows, "gzipBytes"))} gzip)`);
}

function sumBytes(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
