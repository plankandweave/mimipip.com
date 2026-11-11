import { test } from "node:test";
import assert from "node:assert/strict";
import { religiousIdentity, religionHref } from "./religion";

test("reviewed identities override misleading legacy handles", () => {
  assert.deepEqual(religiousIdentity("vishnu-s-grace", []), { faith: "hinduism", subject: "krishna" });
  assert.deepEqual(religiousIdentity("divine-lotus", []), { faith: "hinduism", subject: "balaji" });
  assert.deepEqual(religiousIdentity("divine-reverie", []), { faith: "hinduism", subject: "shiva" });
});
test("generic spirituality is never assigned to a religion", () => {
  assert.equal(religiousIdentity("lotus-mandala", ["Spiritual", "Indian Ethnic"]), null);
  assert.deepEqual(religiousIdentity("new-calligraphy", ["Religion:islam"]), { faith: "islam", subject: null });
  assert.deepEqual(religiousIdentity("new-ganesha", ["Religion:hinduism", "Deity:ganesha"]), { faith: "hinduism", subject: "ganesha" });
});
test("pagination preserves the selected faith and deity", () => {
  assert.equal(religionHref("hinduism", "krishna", 2), "/wall-art/religion?faith=hinduism&deity=krishna&page=2");
  assert.equal(religionHref(), "/wall-art/religion");
});

test("format pagination stays inside the selected religion", () => {
  assert.equal(religionHref("buddhism", "buddha", 2, "canvas"), "/wall-art/religion?faith=buddhism&deity=buddha&format=canvas&page=2");
});

test("new faith tags preserve distinct identities including Jainism", () => {
  for (const faith of ["zoroastrianism", "judaism", "bahai", "jainism"]) {
    assert.deepEqual(religiousIdentity("lotus", [`Religion:${faith}`, "Deity:sacred-spaces"]),
      { faith, subject: "sacred-spaces" });
  }
});
