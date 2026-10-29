import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import sharp from "sharp";
import { sanitizeVectorSvg, vectorSvgLimits } from "../server/vector-svg.js";
import { normalizedResultItems, appendResultItems } from "../src/mediaResults.js";

const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const path = '<path d="M0 0L100 0L100 100Z" fill="#3388cc"/>';

test("safe vector fixture retains editable shapes, typography, gradient and clipping and produces nonblank PNG", async () => {
  const input = await readFile(new URL("./fixtures/vector-design.svg", import.meta.url));
  const result = sanitizeVectorSvg(input);
  assert.equal(result.width, 720); assert.equal(result.height, 720);
  assert.deepEqual(result.viewBox, [0, 0, 720, 720]);
  assert.ok(result.shapeCount >= 10);
  assert.match(result.svg, /<path d=/); assert.match(result.svg, /NORTH STAR/);
  assert.match(result.svg, /fill="url\(#sun\)"/); assert.match(result.svg, /clip-path="url\(#badge\)"/);
  assert.deepEqual(sanitizeVectorSvg(result.svg), result, "sanitization is stable on its own safe output");
  const output = await sharp(Buffer.from(result.svg)).png().toBuffer();
  const info = await sharp(output).metadata(), stats = await sharp(output).stats();
  assert.equal(info.width, 720); assert.equal(info.height, 720);
  assert.ok(stats.channels[0].stdev > 20, "actual rendered artwork must have visible color variation");
});

