#!/usr/bin/env node
// Can ChatGPT and the other assistants actually read the shop?
//
// Fetches the LIVE site as each assistant's crawler identifies itself and
// fails on anything that would keep the store out of their answers:
//   - robots.txt not inviting the search and user-fetch crawlers (or inviting
//     the training crawlers we decided to refuse — docs/ai-assistant-visibility.md in Zyvorah.com)
//   - llms.txt missing or missing the facts it exists to state
//   - the sitemap missing products
//   - a product page that needs JavaScript to show its name, has no canonical,
//     or has no schema.org Product with a real price, currency and availability
//   - a collection page whose product links are not in the HTML
//   - the OpenAI product feed missing, empty, malformed, or refusing too much
//
// Usage: node scripts/verify-ai-visibility.mjs [origin]   (default https://mimipip.com)
// No dependencies; run after every deploy (deploy.yml).

const ORIGIN = (process.argv[2] || "https://mimipip.com").replace(/\/$/, "");

const UA = {
  "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot",
  "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
  "Claude-User": "Mozilla/5.0 (compatible; Claude-User/1.0; +https://www.anthropic.com)",
  PerplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Perplexity-User": "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};
const TRAINING = ["GPTBot", "ClaudeBot", "CCBot"];
const FEED_REQUIRED = ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"];

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => notes.push(`ok  ${msg}`);

async function get(path, agent = "OAI-SearchBot") {
  const url = path.startsWith("http") ? path : ORIGIN + path;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA[agent] ?? agent }, redirect: "follow" });
      return { status: res.status, headers: res.headers, text: await res.text(), url: res.url };
    } catch (e) {
      if (attempt >= 2) return { status: 0, headers: new Headers(), text: String(e), url };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/** robots.txt groups: [{agents:[...], allow:[...], disallow:[...]}] */
function robotsGroups(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (/^user-agent$/i.test(key)) {
      if (!lastWasAgent) groups.push((cur = { agents: [], allow: [], disallow: [] }));
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (/^allow$/i.test(key)) cur.allow.push(value);
      if (/^disallow$/i.test(key)) cur.disallow.push(value);
    }
  }
  return groups;
}
const groupFor = (groups, agent) =>
  groups.find((g) => g.agents.includes(agent.toLowerCase())) ?? groups.find((g) => g.agents.includes("*"));

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      for (const x of Array.isArray(d) ? d : [d]) {
        out.push(x);
        if (Array.isArray(x["@graph"])) out.push(...x["@graph"]);
      }
    } catch {
      fail(`unparseable JSON-LD block: ${m[1].slice(0, 80)}`);
    }
  }
  return out;
}
const visibleText = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

// ── robots.txt ────────────────────────────────────────────────────────────
const robots = await get("/robots.txt");
if (robots.status !== 200) fail(`robots.txt answered ${robots.status}`);
const groups = robotsGroups(robots.text);
for (const agent of Object.keys(UA)) {
  const g = groupFor(groups, agent);
  const blocked = !g || g.disallow.includes("/") || !g.allow.includes("/");
  if (blocked) fail(`robots.txt does not invite ${agent}`);
  else if (["/products/", "/collections/", "/feeds/", "/llms.txt"].some((p) => g.disallow.some((d) => d && p.startsWith(d))))
    fail(`robots.txt disallows a public path for ${agent}`);
}
for (const agent of TRAINING) {
  const g = groupFor(groups, agent);
  if (!g || !g.disallow.includes("/")) fail(`robots.txt no longer refuses training crawler ${agent} (decision: refuse — see docs/ai-assistant-visibility.md in Zyvorah.com)`);
}
if (!/^Sitemap:\s*https?:\/\/\S+/im.test(robots.text)) fail("robots.txt names no sitemap");
ok(`robots.txt: ${Object.keys(UA).length} assistant/search crawlers invited, ${TRAINING.length} training crawlers refused`);

// Every invited crawler must actually be served (a WAF or bot rule can 403 a
// crawler robots.txt invites — that is the silent failure this catches).
for (const agent of Object.keys(UA)) {
  const r = await get("/", agent);
  if (r.status !== 200) fail(`homepage answered ${r.status} to ${agent}`);
}
ok("homepage served to every invited crawler");

