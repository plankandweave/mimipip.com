import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, attributionFrom } from "./server-events";
import { isCrawler, isRefusedCrawler, uaFamily } from "./ua";

test("ChatGPT search links and referrers share one source without overwriting explicit campaigns", () => {
  const expected = { source: "chatgpt", medium: "ai-search" };
  assert.deepEqual(classify("", "chatgpt.com"), expected);
  assert.deepEqual(classify("https://chatgpt.com/c/example"), expected);
  assert.deepEqual(classify("https://chat.openai.com/"), expected);
  assert.deepEqual(classify("", "chatgpt", "newsletter"), { source: "chatgpt", medium: "newsletter" });
  assert.equal(classify("https://chatgpt.com.example.org/").medium, "referral");
  assert.equal(classify("", "google", "cpc").medium, "cpc");
  const visit = attributionFrom({ url: "https://zyvorah.com/materials?utm_source=chatgpt.com" });
  assert.equal(visit.source, "chatgpt");
  assert.equal(visit.medium, "ai-search");
  assert.equal(visit.landing, "/materials");
});

test("OpenAI search and user fetchers are tracked as crawlers but remain allowed", () => {
  for (const name of ["OAI-SearchBot", "ChatGPT-User"]) {
    const ua = `Mozilla/5.0 AppleWebKit/537.36 (compatible; ${name}/1.0; +https://openai.com/bot)`;
    assert.equal(isCrawler(ua), true);
    assert.equal(uaFamily(ua), name.toLowerCase());
    assert.equal(isRefusedCrawler(ua), false);
  }
  assert.equal(isCrawler("ChatGPT-User/1.0"), true);
  assert.equal(isRefusedCrawler("GPTBot/1.0"), true);
  assert.equal(isCrawler("Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36"), false);
});
