import test from "node:test";
import assert from "node:assert/strict";
import { cleanCreatorHandle, creatorPlatform, profileUrl } from "./creator-platforms";

test("a YouTube-only creator can apply with a YouTube handle", () => {
  assert.equal(profileUrl("youtube", "aryan"), "https://www.youtube.com/@aryan");
});

test("Pinterest is not a collaboration platform", () => {
  assert.equal(creatorPlatform("pinterest"), "instagram");
});

test("each platform has its own handle shape", () => {
  assert.equal(cleanCreatorHandle("youtube", "@home-by-aryan"), "home-by-aryan");
  assert.equal(cleanCreatorHandle("instagram", "home-by-aryan"), null);
  assert.equal(cleanCreatorHandle("tiktok", "aryan.walls"), "aryan.walls");
  assert.equal(profileUrl("tiktok", "aryan.walls"), "https://www.tiktok.com/@aryan.walls");
  assert.equal(cleanCreatorHandle("tiktok", "has space"), null);
});

test("an unknown or missing platform means Instagram, as every older submission was", () => {
  assert.equal(creatorPlatform(undefined), "instagram");
  assert.equal(creatorPlatform("myspace"), "instagram");
  assert.equal(creatorPlatform("tiktok"), "tiktok");
});
