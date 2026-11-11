import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { GEN_H, GEN_W, MIN_VOID_OF_H, SEAT_MARGIN_OF_H, darkPanel, darkShare, completionPrompt, completeVoids, mergeVoids, voidChunks, windowFor } from "./band-complete";

// Nelamangala wall 7, 14 October 2026: a one-design wall whose edges painted
// out a toaster and a kettle as two flat bands. Roheena: "This doesn't work.
// The appliance needs to be completed … Astra can always complete the
// appliance with its image generation tool." These pin the mechanics the
// composer relies on: which patches go to the model, what it is shown, what
// it is told, and that only the patch comes back onto the band.

test("voids merge where they touch and are clipped to the band", () => {
  assert.deepEqual(mergeVoids([{ from: 900, to: 1000 }, { from: 0, to: 100 }, { from: 100, to: 150 }, { from: 980, to: 1200 }], 1000),
    [{ from: 0, to: 150 }, { from: 900, to: 1000 }]);
  assert.deepEqual(mergeVoids([{ from: 50, to: 50 }], 1000), []);
});

test("a wide void is filled in chunks the model can see artwork beside", () => {
  const chunks = voidChunks({ from: 0, to: 2000 }, 1000);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.to - c.from <= 750));
  assert.equal(chunks[chunks.length - 1]!.to, 2000);
});

test("the edit window keeps a chunk inside it with the run beside it", () => {
  assert.equal(windowFor({ from: 3400, to: 3937 }, 1152, 3937), 3937 - 1152, "a chunk at the wall's end sits at the window's end");
  assert.equal(windowFor({ from: 0, to: 300 }, 1152, 3937), 0, "a chunk at the wall's start sits at its start");
  assert.equal(windowFor({ from: 1800, to: 2000 }, 1152, 3937), 1900 - 576, "a chunk mid-wall is centred");
  assert.equal(windowFor({ from: 100, to: 200 }, 2000, 1500), 0, "a wall narrower than the window is shown whole");
});

test("the model is told to add a whole appliance on the floor line, and nothing else", () => {
  const p = completionPrompt("retro appliances in a row on a shared ground line", 0.6, 0.845);
  assert.match(p, /one more COMPLETE appliance/);
  assert.match(p, /85% of the way down/);
  assert.match(p, /transparent area ONLY/);
  assert.match(p, /No text, no logos, no people/);
  assert.match(completionPrompt("x", 0.2, null), /plain continuation of the colour panel/);
});

test("completeVoids writes only the patch back, and reports what it could not do", async () => {
  const W = 1200, H = 400;
  // A teal band with a flat olive patch at its right end.
  const band = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 128, b: 128 } } })
    .composite([{ input: await sharp({ create: { width: 200, height: H, channels: 3, background: { r: 120, g: 120, b: 60 } } }).png().toBuffer(), left: 1000, top: 0 }])
    .png().toBuffer();
  const seen: { prompt: string; maskAlpha: { inside: number; outside: number } }[] = [];
  const fake: typeof fetch = async (_url, init) => {
    const form = init!.body as FormData;
    const mask = Buffer.from(await (form.get("mask") as Blob).arrayBuffer());
    const { data, info } = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, GEN_W); assert.equal(info.height, GEN_H);
    const alphaAt = (x: number) => data[(Math.floor(GEN_H / 2) * GEN_W + x) * 4 + 3]!;
    seen.push({ prompt: String(form.get("prompt")), maskAlpha: { inside: alphaAt(GEN_W - 10), outside: alphaAt(10) } });
    // The model "draws" a magenta frame: only its patch may reach the band.
    const png = await sharp({ create: { width: GEN_W, height: GEN_H, channels: 3, background: { r: 255, g: 0, b: 255 } } }).png().toBuffer();
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200 });
  };
  const done = await completeVoids(band, W, H, [{ from: 1000, to: 1200 }, { from: 500, to: 510 }], {
    openaiKey: "k", floorLinePct: 0.8, describe: "test", fetchImpl: fake,
  });
  assert.equal(done.completed, 1);
  assert.equal(done.skipped, 1, `a void narrower than ${MIN_VOID_OF_H} of the height keeps its paint`);
  assert.deepEqual(done.errors, []);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.maskAlpha.inside, 0, "the patch is transparent in the mask");
  assert.equal(seen[0]!.maskAlpha.outside, 255, "the artwork beside it is opaque");
  const px = async (x: number) => {
    const { data } = await sharp(done.buf).extract({ left: x, top: 200, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
  };
  assert.deepEqual(await px(1100), [255, 0, 255], "the patch carries the model's drawing");
  assert.deepEqual(await px(900), [0, 128, 128], "the band beside it is untouched");

  const none = await completeVoids(band, W, H, [{ from: 1000, to: 1200 }], { openaiKey: null, floorLinePct: null, describe: "t" });
  assert.equal(none.completed, 0);
  assert.equal(none.buf, band);
  assert.match(none.errors[0]!, /no OpenAI key/);

  const failing: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 });
  const failed = await completeVoids(band, W, H, [{ from: 1000, to: 1200 }], { openaiKey: "k", floorLinePct: null, describe: "t", fetchImpl: failing });
  assert.equal(failed.completed, 0);
  assert.match(failed.errors[0]!, /answered 500: nope/);
});

