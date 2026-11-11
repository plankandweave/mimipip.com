import assert from "node:assert/strict";
import test from "node:test";
import { configurationTracker } from "./configuration-tracking";

test("first interaction waits for identity and concurrent changes send only once", async () => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let sends = 0;
  const track = configurationTracker("wildflower", {
    ready: () => ready, event: () => {},
    send: async () => { sends++; return new Response(null, { status: 204 }); },
  });
  const first = track();
  await track();
  assert.equal(sends, 0);
  release();
  await first;
  await track();
  assert.equal(sends, 1);
});

test("a refused or failed beacon retries on the next interaction without duplicating GA", async () => {
  let sends = 0, ga = 0;
  const track = configurationTracker("wildflower", {
    ready: async () => {}, event: () => { ga++; },
    send: async () => {
      sends++;
      if (sends === 1) throw new Error("offline");
      return new Response(null, { status: sends === 2 ? 409 : 204 });
    },
  });
  await track(); await track(); await track(); await track();
  assert.equal(sends, 3);
  assert.equal(ga, 1);
});

test("a concept builder's beacon carries the concept flag with its slug", async () => {
  const bodies: unknown[] = [];
  const track = configurationTracker("river-house", {
    ready: async () => {}, event: () => {},
    send: async (body) => { bodies.push(JSON.parse(body)); return new Response(null, { status: 204 }); },
  }, { concept: true });
  await track();
  assert.deepEqual(bodies, [{ concept: true, handle: "river-house" }]);
});
