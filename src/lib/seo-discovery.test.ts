import test from "node:test";
import assert from "node:assert/strict";
import { designDiscoveryLine, productImageAlt, type CleanAttributes } from "./seo";

const attributes: CleanAttributes = {
  subjects: ["Petra Treasury", "Nabataean Architecture"],
  styles: ["Mineral Fresco", "Architectural"],
  rooms: ["Living Room", "Master Bedroom"],
  colours: ["Rose"], moods: ["Serene"], childRooms: false, commercial: false,
};

test("design discovery copy uses reviewed subject, style and room attributes", () => {
  assert.equal(designDiscoveryLine(attributes), "Depicts Petra Treasury, Nabataean Architecture · Mineral Fresco and Architectural style · suited to Living Room and Master Bedroom.");
});

test("image fallback distinguishes flat artwork from a room preview", () => {
  assert.equal(productImageAlt("The Rose Stone Treasury", { is_flat: true }, attributes), "The Rose Stone Treasury — flat wallpaper artwork depicting Petra Treasury and Nabataean Architecture");
  assert.equal(productImageAlt("The Rose Stone Treasury", { scene_key: "primary-bedroom" }, attributes), "The Rose Stone Treasury — wallpaper mural in a master bedroom depicting Petra Treasury and Nabataean Architecture");
});