// Nelamangala wall 8, 14 October 2026, twice: the model drew the new toaster
// on a black slab. A dark patch is asked again, then kept as the flat paint.
test("a patch painted dark is asked again, then left as the flat colour", async () => {
  const W = 1200, H = 400;
  const band = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 128, b: 128 } } }).png().toBuffer();
  const black = await sharp({ create: { width: GEN_W, height: GEN_H, channels: 3, background: { r: 5, g: 5, b: 5 } } }).png().toBuffer();
  let calls = 0;
  const prompts: string[] = [];
  const fake: typeof fetch = async (_u, init) => {
    calls++;
    prompts.push(String((init!.body as FormData).get("prompt")));
    return new Response(JSON.stringify({ data: [{ b64_json: black.toString("base64") }] }), { status: 200 });
  };
  const done = await completeVoids(band, W, H, [{ from: 1000, to: 1200 }], { openaiKey: "k", floorLinePct: 0.8, describe: "t", fetchImpl: fake });
  assert.equal(calls, 2, "asked once more");
  assert.match(prompts[0]!, /rgb\(0, 128, 128\)/, "the model is told the panel colour");
  assert.match(prompts[1]!, /previous attempt painted the background black/);
  assert.equal(done.completed, 0);
  assert.match(done.errors[0]!, /dark twice/);
  assert.ok((await darkShare(done.buf)) < 0.01, "the band keeps its flat colour, never the black slab");
});

// Nelamangala wall 8, 14 October 2026 (Roheena): "the angle of the right-hand
// side appliances and the left is looking really bad … the right-hand side
// has repetition". Whole-wall mode draws outward from one anchor design,
// each new panel a different appliance at the same straight-on angle.
test("whole-wall mode draws outward from the anchor, never a copy, always straight-on", async () => {
  const { outwardChunks, outwardWindow } = await import("./band-complete");
  const anchor = { from: 1300, to: 2800 };
  const left = outwardChunks({ from: 0, to: 1300 }, 1152, anchor);
  assert.equal(left[0]!.to, 1300, "the left void is filled from the anchor outward");
  assert.equal(left[left.length - 1]!.from, 0);
  assert.ok(left.every((c) => c.side === "left" && c.to - c.from <= 864));
  const right = outwardChunks({ from: 2800, to: 4182 }, 1152, anchor);
  assert.equal(right[0]!.from, 2800);
  assert.equal(outwardWindow(left[0]!, 1152, 4182), left[0]!.from, "a left chunk sits at its window's left end, artwork to its right");
  assert.equal(outwardWindow(right[0]!, 1152, 4182), right[0]!.to - 1152, "a right chunk sits at its window's right end");
  const p = completionPrompt("t", 1, 0.85, { r: 1, g: 2, b: 3 }, false, true);
  assert.match(p, /DIFFERENT kind from every appliance already in the picture/);
  assert.match(p, /straight-on from the front/);
  assert.match(p, /never a copy or a recolour/);
  assert.doesNotMatch(p, /rgb\(1, 2, 3\)/, "a new panel picks its own colour from the palette");
});

