// The collab invite must reach Instagram on the path posts actually take.
// Weekly approval means nearly every post is published by publishApproved,
// not by compose — and until 27 Sep 2026 that path sent no collaborators, so
// approved Taash posts went out on our grid alone.
//
//   npx tsx --test src/lib/marketing/collab-publish.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { approvedRequest } from "./pipeline";
import { InstagramPublisher } from "./publish/instagram";

const ROW = {
  format: "carousel",
  caption: "Jodi. A heart and a spade sit together in red.",
  media_urls: ["https://example.test/1.jpg", "https://example.test/2.jpg"],
  thumbnail_url: null,
  share_to_feed: true,
};

test("an approved post carries its collection's collaborators", () => {
  const req = approvedRequest(ROW, ["stylemati", "fatimakpunjaabi"]);
  assert.deepEqual(req.collaborators, ["stylemati", "fatimakpunjaabi"]);
  // The approved words are posted exactly — nothing appended at publish time.
  assert.equal(req.caption, ROW.caption);
});

test("an approved post with no partner sends no collaborator field", () => {
  assert.equal(approvedRequest(ROW, []).collaborators, undefined);
});

/** A fake Graph API: records every POST body, refuses collaborators if told to. */
function fakeGraph(refuseCollab: boolean) {
  const posts: URLSearchParams[] = [];
  let n = 0;
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: URLSearchParams }) => {
    if (init?.method === "POST") {
      const body = new URLSearchParams(init.body);
      posts.push(body);
      if (refuseCollab && body.has("collaborators")) {
        return new Response(JSON.stringify({ error: { message: "Invalid collaborators: user cannot be tagged" } }), { status: 400 });
      }
      return new Response(JSON.stringify({ id: `m${++n}` }), { status: 200 });
    }
    return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
  }) as typeof fetch;
  return posts;
}

test("the invite reaches Instagram on the carousel container", async () => {
  process.env.IG_BUSINESS_ACCOUNT_ID = "123";
  process.env.IG_ACCESS_TOKEN = "test-token";
  const posts = fakeGraph(false);
  const res = await new InstagramPublisher().publish(approvedRequest(ROW, ["stylemati"]));
  assert.equal(res.ok, true);
  const parent = posts.find((b) => b.get("media_type") === "CAROUSEL");
  assert.equal(parent?.get("collaborators"), JSON.stringify(["stylemati"]));
});

test("a refused invite does not cost the post", async () => {
  process.env.IG_BUSINESS_ACCOUNT_ID = "123";
  process.env.IG_ACCESS_TOKEN = "test-token";
  fakeGraph(true);
  const res = await new InstagramPublisher().publish(approvedRequest(ROW, ["stylemati"]));
  assert.equal(res.ok, true, res.error);
  assert.match(res.note ?? "", /without the collab/);
});