test("safe inline paint declarations become presentation attributes without leaving CSS", async () => {
  const { svg } = sanitizeVectorSvg(wrap('<g style="fill: #112233; stroke: rgb(30,40,50); stroke-width: 2; opacity: .8"><path style="fill: #ff0000" fill="#00ff00" d="M0 0L80 0L80 80Z"/></g>'));
  assert.doesNotMatch(svg, /style=/);
  assert.match(svg, /fill="#ff0000"/);
  assert.doesNotMatch(svg, /#00ff00/);
  assert.ok((await sharp(Buffer.from(svg)).png().toBuffer()).length > 100);
});

test("safe XML declaration, descriptions, decoded entities and local gradient inheritance remain passive", async () => {
  const result = sanitizeVectorSvg(`<?xml version="1.0" encoding="UTF-8"?>${wrap('<title>A &amp; B</title><defs><linearGradient id="a"><stop offset="0" stop-color="#123456"/></linearGradient><linearGradient id="b" href="#a"/></defs><path fill="url(&quot;#b&quot;)" d="M0 0L100 0L100 100Z"/>')}`);
  assert.match(result.svg, /A &amp; B/);
  assert.doesNotMatch(result.svg, /<\?/);
  assert.ok((await sharp(Buffer.from(result.svg)).png().toBuffer()).length > 100);
});

test("retains intentional spaces between editable text spans", () => {
  const { svg } = sanitizeVectorSvg(wrap('<text x="5" y="30"><tspan>NORTH</tspan> <tspan>STAR</tspan></text>'));
  assert.match(svg, /<tspan>NORTH<\/tspan> <tspan>STAR<\/tspan>/);
});

test("normalizes XML attribute whitespace and accepts inert standard root version metadata", async () => {
  const input = '<svg version="1.1" width=" 100 " height="100" viewBox="0\n0\t100 100"><path d="M0 0\nL100 0\tL100 100Z" fill="#00ff00"/></svg>';
  const result = sanitizeVectorSvg(input);
  assert.equal(result.width, 100); assert.equal(result.height, 100);
  assert.match(result.svg, /version="1.1"/);
  assert.doesNotMatch(result.svg, /[\n\t]/);
  assert.equal((await sharp(Buffer.from(result.svg)).metadata()).width, 100);
});

const active = [
  '<script>alert(1)</script>', '<foreignObject><img src="x" onerror="alert(1)"/></foreignObject>',
  '<image href="https://example.invalid/a.png"/>', '<image href="data:image/svg+xml;base64,AAA"/>',
  '<use href="#x"/>', '<a href="javascript:alert(1)">'+path+'</a>',
  '<animate attributeName="href" values="javascript:alert(1)"/>', '<set attributeName="fill" to="red"/>',
  '<path d="M0 0L1 1" onload="alert(1)"/>', '<path d="M0 0L1 1" ONCLICK="alert(1)"/>',
  '<path d="M0 0L1 1" fill="url(https://example.invalid/a.svg#x)"/>',
  '<path d="M0 0L1 1" fill="url(&#104;ttps://example.invalid/a.svg#x)"/>',
  '<path d="M0 0L1 1" style="fill: url(//example.invalid/a.svg)"/>',
  '<path d="M0 0L1 1" style="fill: red; background-image: url(file:///etc/passwd)"/>',
  '<path d="M0 0L1 1" style="fill: var(--x)"/>', '<path d="M0 0L1 1" style="fill: red !important"/>',
  '<path d="M0 0L1 1" style="fill: r\\65 d"/>',
  '<style>@import "https://example.invalid/a.css";</style>', '<style>path{fill:red}</style>',
  '<filter id="f"><feImage href="file:///etc/passwd"/></filter>',
  '<defs><linearGradient id="a" href="https://example.invalid/a.svg#x"/></defs>'+path,
  '<g xml:base="https://example.invalid/">'+path+'</g>',
  '<svg viewBox="0 0 100 100">'+path+'</svg>', '<html><body>'+path+'</body></html>'
];
for (const [index, body] of active.entries()) test(`rejects active or unapproved SVG content #${index + 1}`, () => {
  assert.throws(() => sanitizeVectorSvg(wrap(body)), error => error.status === 422 && /safely opened/.test(error.message));
});

test("rejects DTD/entity expansion, processing instructions, malformed markup and non-UTF8", () => {
  for (const input of [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+wrap('<text>&x;</text>'),
    '<?xml-stylesheet href="https://example.invalid/a.css"?>'+wrap(path),
    '<!DOCTYPE svg SYSTEM "https://example.invalid/a.dtd">'+wrap(path),
    wrap('<![CDATA[<script>alert(1)</script>]]>'+path),
    wrap('<path d="M0 0L1 1" fill="red" fill="blue"/>'),
    wrap(path)+'<script>alert(1)</script>', wrap(path)+'<svg/>',
    Buffer.from([0xff, 0xfe, 0x3c, 0x00]), wrap(path).replace('d="', 'd="\u0000')
  ]) assert.throws(() => sanitizeVectorSvg(input), /safely opened/);
});

test("rejects missing, mismatched, duplicate and circular local references", () => {
  for (const input of [
    '<path d="M0 0L1 1" fill="url(#missing)"/>',
    '<path id="a" d="M0 0L1 1"/><path d="M0 0L1 1" fill="url(#a)"/>',
    '<path id="a" d="M0 0L1 1"/><path id="a" d="M0 0L1 1"/>',
    '<defs><clipPath id="a"><path clip-path="url(#a)" d="M0 0L1 1"/></clipPath></defs>'+path,
    '<defs><linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/></defs>'+path
  ]) assert.throws(() => sanitizeVectorSvg(wrap(input)), /safely opened/);
});

test("bounds document bytes, nesting, node count, numeric values and viewport geometry", () => {
  for (const input of [
    Buffer.alloc(vectorSvgLimits.bytes + 1, 32),
    wrap('<g>'.repeat(vectorSvgLimits.depth + 1)+path+'</g>'.repeat(vectorSvgLimits.depth + 1)),
    wrap('<g/>'.repeat(vectorSvgLimits.nodes)+path),
    wrap('<path d="M1e999 0L1 1"/>'),
    '<svg viewBox="0 0 -100 100">'+path+'</svg>', '<svg width="50000" height="50000">'+path+'</svg>',
    '<svg>'+path+'</svg>', wrap(''), '<svg width="1000000000" height="1">'+path+'</svg>'
  ]) assert.throws(() => sanitizeVectorSvg(input), /safely opened/);
});

test("canonical result operations preserve both vector and preview assets", () => {
  const item = { type: "image", url: "/outputs/vector/preview.png", svgUrl: "/outputs/vector/editable.svg", label: "Logo", shapeCount: 12 };
  assert.deepEqual(normalizedResultItems([item], "", "image")[0], item);
  assert.deepEqual(appendResultItems([], [item], "image")[0], item);
});

test("workflow package collector and rewriter retain editable SVG alongside the canonical PNG", async () => {
  // Exercise the existing recursive package functions without starting the app,
  // reading runtime settings, or copying private project files.
  const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function collectWorkflowAssetUrls("), end = source.indexOf("function rewriteWorkflowPackageAssetReferences(", start);
  assert.ok(start > 0 && end > start);
  const sandbox = { tryLocalPublicPath: value => /^\/(?:outputs|uploads|workflow-assets)\//.test(value) ? value : null };
  vm.runInNewContext(source.slice(start, end), sandbox);
  const item = { type: "image", url: "/outputs/vector/preview.png", svgUrl: "/outputs/vector/editable.svg", alphaUrl: "/outputs/vector/alpha.png", vectorSourceSvgUrl: "/outputs/vector/original.svg" };
  const graph = { nodes: [{ type: "vector", data: { resultItems: [item], resultUrl: item.url, vectorLayerDrafts: [{ svgUrl: item.svgUrl, operations: [] }] } }] };
  const assets = [item.svgUrl, item.url, item.alphaUrl, item.vectorSourceSvgUrl];
  assert.deepEqual([...sandbox.collectWorkflowAssetUrls(graph)].sort(), assets.sort());
  const urls = new Map(assets.map(url => [url, url.replace("/outputs/vector/", "/workflow-assets/test/outputs/")]));
  const result = sandbox.rewriteWorkflowAssetUrls(graph, urls).nodes[0].data;
  assert.equal(result.resultUrl, urls.get(item.url));
  assert.equal(result.resultItems[0].svgUrl, urls.get(item.svgUrl));
  assert.equal(result.resultItems[0].alphaUrl, urls.get(item.alphaUrl));
  assert.equal(result.resultItems[0].vectorSourceSvgUrl, urls.get(item.vectorSourceSvgUrl));
  assert.equal(result.vectorLayerDrafts[0].svgUrl, urls.get(item.svgUrl));
  assert.equal(graph.nodes[0].data.resultItems[0].svgUrl, item.svgUrl, "packaging never mutates the original graph");
});
