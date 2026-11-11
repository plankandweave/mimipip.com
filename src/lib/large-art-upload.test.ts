import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadLargeArt } from "./large-art-upload";
import { uploadToLibrary } from "./library-upload";
import { ART_PART_BYTES, LARGE_ART_FROM } from "./large-art-upload-rules";

const MB = 1024 * 1024;

type Call = { method: string; url: string; body: unknown; size: number };

/** A stand-in for the two routes, recording every request the browser makes. */
function fakeServer(opts: { failPartOnce?: number; failComplete?: boolean } = {}) {
  const calls: Call[] = [];
  let failed = false;
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body;
    const size = body instanceof Blob ? body.size : typeof body === "string" ? body.length : 0;
    let parsed: unknown = body;
    if (typeof body === "string") parsed = JSON.parse(body);
    calls.push({ method, url: input, body: parsed, size });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (input.startsWith("/api/corporate/upload/large") && method === "PUT") {
      const part = Number(new URL(input, "https://x").searchParams.get("part"));
      if (part === opts.failPartOnce && !failed) { failed = true; return new Response("Bad gateway", { status: 502 }); }
      return json({ ok: true, partNumber: part, etag: `e${part}` });
    }
    if (input === "/api/corporate/upload/large") {
      const b = parsed as { action: string; name?: string };
      if (b.action === "start") return json({ ok: true, path: "vijay-sales/1-abc.tif", uploadId: "u1", partBytes: ART_PART_BYTES });
      if (b.action === "complete") {
        if (opts.failComplete) return json({ error: "That file could not be read as an image." }, 400);
        return json({ ok: true, url: "canon", path: "vijay-sales/1-abc.tif", previewUrl: "p", width: 26000, height: 14000, name: b.name });
      }
      return json({ ok: true });
    }
    if (input === "/api/corporate/designs/upload") {
      const n = body instanceof FormData ? body.getAll("files").length : (parsed as { uploaded: unknown[] }).uploaded.length;
      return json({ ok: true, added: n, results: Array.from({ length: n }, (_, i) => ({ ok: true, name: `f${i}` })) });
    }
    return json({ error: "unexpected" }, 404);
  }) as typeof fetch;
  return calls;
}

const file = (bytes: number, name: string) => new File([new Uint8Array(bytes)], name);

test("a 105 MB TIFF goes as six parts of at most 20 MB, a dropped part is retried, then completed", async () => {
  const calls = fakeServer({ failPartOnce: 3 });
  const seen: number[] = [];
  const art = await uploadLargeArt(file(105 * MB, "kitchen.tif"), (p) => seen.push(p));
  const parts = calls.filter((c) => c.method === "PUT");
  assert.equal(parts.length, 7, "six parts plus one retry");
  assert.ok(parts.every((c) => c.size <= ART_PART_BYTES));
  const complete = calls.find((c) => (c.body as { action?: string })?.action === "complete")!;
  assert.deepEqual((complete.body as { parts: { partNumber: number }[] }).parts.map((p) => p.partNumber), [1, 2, 3, 4, 5, 6]);
  assert.equal(art.width, 26000);
  assert.equal(seen.at(-1), 100);
});

test("an upload the server refuses is aborted, and the reason reaches the person", async () => {
  const calls = fakeServer({ failComplete: true });
  await assert.rejects(uploadLargeArt(file(45 * MB, "wall.png"), () => {}), /could not be read as an image/);
  assert.ok(calls.some((c) => (c.body as { action?: string })?.action === "abort"));
});

test("a folder for the library is split so no request carries 40 MB or more", async () => {
  const calls = fakeServer();
  const files = [file(15 * MB, "a.jpg"), file(15 * MB, "b.jpg"), file(15 * MB, "c.jpg"), file(90 * MB, "big.tif")];
  const out = await uploadToLibrary(files, { series: "Kitchen" });
  const batches = calls.filter((c) => c.url === "/api/corporate/designs/upload");
  assert.equal(batches.length, 3, "two small batches, then one registration of the big file");
  assert.ok(calls.filter((c) => c.method === "PUT").every((c) => c.size <= ART_PART_BYTES));
  assert.equal(out.added, 4);
  assert.ok(LARGE_ART_FROM <= 40 * MB);
});
