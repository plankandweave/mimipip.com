import test from "node:test";
import assert from "node:assert/strict";
import { canvasJourney, canvasBrowseLinks } from "./shopping-journey";

test("canvas identity follows category, not names, and cannot leak onto a different product", () => {
  const page = { path: "/products/joy", canvas: true };
  assert.equal(canvasJourney(page.path, page, []), true);
  assert.equal(canvasJourney("/products/a-wallpaper", page, []), false);
  assert.equal(canvasJourney("/collections/canvas-art", { path: "", canvas: false }, []), true);
});
test("basket identity uses all items; an empty basket retains the originating art journey", () => {
  const page = { path: "/products/joy", canvas: true };
  assert.equal(canvasJourney("/cart", page, [{ category: "canvas" }]), true);
  assert.equal(canvasJourney("/checkout", page, [{ category: "canvas" }, { category: "wallpaper" }]), false);
  assert.equal(canvasJourney("/cart", page, []), true);
});
test("artwork pricing leads to the current selector or canvas catalogue, never wall pricing or samples", () => {
  const links = [{ label: "Price my wall", href: "/wall-price" }, { label: "Samples", href: "/samples" }, { label: "Find My Wallpaper", href: "/design-with" }];
  assert.deepEqual(canvasBrowseLinks(links, true), [{ label: "Choose your artwork", href: "#create-your-wall" }, { label: "Find your artwork", href: "/collections/canvas-art" }]);
  assert.equal(canvasBrowseLinks(links, false)[0].href, "/collections/canvas-art");
  assert.equal(links[0].label, "Price my wall");
});
