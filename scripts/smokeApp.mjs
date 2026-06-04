const clientUrl = new URL(process.env.NEWT_SMOKE_CLIENT_URL || process.argv[2] || "http://127.0.0.1:5176/");
const apiHealthUrl = new URL(process.env.NEWT_SMOKE_API_URL || process.argv[3] || "http://127.0.0.1:3336/api/health");

const requiredHealthRoutes = [
  "apiJsonErrors",
  "composerFrame",
  "composerPoses",
  "extractVideoFrame",
  "generate3d",
  "utilityImage",
  "utilityVideo"
];

async function main() {
  const html = await fetchText(clientUrl, "client shell", "text/html");
  assert(html.includes('id="root"'), "Client shell did not include the React root element.");

  const assetUrls = discoverShellAssets(html, clientUrl);
  assert(assetUrls.length > 0, "Client shell did not reference any module or stylesheet assets.");
  await Promise.all(assetUrls.map((url) => fetchOk(url, `client asset ${url.pathname}`)));

  const health = await fetchJson(apiHealthUrl, "API health");
  assert(health?.ok === true, "API health did not return ok: true.");
  const missingRoutes = requiredHealthRoutes.filter((route) => health.routes?.[route] !== true);
  assert(!missingRoutes.length, `API health is missing required routes: ${missingRoutes.join(", ")}`);

  console.log(`Smoke OK: ${clientUrl.href} (${assetUrls.length} shell asset${assetUrls.length === 1 ? "" : "s"}) and ${apiHealthUrl.href}`);
}

function discoverShellAssets(html, baseUrl) {
  const assets = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
    assets.add(new URL(match[1], baseUrl).href);
  }
  for (const match of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    if (/\brel="(?:stylesheet|modulepreload)"/i.test(tag)) {
      assets.add(new URL(match[1], baseUrl).href);
    }
  }
  return [...assets].map((url) => new URL(url));
}

async function fetchText(url, label, expectedContentType = "") {
  const response = await fetchOk(url, label);
  const contentType = response.headers.get("content-type") || "";
  if (expectedContentType) {
    assert(contentType.includes(expectedContentType), `${label} returned unexpected content-type: ${contentType || "none"}`);
  }
  return response.text();
}

async function fetchJson(url, label) {
  const response = await fetchOk(url, label);
  return response.json();
}

async function fetchOk(url, label) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${label} could not be reached at ${url.href}: ${error.message}`);
  }
  assert(response.ok, `${label} returned HTTP ${response.status} at ${url.href}`);
  return response;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(`Smoke failed: ${error.message}`);
  process.exitCode = 1;
});
