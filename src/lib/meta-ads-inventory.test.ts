import { test } from "node:test";
import assert from "node:assert/strict";
import { metaPages, metaInventory } from "./meta-ads-inventory";

test("inventory reads every page on Graph without putting credentials in URLs", async () => {
  const urls: URL[] = [];
  const read = (async (input, init) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
    return Response.json(urls.length === 1
      ? { data: [{ id: "zero-spend-active" }], paging: { next: "https://untrusted.invalid/?access_token=secret", cursors: { after: "second" } } }
      : { data: [{ id: "boosted-post" }] });
  }) as typeof fetch;
  assert.deepEqual(await metaPages("act_1/ads", "id", "secret", read), [{ id: "zero-spend-active" }, { id: "boosted-post" }]);
  assert.equal(urls[1].searchParams.get("after"), "second");
});

test("a failed later page is not returned as a complete account", async () => {
  let count = 0;
  const read = (async () => ++count === 1
    ? Response.json({ data: [{ id: "one" }], paging: { next: "next", cursors: { after: "two" } } })
    : new Response("token-sensitive-error", { status: 403 })) as typeof fetch;
  await assert.rejects(metaPages("act_1/ads", "id", "secret", read), /HTTP 403/);
});

test("repeated pagination cursors fail visibly", async () => {
  const read = (async () => Response.json({ data: [], paging: { next: "next", cursors: { after: "same" } } })) as typeof fetch;
  await assert.rejects(metaPages("act_1/ads", "id", "secret", read), /pagination did not finish/);
});

test("one failed account preserves another account and flags untracked accounts", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.META_ADS_TOKEN;
  const previousIds = process.env.META_AD_ACCOUNT_ID;
  process.env.META_ADS_TOKEN = "test";
  process.env.META_AD_ACCOUNT_ID = "1,2";
  globalThis.fetch = (async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("me/adaccounts")) return Response.json({ data: [{ id: "act_1" }, { id: "act_2" }, { id: "act_3", name: "Untracked" }] });
    if (path.endsWith("act_1/ads")) return Response.json({ data: [{ id: "ad1", name: "Boost", effective_status: "ACTIVE" }] });
    return new Response(null, { status: 403 });
  }) as typeof fetch;
  try {
    const report = await metaInventory();
    assert.equal(report.accounts[0].ads?.[0].id, "ad1");
    assert.equal(report.accounts[1].ads, null);
    assert.match(report.accounts[1].error!, /403/);
    assert.deepEqual(report.untrackedAccounts, [{ id: "act_3", name: "Untracked" }]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.META_ADS_TOKEN; else process.env.META_ADS_TOKEN = previousToken;
    if (previousIds === undefined) delete process.env.META_AD_ACCOUNT_ID; else process.env.META_AD_ACCOUNT_ID = previousIds;
  }
});
