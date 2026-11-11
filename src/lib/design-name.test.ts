import { test } from "node:test";
import assert from "node:assert/strict";
import { ilikeLiteral, nameCandidates } from "@/lib/design-name";

// HomeLane designers copy a design off zyvorah.com and paste it into the
// portal. Whatever they copied must name that one design.

test("a pasted product URL is that design's handle and nothing else", () => {
  assert.deepEqual(
    nameCandidates("https://zyvorah.com/products/sage-cranes-chinoiserie?variant=1#reviews"),
    { handles: ["sage-cranes-chinoiserie"], title: null, code: null },
  );
  assert.deepEqual(nameCandidates("zyvorah.com/products/Kamdhenu-Grove").handles, ["kamdhenu-grove"]);
});

test("a pasted title tries its handle with and without the website's suffix", () => {
  const c = nameCandidates("  Sage Cranes Chinoiserie Wallpaper\n");
  assert.equal(c.title, "Sage Cranes Chinoiserie Wallpaper");
  assert.ok(c.handles.includes("sage-cranes-chinoiserie-wallpaper"));
  assert.ok(c.handles.includes("sage-cranes-chinoiserie"));
  assert.equal(c.code, null);
});

test("copy-paste punctuation does not change the name", () => {
  const c = nameCandidates("Monsoon’s Edge – Mural");
  assert.equal(c.title, "Monsoon's Edge - Mural");
  assert.ok(c.handles.includes("monsoons-edge-mural"));
  assert.ok(c.handles.includes("monsoons-edge"));
});

test("a single token may be a design code", () => {
  assert.equal(nameCandidates("ZV-0142").code, "ZV-0142");
});

test("empty input names nothing", () => {
  assert.deepEqual(nameCandidates("   "), { handles: [], title: null, code: null });
});

test("ilike wildcards in a name are matched literally", () => {
  assert.equal(ilikeLiteral("100% Linen_Look"), "100\\% Linen\\_Look");
});
