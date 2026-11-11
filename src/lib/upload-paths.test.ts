// The storage key decides what an upload can overwrite, and `product-images`
// holds every live catalogue image. So these are not formatting preferences: a
// path that escapes its folder is a signed write over someone's hero shot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUploadPath } from "./upload-paths";

const ok = (r: ReturnType<typeof buildUploadPath>) => {
  assert.ok(!("error" in r), `expected a path, got ${JSON.stringify(r)}`);
  return r as { path: string; upsert: boolean };
};

test("a studio flat keeps its content address — the dedup key every layer matches on", () => {
  const hash = "a".repeat(24);
  const r = ok(buildUploadPath({ kind: "studio-flat", ext: "png", hash }));
  assert.equal(r.path, `studio-uploads/${hash}.png`);
  // Same bytes must always land on the same URL, so overwriting is correct here.
  assert.equal(r.upsert, true);
});

test("a new admin design can never overwrite an existing key", () => {
  const r = ok(buildUploadPath({ kind: "admin-design", ext: "jpg", folder: "midnight-bloom" }));
  assert.match(r.path, /^midnight-bloom\/\d+-[a-z0-9]+\.jpg$/);
  assert.equal(r.upsert, false);
});

test("studio pictures get a unique path — two designs can both have IMG_1234.jpg", () => {
  const a = ok(buildUploadPath({ kind: "studio-picture", ext: "jpg" }));
  const b = ok(buildUploadPath({ kind: "studio-picture", ext: "jpg" }));
  assert.notEqual(a.path, b.path);
  for (const r of [a, b]) assert.ok(r.path.startsWith("studio-uploads/"));
});

test("nothing escapes its folder", () => {
  const escapes: unknown[] = [
    { kind: "admin-design", ext: "jpg", folder: "../../evil" },
    { kind: "admin-design", ext: "jpg", folder: "a/b" },
    { kind: "admin-design", ext: "jpg", folder: "/absolute" },
    { kind: "admin-design", ext: "jpg", folder: ".." },
    { kind: "admin-design", ext: "jpg", folder: "-leading-dash" },
    { kind: "studio-flat", ext: "png", hash: "../../../etc/passwd" },
    { kind: "studio-flat", ext: "png", hash: "AAAA" },              // too short
    { kind: "studio-flat", ext: "png", hash: "z".repeat(24) },      // not hex
    { kind: "studio-flat", ext: "../x", hash: "a".repeat(24) },
    { kind: "studio-picture", ext: "png/../.." },
    { kind: "studio-picture", ext: "" },
  ];
  for (const e of escapes) {
    const r = buildUploadPath(e);
    assert.ok("error" in r, `should have been rejected: ${JSON.stringify(e)}`);
  }
});

test("an unknown kind is refused rather than guessed at", () => {
  for (const k of ["", "print-master", "admin", undefined, null, 42]) {
    const r = buildUploadPath({ kind: k, ext: "png" });
    assert.ok("error" in r, `should have been rejected: kind=${String(k)}`);
  }
  assert.ok("error" in buildUploadPath(null));
  assert.ok("error" in buildUploadPath(undefined));
});

test("every accepted path stays inside a known prefix", () => {
  const accepted = [
    { kind: "studio-flat", ext: "png", hash: "b".repeat(24) },
    { kind: "studio-picture", ext: "jpeg" },
    { kind: "admin-design", ext: "webp", folder: "a" },
  ];
  for (const i of accepted) {
    const { path } = ok(buildUploadPath(i));
    assert.ok(!path.includes(".."), path);
    assert.ok(!path.startsWith("/"), path);
    assert.equal(path.split("/").length, 2, `unexpected depth: ${path}`);
  }
});