// Nelamangala walls 1 and 3, 14 October 2026: the model drew a fridge and a
// washing machine starting left of their panel, and the artwork beside it
// hid their left sides. The appliance is lifted out and seated inside whole.
test("an appliance drawn across its panel's edge is set back inside it whole", async () => {
  const W = 1200, H = 400;
  const band = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 128, b: 128 } } })
    .composite([{ input: await sharp({ create: { width: 200, height: H, channels: 3, background: { r: 120, g: 120, b: 60 } } }).png().toBuffer(), left: 1000, top: 0 }])
    .png().toBuffer();
  // The edit window is the band's last 600 px; the void starts at 400 in it.
  const sx = GEN_W / 600, sy = GEN_H / H;
  const fake: typeof fetch = async (_url, init) => {
    const form = init!.body as FormData;
    const frame = Buffer.from(await (form.get("image") as Blob).arrayBuffer());
    const pink = await sharp({ create: { width: Math.round(200 * sx), height: GEN_H, channels: 3, background: { r: 240, g: 150, b: 150 } } }).png().toBuffer();
    // A cream fridge, 100 px wide, its left 30 px over the teal artwork.
    const fridge = await sharp({ create: { width: Math.round(100 * sx), height: Math.round(220 * sy), channels: 3, background: { r: 235, g: 225, b: 190 } } }).png().toBuffer();
    const png = await sharp(frame).composite([
      { input: pink, left: Math.round(400 * sx), top: 0 },
      { input: fridge, left: Math.round(370 * sx), top: Math.round(100 * sy) },
    ]).png().toBuffer();
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200 });
  };
  const done = await completeVoids(band, W, H, [{ from: 1000, to: 1200 }], { openaiKey: "k", floorLinePct: 0.8, describe: "t", fetchImpl: fake });
  assert.equal(done.completed, 1);
  const { data } = await sharp(done.buf).extract({ left: 0, top: 200, width: W, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cream: number[] = [];
  for (let x = 0; x < W; x++) if (data[x * 3]! > 220 && data[x * 3 + 1]! > 210 && data[x * 3 + 2]! > 170) cream.push(x);
  assert.ok(cream.length >= 95, `the whole fridge is shown (${cream.length} px)`);
  const m = Math.round(H * SEAT_MARGIN_OF_H);
  assert.ok(cream[0]! >= 1000 + m - 1 && cream.at(-1)! <= 1200 - m, `the fridge sits inside its panel with a margin (${cream[0]}–${cream.at(-1)})`);
  assert.deepEqual([...data.subarray(990 * 3, 990 * 3 + 3)], [0, 128, 128], "the artwork beside it is untouched");
  const at1003 = [...data.subarray(1003 * 3, 1003 * 3 + 3)];
  assert.ok([240, 150, 150].every((v, i) => Math.abs(v - at1003[i]!) <= 6), `the panel's edge is its own colour, not a sliced fridge (${at1003})`);
});

// Nelamangala wall 2, 14 October 2026: the model drew a fridge on a narrow teal
// panel between two black slabs. Not "mostly dark", but a dark panel all the same.
test("a drawing whose commonest colour is near-black is refused (darkPanel)", async () => {
  const black = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 8, g: 8, b: 8 } } })
    .composite([{ input: await sharp({ create: { width: 110, height: 300, channels: 3, background: { r: 140, g: 190, b: 190 } } }).png().toBuffer(), left: 95, top: 0 }]).png().toBuffer();
  assert.equal(await darkPanel(black), true);
  const teal = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 140, g: 190, b: 190 } } })
    .composite([{ input: await sharp({ create: { width: 90, height: 200, channels: 3, background: { r: 10, g: 20, b: 40 } } }).png().toBuffer(), left: 100, top: 60 }]).png().toBuffer();
  assert.equal(await darkPanel(teal), false, "a dark appliance on a light panel is fine");
});
