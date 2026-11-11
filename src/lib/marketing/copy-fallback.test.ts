import { test } from "node:test";
import assert from "node:assert/strict";
import { FallbackWriter } from "./providers/copy";

// The 27 Sep 2026 failure: the copywriting account had no credits, so the
// caption lane threw and nothing could be composed. A credit refusal must
// degrade to the other writer, exactly as a missing key already did — and a
// real bug must still surface rather than being swallowed as "no credit".
const backup = { name: "anthropic/test", write: async () => "a caption" };

test("an out-of-credit refusal falls through to the backup writer", async () => {
  const w = new FallbackWriter(
    {
      name: "primary/test",
      write: async () => {
        throw new Error('openai 429: {"error":{"message":"You have no credits remaining."}}');
      },
    },
    backup,
  );
  assert.equal(await w.write("s", "u"), "a caption");
});

test("any other failure still surfaces", async () => {
  const w = new FallbackWriter(
    {
      name: "primary/test",
      write: async () => {
        throw new Error("openai 400: bad request");
      },
    },
    backup,
  );
  await assert.rejects(() => w.write("s", "u"), /400/);
});

test("Instagram captions spend only Instagram's own keys, never a shared one", async () => {
  const { instagramCopyWriter, INSTAGRAM_KEYS } = await import("./providers/copy");
  // 9 Oct 2026: every shared key was blocked; Instagram gets keys of its own.
  const shared = { ANTHROPIC_API_KEY: "shared", OPENAI_API_KEY: "shared" };
  const none = instagramCopyWriter(shared);
  assert.equal(none.name, "instagram/no-key", "a shared key is never a fallback");
  await assert.rejects(() => none.write("s", "u"), new RegExp(INSTAGRAM_KEYS.anthropic));
  assert.match(instagramCopyWriter({ ...shared, [INSTAGRAM_KEYS.anthropic]: "ig" }).name, /^anthropic\//);
  assert.match(instagramCopyWriter({ [INSTAGRAM_KEYS.openai]: "ig" }).name, /^openai\//);
});
