import { parseFragment } from "parse5";

// A deliberately small, static SVG dialect. Never pass provider XML directly to
// a browser or rasterizer: reconstruct a new document from these allowlists.
export const vectorSvgLimits = Object.freeze({ bytes: 16 * 1024 * 1024, nodes: 60000, depth: 48, edge: 16384, pixels: 64000000 });
const svgNamespace = "http://www.w3.org/2000/svg";
const xlinkNamespace = "http://www.w3.org/1999/xlink";
const shapes = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);
const elements = new Set([...shapes, "svg", "g", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "pattern", "tspan", "title", "desc"]);
const paintElements = new Set(["linearGradient", "radialGradient", "pattern"]);
const numeric = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const numberToken = new RegExp(numeric, "g");
const idPattern = /^[A-Za-z_][A-Za-z0-9_.:-]{0,159}$/;
const numericAttrs = new Set(["x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr", "width", "height", "dx", "dy", "opacity", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-miterlimit", "stroke-dashoffset", "stop-opacity", "offset", "font-size", "letter-spacing", "word-spacing", "textLength", "pathLength"]);
const presentationAttrs = new Set(["fill", "stroke", "color", "stop-color", "fill-opacity", "stroke-opacity", "opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "clip-path", "mask", "stop-opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing", "visibility", "display", "vector-effect", "paint-order", "shape-rendering"]);
const attrs = new Set([...numericAttrs, ...presentationAttrs, "id", "version", "viewBox", "preserveAspectRatio", "d", "points", "transform", "gradientTransform", "patternTransform", "gradientUnits", "spreadMethod", "clipPathUnits", "maskUnits", "maskContentUnits", "patternUnits", "patternContentUnits", "href", "lengthAdjust", "rotate"]);
const enumValues = {
  "fill-rule": ["nonzero", "evenodd"], "clip-rule": ["nonzero", "evenodd"],
  "stroke-linecap": ["butt", "round", "square"], "stroke-linejoin": ["miter", "round", "bevel", "miter-clip", "arcs"],
  gradientUnits: ["userSpaceOnUse", "objectBoundingBox"], patternUnits: ["userSpaceOnUse", "objectBoundingBox"],
  patternContentUnits: ["userSpaceOnUse", "objectBoundingBox"], clipPathUnits: ["userSpaceOnUse", "objectBoundingBox"],
  maskUnits: ["userSpaceOnUse", "objectBoundingBox"], maskContentUnits: ["userSpaceOnUse", "objectBoundingBox"],
  spreadMethod: ["pad", "reflect", "repeat"], "text-anchor": ["start", "middle", "end"],
  "font-style": ["normal", "italic", "oblique"], "vector-effect": ["none", "non-scaling-stroke"],
  visibility: ["visible", "hidden", "collapse"], display: ["inline", "none"],
  lengthAdjust: ["spacing", "spacingAndGlyphs"], "shape-rendering": ["auto", "optimizeSpeed", "crispEdges", "geometricPrecision"]
};

function invalid(reason) {
  return Object.assign(new Error(`The vector output could not be safely opened: ${reason}. No active SVG content was saved.`), { status: 422 });
}
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
function finiteNumbers(value) {
  for (const match of value.matchAll(numberToken)) if (!Number.isFinite(Number(match[0])) || Math.abs(Number(match[0])) > 1e9) throw invalid("a numeric value is out of range");
}
function numberList(value, allowUnits = false) {
  const token = allowUnits ? `${numeric}(?:px|%)?` : numeric;
  if (!new RegExp(`^${token}(?:[ ,]+${token})*$`).test(value)) throw invalid("an unsupported numeric attribute was returned");
  finiteNumbers(value);
}
function safeColor(value) {
  if (/^#[0-9a-f]{3,8}$/i.test(value) && [4, 5, 7, 9].includes(value.length)) return true;
  if (/^[A-Za-z]{1,32}$/.test(value)) return true;
  if (/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(value)) { finiteNumbers(value); return true; }
  return false;
}

export function sanitizeVectorSvg(input, { allowEmpty = false } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : typeof input === "string" ? Buffer.from(input) : null;
  if (!bytes?.length || bytes.length > vectorSvgLimits.bytes) throw invalid("the SVG is empty or exceeds 16 MB");
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw invalid("the SVG is not valid UTF-8"); }
  // XML declarations are harmless metadata; all other processing instructions,
  // DTDs, entities, CDATA and foreign doctypes are forbidden before parsing.
  source = source.replace(/^\s*<\?xml\s+version=["']1\.[01]["'](?:\s+encoding=["']UTF-8["'])?(?:\s+standalone=["'](?:yes|no)["'])?\s*\?>/i, "");
  if (/<\?|<!\s*(?!-\-)/.test(source) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw invalid("XML declarations or control characters are not supported");
  // Bound allocation before parse5 builds its tree. This conservative lexical
  // cap also counts apparent markup inside comments; it never grants validity.
  let markupCount = 0;
  for (let index = source.indexOf("<"); index >= 0; index = source.indexOf("<", index + 1)) {
    if (source[index + 1] !== "/" && ++markupCount > vectorSvgLimits.nodes) throw invalid("the SVG is too complex");
  }
  const document = parseFragment(source, { onParseError: () => { throw invalid("the SVG markup is malformed"); } });
  const roots = document.childNodes.filter(node => node.nodeName !== "#comment" && !(node.nodeName === "#text" && !node.value.trim()));
  if (roots.length !== 1 || roots[0].tagName !== "svg") throw invalid("one SVG root is required");
  let nodeCount = 0, shapeCount = 0, rootValues;
  const ids = new Map(), references = [], graph = new Map();
  function visit(node, depth = 0, ancestorIds = [], parentTag = "") {
    if (++nodeCount > vectorSvgLimits.nodes || depth > vectorSvgLimits.depth) throw invalid("the SVG is too complex");
    if (node.nodeName === "#comment") return "";
    if (node.nodeName === "#text") {
      if (["text", "tspan", "title", "desc"].includes(parentTag)) return escapeXml(node.value);
      if (!node.value.trim()) return "";
      throw invalid("unexpected text outside a text shape");
    }
    const tag = node.tagName;
    if (node.namespaceURI !== svgNamespace || !elements.has(tag) || (tag === "svg" && depth !== 0)) throw invalid(`unsupported element ${tag || "unknown"}`);
    if (shapes.has(tag)) shapeCount++;
    const values = new Map(), declarations = new Map();
    for (const attribute of node.attrs || []) {
      const { name, value: rawValue, prefix, namespace } = attribute;
      const value = rawValue.replace(/[\t\r\n]/g, " ");
      if (name === "xmlns" && !prefix) {
        if (depth || value !== svgNamespace) throw invalid("an unexpected namespace was returned");
        continue;
      }
      if (prefix === "xmlns" && name === "xlink" && !depth && value === xlinkNamespace) continue;
      if (prefix && !(prefix === "xlink" && name === "href" && namespace === xlinkNamespace)) throw invalid("foreign attributes are not supported");
      if (name === "style") {
        for (const declaration of value.split(";")) {
          if (!declaration.trim()) continue;
          const separator = declaration.indexOf(":"), property = declaration.slice(0, separator).trim(), val = declaration.slice(separator + 1).trim();
          if (separator < 1 || !presentationAttrs.has(property) || !val || declarations.has(property)) throw invalid("unsupported inline styles");
          declarations.set(property, val);
        }
      } else {
        if (!attrs.has(name)) throw invalid(`unsupported attribute ${name}`);
        values.set(name, value.trim());
      }
    }
    // CSS inline declarations override presentation attributes in ordinary SVG.
    for (const [name, value] of declarations) values.set(name, value);
    const id = values.get("id");
    if (id) {
      if (!idPattern.test(id) || ids.has(id)) throw invalid("duplicate or unsupported shape IDs");
      ids.set(id, tag); ancestorIds = [...ancestorIds, id];
    }
    function reference(value, kind) {
      const match = value.match(/^url\(\s*["']?#([A-Za-z_][A-Za-z0-9_.:-]{0,159})["']?\s*\)$/);
      if (!match) throw invalid("only local shape references are supported");
      const target = match[1];
      references.push({ target, kind });
      for (const owner of ancestorIds) {
        if (!graph.has(owner)) graph.set(owner, new Set());
        graph.get(owner).add(target);
      }
      return `url(#${target})`;
    }
    for (const [name, value] of values) {
      if (name === "id") continue;
      if (!value || /[\\<>\u0000-\u001f]/.test(value)) throw invalid(`unsupported value for ${name}`);
      if (name === "version") { if (depth || !["1.0", "1.1", "2.0"].includes(value)) throw invalid("unsupported SVG version"); }
      else if (numericAttrs.has(name)) numberList(value, true);
      else if (["fill", "stroke", "color", "stop-color"].includes(name)) {
        if (/^url/i.test(value)) values.set(name, reference(value, "paint"));
        else if (!safeColor(value)) throw invalid("an unsupported paint value was returned");
      } else if (["clip-path", "mask"].includes(name)) {
        if (value !== "none") values.set(name, reference(value, name));
      } else if (name === "href") {
        if (!["linearGradient", "radialGradient"].includes(tag) || !idPattern.test(value.slice(1)) || !value.startsWith("#")) throw invalid("external or unsupported references are not allowed");
        reference(`url(${value})`, "gradient");
      } else if (name === "viewBox") {
        numberList(value);
        if (value.split(/[ ,]+/).length !== 4) throw invalid("the viewBox is invalid");
      } else if (name === "d") {
        if (tag !== "path" || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(value)) throw invalid("unsupported path geometry");
        finiteNumbers(value);
      } else if (["points", "rotate"].includes(name)) numberList(value);
      else if (["transform", "gradientTransform", "patternTransform"].includes(name)) {
        const operations = value.match(/(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^()]*\)/g);
        if (!operations || value.replace(/(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^()]*\)/g, "").replace(/[\s,]/g, "")) throw invalid("unsupported transforms");
        for (const operation of operations) numberList(operation.slice(operation.indexOf("(") + 1, -1).trim());
      } else if (name === "stroke-dasharray") { if (value !== "none") numberList(value, true); }
      else if (name === "font-family") {
        if (!/^[A-Za-z0-9 _,'"-]{1,240}$/.test(value)) throw invalid("unsupported font family");
      } else if (name === "font-weight") {
        if (!/^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/.test(value)) throw invalid("unsupported font weight");
      } else if (name === "dominant-baseline") {
        if (!/^(?:auto|alphabetic|middle|central|hanging|text-after-edge|text-before-edge|ideographic|mathematical)$/.test(value)) throw invalid("unsupported text alignment");
      } else if (name === "preserveAspectRatio") {
        if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value)) throw invalid("unsupported aspect alignment");
      } else if (name === "paint-order") {
        if (value !== "normal" && !/^(?:fill|stroke|markers)(?:\s+(?:fill|stroke|markers)){0,2}$/.test(value)) throw invalid("unsupported paint order");
      } else if (!enumValues[name]?.includes(value)) throw invalid(`unsupported value for ${name}`);
    }
    if (depth === 0) rootValues = values;
    const serialized = [...values].map(([name, value]) => ` ${name}="${escapeXml(value)}"`).join("");
    const children = (node.childNodes || []).map(child => visit(child, depth + 1, ancestorIds, tag)).join("");
    return `<${tag}${depth === 0 ? ` xmlns="${svgNamespace}"` : ""}${serialized}>${children}</${tag}>`;
  }
  const svg = visit(roots[0]);
  if (!shapeCount && !allowEmpty) throw invalid("no editable shapes were returned");
  for (const { target, kind } of references) {
    const tag = ids.get(target);
    if (!tag || (kind === "paint" && !paintElements.has(tag)) || (kind === "gradient" && !["linearGradient", "radialGradient"].includes(tag))
      || (kind === "clip-path" && tag !== "clipPath") || (kind === "mask" && tag !== "mask")) throw invalid("a local shape reference is missing or unsupported");
  }
  const visiting = new Set(), checked = new Set();
  function checkCycle(id) {
    if (visiting.has(id)) throw invalid("circular shape references are unsupported");
    if (checked.has(id)) return;
    if (visiting.size >= vectorSvgLimits.depth) throw invalid("shape references are too deeply nested");
    visiting.add(id);
    for (const target of graph.get(id) || []) checkCycle(target);
    visiting.delete(id); checked.add(id);
  }
  for (const id of graph.keys()) checkCycle(id);
  const box = (rootValues.get("viewBox") || "").trim().split(/[ ,]+/).map(Number);
  const viewBox = box.length === 4 && box.every(Number.isFinite) ? box : null;
  const dimension = value => typeof value === "string" && new RegExp(`^${numeric}(?:px)?$`).test(value) ? Number(value.replace(/px$/, "")) : null;
  const width = dimension(rootValues.get("width")) ?? viewBox?.[2], height = dimension(rootValues.get("height")) ?? viewBox?.[3];
  if (!width || !height || width < 1 || height < 1 || width > vectorSvgLimits.edge || height > vectorSvgLimits.edge || width * height > vectorSvgLimits.pixels
    || (viewBox && (viewBox[2] <= 0 || viewBox[3] <= 0))) throw invalid("bounded positive dimensions or a viewBox are required");
  return { svg, width, height, viewBox: viewBox || [0, 0, width, height], shapeCount };
}
