// The room picker and the shoppable sections must name the same space the
// same way.
//
// This file exists because the drift it guards is SILENT. /office and
// /hospitality each sell a named space ("Boardroom & cabins") off a scene key,
// while the Studio picker showed that same scene as "Discussion room". Nothing
// broke: whoever uploads a design simply could not find the chip for the page
// they were making imagery for, and the space quietly stayed unillustrated. A
// renamed section with no matching rename here fails these.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_BY_KEY, SPACE_CATEGORIES } from "./studio-scenes";
import { WORKSPACES } from "@/content/workspaces";
import { HOSPITALITY_SPACES } from "@/content/hospitality";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { RETAIL_SPACES } from "@/content/retail";
import { HEALTHCARE_SPACES } from "@/content/healthcare";

test("every workspace and hospitality space has a scene, named identically", () => {
  for (const s of [...WORKSPACES, ...HOSPITALITY_SPACES, ...REAL_ESTATE_SPACES, ...RETAIL_SPACES, ...HEALTHCARE_SPACES]) {
    const scene = SCENARIO_BY_KEY.get(s.sceneKey);
    assert.ok(scene, `${s.slug} points at scene "${s.sceneKey}", which does not exist`);
    assert.equal(scene.label, s.label, `${s.slug}: the picker calls it "${scene.label}"`);
  }
});

test("the office and hospitality scenes sit in the section they are sold under", () => {
  for (const w of WORKSPACES) {
    assert.equal(SCENARIO_BY_KEY.get(w.sceneKey)?.spaceCategory, "Office & Corporate", w.slug);
  }
  for (const h of HOSPITALITY_SPACES) {
    assert.equal(SCENARIO_BY_KEY.get(h.sceneKey)?.spaceCategory, "Hospitality", h.slug);
  }
  for (const r of REAL_ESTATE_SPACES) {
    assert.equal(SCENARIO_BY_KEY.get(r.sceneKey)?.spaceCategory, "Residential Amenities", r.slug);
  }
  for (const r of RETAIL_SPACES) {
    assert.equal(SCENARIO_BY_KEY.get(r.sceneKey)?.spaceCategory, "Retail", r.slug);
  }
  for (const h of HEALTHCARE_SPACES) {
    assert.equal(SCENARIO_BY_KEY.get(h.sceneKey)?.spaceCategory, "Healthcare", h.slug);
  }
});

// A space page's grid is a hard filter on ITS OWN scene key. Two spaces
// sharing one would silently show the same renders under two names — the
// mistake /hospitality's header warns about, where a hotel lobby must never
// borrow the office `reception` shot.
test("no two shoppable spaces share a scene key", () => {
  const seen = new Map<string, string>();
  for (const s of [...WORKSPACES, ...HOSPITALITY_SPACES, ...REAL_ESTATE_SPACES, ...RETAIL_SPACES, ...HEALTHCARE_SPACES]) {
    const clash = seen.get(s.sceneKey);
    assert.equal(clash, undefined, `${s.slug} and ${clash} both render "${s.sceneKey}"`);
    seen.set(s.sceneKey, s.slug);
  }
});

// Every real-estate space resolves a collection by handle for its "see all"
// link, and the scenario that fills it must name the same one — a mismatch is
// a 404 on a page that otherwise looks fine.
test("every union-model section agrees with its scene on the collection", () => {
  for (const r of [...REAL_ESTATE_SPACES, ...RETAIL_SPACES, ...HEALTHCARE_SPACES]) {
    assert.equal(SCENARIO_BY_KEY.get(r.sceneKey)?.collection, r.collectionHandle, r.slug);
    assert.deepEqual(SCENARIO_BY_KEY.get(r.sceneKey)?.roomTags, [r.tag], r.slug);
  }
});

test("no scene names a space category the picker will not render", () => {
  for (const s of SCENARIO_BY_KEY.values()) {
    if (!s.spaceCategory) continue;
    assert.ok(SPACE_CATEGORIES.includes(s.spaceCategory), `${s.key}: ${s.spaceCategory}`);
  }
});
