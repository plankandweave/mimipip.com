import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Everything below is a lesson from Narol (Vijay Sales, 6 October 2026), pinned
// at the source because each failure was silent: nothing threw, the batch
// simply came back "proposed" looking finished.

// Serial runs (25 October 2026): the wall is laid from the run plan, which
// needs only each design's pixel size; the measured objects only steer where
// the run's free ends are cut. So the store's designs are measured, then the
// run planned, then (and only then) the container called with the pieces; a
// wall the plan cannot lay fails with the plan's reason.
test("a wall is measured, planned as part of its run, then composed from the plan", () => {
  const src = read("./site-batch.ts");
  const compose = src.slice(src.indexOf("export async function composeNextWall"), src.indexOf("export async function requeueRecompose"));
  const measured = compose.indexOf("ensureDesignGeometry(sb, batchIds)");
  const planned = compose.indexOf("planSerialRuns(");
  const container = compose.indexOf("bandComposeRemote(");
  assert.ok(measured > 0 && measured < planned && planned < container, "measure, then plan, then call the container");
  assert.ok(compose.includes("plan.errors.get(next.seq)"), "a wall the plan cannot lay fails instead of composing another way");
  assert.ok(/orderedIds: runIds,\s*strips,/.test(compose), "the container is handed exactly the planned pieces");
});

test("recompose clears the walls' artwork and never touches the client's proposal", () => {
  const src = read("./site-batch.ts");
  const fn = src.slice(src.indexOf("export async function requeueRecompose"));
  assert.ok(fn.includes("art_json: null"), "composeNextWall only picks walls with no art");
  assert.ok(fn.includes('w.status !== "ordered"'), "an approved wall is frozen");
  for (const col of ["revision", "proposed_at", "proposed_revision"]) {
    assert.ok(!new RegExp(`${col}\\s*:`).test(fn), `${col} is left alone, so no second proposal email is ever due`);
  }
  const route = read("../app/api/corporate/site-batch/[id]/recompose/route.ts");
  assert.ok(route.includes("requeueRecompose"), "the route goes through the one helper");
  assert.ok(!/propose\/route|sendEmail/.test(route), "the recompose route cannot send a proposal");
});

test("client proposals come from Team Zyvorah, never a person", () => {
  const propose = read("../app/api/corporate/site-batch/[id]/propose/route.ts");
  assert.ok(propose.includes('from: "Team Zyvorah <hello@mail.zyvorah.com>"'), "sender is the team mailbox");
  assert.ok(propose.includes("<b>Team Zyvorah</b>"), "signed by the team");
  const review = read("../app/partners/[slug]/site-batches/[id]/review.tsx");
  assert.ok(review.includes("<strong>Team Zyvorah</strong>"), "the on-page covering letter is signed by the team");
  assert.ok(!/Roheena/.test(propose.split("sendEmailWithId")[1] ?? ""), "no founder name in the proposal mail");
});

test("the media container never has to reach another service to measure", () => {
  const worker = readFileSync(new URL("../../media-container/worker/worker.mjs", import.meta.url), "utf8");
  assert.ok(worker.includes("DEPLOY_STAMP"), "a stale container instance is recycled by commit stamp");
});

test("a failed measurement says why, on the design, and is retried", () => {
  const src = read("./design-geometry.ts");
  assert.ok(src.includes("UNMEASURED: "), "the reason is written to geometry_note");
  assert.ok(src.includes("saving the measurement"), "a rejected save is a failure too, not swallowed");
  const blind = read("./design-geometry.ts").slice(read("./design-geometry.ts").indexOf("export async function unmeasuredDesignCodes"));
  assert.ok(blind.includes("geometry_note"), "and the wall's warning carries it");
});

test("a band from a composer with other rules is refused and the stale instance restarted", () => {
  const src = read("./site-batch.ts");
  assert.ok(src.includes("rulesVersion !== BAND_RULES_VERSION"), "the site checks the composer's rules version");
  assert.ok(src.includes("h.printQueue === 0 && !h.printing"), "and never restarts under a print file");
  const compose = read("./corporate-band-compose.ts");
  assert.ok(compose.includes("rulesVersion: BAND_RULES_VERSION"), "the composer stamps every band");
});

test("a composer that throws is a recorded failed attempt, never a silent retry", () => {
  const src = read("./site-batch.ts");
  const compose = src.slice(src.indexOf("export async function composeNextWall"), src.indexOf("export async function requeueRecompose"));
  const call = compose.slice(compose.indexOf("bandComposeRemote("));
  // The thrown error becomes {error}, which the code below writes to the wall
  // with compose_attempts moved on — so a broken wall is retried a bounded
  // number of times with its reason showing, and the walls behind it compose.
  assert.ok(/^bandComposeRemote\(\{[\s\S]*?\}\)\.catch\(/.test(call), "the container call is caught");
  assert.ok(call.indexOf('if ("error" in out)') > 0, "and its error goes through the recorded-failure path");
});

test("the allocator never keeps a wall of designs the composer would drop, and density swaps the lead only (Nelamangala, 14 October 2026)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./site-batch.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("keep.length > 0 && keep.length < ids.length"), "a chain where nothing fits must be emptied too");
  assert.ok(!src.includes("ids.splice(0, ids.length, richest.id)"), "density must replace the lead, not the chain");
  assert.ok(src.includes("geometry.has(c.id) && topUpOk(c))\n          .sort"), "the density lead must be a measured design the composer keeps");
});

test("a series brief is a boundary: no design from another series, a repeat inside the brief instead (Nelamangala, 14 October 2026)", () => {
  const src = read("./site-batch.ts");
  assert.ok(src.includes(".filter((c) => !preferred.size || rank(c) === 0 || (entranceCity && !!c.city))"), "the catalogue must be limited to the brief");
  assert.ok(!src.includes("When they run out, continue with other series"), "the prompt must not invite other series");
  assert.ok(!src.includes("?? p[0];"), "a top-up never takes a design the composer would drop");
  assert.ok(src.includes("!(usedOn.get(c.id) ?? []).some((q) => Math.abs(q - w.seq) <= 1)"), "a repeat never lands beside its twin");
});

// 14 October 2026: the Worker held each compose open for minutes and
// Cloudflare recycled those long requests silently; Nelamangala lost wall
// after wall. Walls are now handed to the artwork service, which saves them.
test("a wall is handed to the artwork service, not waited on, and a lost hand-off is retried", async () => {
  const { composingStale, COMPOSING_STALE_MS } = await import("./site-batch-rules");
  const now = Date.parse("2026-10-14T07:40:00Z");
  assert.equal(composingStale("Composer stage: designs loaded at 2026-10-14T07:39:00.000Z", now), false);
  assert.equal(composingStale(`Composer stage: sent at ${new Date(now - COMPOSING_STALE_MS - 1000).toISOString()} (attempt 1)`, now), true);
  assert.equal(composingStale(null, now), true, "no readable time is never stuck composing");
  const src = read("./site-batch.ts");
  const compose = src.slice(src.indexOf("export async function composeNextWall"), src.indexOf("export async function requeueRecompose"));
  assert.ok(compose.includes("async: true"), "the compose is handed off");
  assert.ok(compose.includes('status: "composing"'), "the wall reads composing while the service has it");
  const server = readFileSync(new URL("../../media-container/src/server.ts", import.meta.url), "utf8");
  assert.ok(server.includes("bandQueue = bandQueue.then(() => composeAndSave(b, wallId, true))"), "the service queues and saves it");
});
