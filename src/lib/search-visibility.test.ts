import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_SIGNAL, robotsPolicy, robotsText } from "./robots-policy";
import { isRefusedCrawler } from "./ua";

test("search and Gemini crawlers can discover public pages while private paths remain excluded", () => {
  const rules = robotsPolicy().rules;
  assert.ok(Array.isArray(rules));
  for (const agent of ["Googlebot", "Googlebot-Image", "Google-Extended", "bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]) {
    assert.equal(isRefusedCrawler(agent), false, agent);
    const rule = rules.find(r => Array.isArray(r.userAgent) && r.userAgent.includes(agent));
    assert.ok(rule, agent);
    assert.ok(Array.isArray(rule.allow) && rule.allow.includes("/"));
    for (const path of ["/cart", "/checkout", "/account", "/admin", "/studio", "/order/", "/api/"]) {
      assert.ok(Array.isArray(rule.disallow) && rule.disallow.includes(path), `${agent}: ${path}`);
    }
    assert.ok(rule.allow.includes("/api/brand/"), "Public favicon must be crawlable");
    assert.ok(rule.allow.includes("/api/agent"), "Public agent catalogue must be crawlable");
  }
  assert.equal(isRefusedCrawler("GPTBot"), true);
  assert.equal(isRefusedCrawler("ClaudeBot"), true);
});


test("filter combinations stop crawling without blocking pagination or merchant variants", () => {
  const rules = robotsPolicy().rules;
  assert.ok(Array.isArray(rules));
  const rule = rules.find(r => Array.isArray(r.userAgent) && r.userAgent.includes("Googlebot"))!;
  assert.ok(Array.isArray(rule.disallow));
  const blocked = (path: string) => (rule.disallow as string[]).some(pattern => {
    const expression = pattern.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${expression}`).test(path);
  });
  for (const path of ["/collections/autograph?tag=Teen&tag=Geometric&child=1", "/collections/wall-art?page=2&sort=featured", "/collections/wall-art?signature=1"]) assert.equal(blocked(path), true, path);
  for (const path of ["/collections/wall-art", "/collections/wall-art?page=2", "/products/aa-0040?w=4&h=6&material=smooth-matt"]) assert.equal(blocked(path), false, path);
});

test("robots publishes search and grounding content signals without granting training", () => {
  const text = robotsText();
  assert.match(text, new RegExp(`Content-Signal: ${CONTENT_SIGNAL}`));
  assert.match(text, /search=yes/);
  assert.match(text, /ai-input=yes/);
  assert.match(text, /ai-train=no/);
  assert.match(text, /use=reference/);
  assert.match(text, /User-Agent: Google-Extended\n[\s\S]*?Allow: \/api\/agent/);
});