// ── llms.txt ──────────────────────────────────────────────────────────────
const llms = await get("/llms.txt");
if (llms.status !== 200) fail(`llms.txt answered ${llms.status}`);
else {
  for (const [label, re] of [
    ["H1 title", /^# \S/m],
    ["blockquote summary", /^> \S/m],
    ["where to buy", /where to buy/i],
    ["pricing unit", /per square foot|per sq ft/i],
    ["minimum order", /minimum/i],
    ["delivery", /deliver/i],
    ["OpenAI feed link", /\/feeds\/openai-products\.jsonl/],
  ]) if (!re.test(llms.text)) fail(`llms.txt is missing its ${label}`);
  ok(`llms.txt (${llms.text.length} chars)`);
}

// ── sitemap ───────────────────────────────────────────────────────────────
const sm = await get("/sitemap.xml");
const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const products = locs.filter((u) => /\/products\/[^/?#]+\/?$/.test(u)).map((u) => u.replace(/\/$/, ""));
const collections = locs.filter((u) => /\/collections\/[^/?#]+\/?$/.test(u)).map((u) => u.replace(/\/$/, ""));
if (sm.status !== 200) fail(`sitemap.xml answered ${sm.status}`);
if (products.length < 50) fail(`sitemap lists only ${products.length} product pages`);
if (collections.length < 1) fail(`sitemap lists only ${collections.length} collection pages`);
ok(`sitemap: ${products.length} products, ${collections.length} collections`);

// ── product pages, as each assistant ──────────────────────────────────────
const pick = (list, n) => {
  const step = Math.max(1, Math.floor(list.length / n));
  return list.filter((_, i) => i % step === 0).slice(0, n);
};
const pageAgents = ["OAI-SearchBot", "ChatGPT-User", "Claude-User", "PerplexityBot"];
for (const [i, url] of pick(products, 4).entries()) {
  const agent = pageAgents[i % pageAgents.length];
  const r = await get(url, agent);
  const where = `${url.replace(ORIGIN, "")} as ${agent}`;
  if (r.status !== 200) { fail(`${where}: HTTP ${r.status}`); continue; }
  const canonical = r.text.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
  if (canonical !== url) fail(`${where}: canonical is ${canonical ?? "missing"}`);
  const product = jsonLd(r.text).find((x) => x["@type"] === "Product");
  if (!product) { fail(`${where}: no schema.org Product`); continue; }
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const price = Number(offers?.price ?? offers?.lowPrice);
  if (!product.name || !product.image || product.brand?.name !== "MimiPip") fail(`${where}: Product lacks name, image or brand`);
  if (!offers || !(price > 0) || !/^[A-Z]{3}$/.test(offers.priceCurrency ?? "") || !offers.availability)
    fail(`${where}: Product offer lacks a price, currency or availability`);
  // Server-rendered: the product's own name is in the HTML a crawler gets
  // without running any script.
  if (!visibleText(r.text).includes(product.name)) fail(`${where}: product name not in server-rendered text`);
  else if (offers) ok(`${where}: Product ${offers.priceCurrency} ${price}, ${String(offers.availability).split("/").pop()}`);
}

// ── collection pages ──────────────────────────────────────────────────────
for (const url of pick(collections, Math.min(2, collections.length))) {
  const r = await get(url, "OAI-SearchBot");
  const links = new Set([...r.text.matchAll(/href="(?:https:\/\/mimipip\.com)?\/products\/([^"?#]+)/g)].map((m) => m[1]));
  if (r.status !== 200) fail(`${url}: HTTP ${r.status}`);
  else if (links.size < 4) fail(`${url}: only ${links.size} product links in server HTML`);
  else if (!jsonLd(r.text).some((x) => x["@type"] === "CollectionPage" || x["@type"] === "ItemList")) fail(`${url}: no CollectionPage/ItemList data`);
  else ok(`${url.replace(ORIGIN, "")}: ${links.size} product links in HTML`);
}

// ── OpenAI product feed ───────────────────────────────────────────────────
for (const [path, currency] of [["/feeds/openai-products.jsonl", "USD"], ["/feeds/openai-products.jsonl?country=IN", "INR"]]) {
  const r = await get(path, "OAI-SearchBot");
  if (r.status !== 200) { fail(`${path}: HTTP ${r.status}`); continue; }
  const lines = r.text.split("\n").filter(Boolean);
  let bad = 0;
  const ids = new Set();
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { bad++; continue; }
    const missing = FEED_REQUIRED.filter((f) => typeof row[f] !== "string" || !row[f]);
    if (missing.length || !row.price.endsWith(` ${currency}`) || ids.has(row.item_id)) bad++;
    ids.add(row.item_id);
  }
  const refused = Number(r.headers.get("x-feed-refused") ?? 0);
  if (lines.length < 50) fail(`${path}: only ${lines.length} rows`);
  if (bad) fail(`${path}: ${bad} rows malformed, duplicated, or not priced in ${currency}`);
  if (refused > lines.length * 0.1) fail(`${path}: the check refused ${refused} rows against ${lines.length} sent — see ?report=1`);
  if (lines.length >= 50 && !bad) ok(`${path}: ${lines.length} rows in ${currency}, ${refused} refused`);
}

console.log(notes.join("\n"));
if (failures.length) {
  console.error(`\nFAIL ${failures.length} problem(s) on ${ORIGIN}:\n- ` + failures.join("\n- "));
  process.exit(1);
}
console.log(`\nPASS ${ORIGIN}: assistants can read the shop.`);
