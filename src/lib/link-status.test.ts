import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { checkLinks, linkStatus } from "./link-status";

// A server whose /hang route accepts the request and never answers — the shape
// that kept the link-check cron open until the runtime killed it.
async function serve(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/hang") return; // never respond
    res.writeHead(req.url === "/gone" ? 404 : 200);
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}` };
}

test("a page that never answers gives up on its own clock", async () => {
  const { server, base } = await serve();
  try {
    const t0 = Date.now();
    const status = await Promise.race([
      linkStatus(`${base}/hang`, 300),
      new Promise<string>((r) => setTimeout(() => r("still hanging"), 3000)),
    ]);
    assert.equal(status, 0);
    assert.ok(Date.now() - t0 < 2000, "timed out promptly");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("a batch with a hung page still finishes and reports the rest", async () => {
  const { server, base } = await serve();
  try {
    const urls = [`${base}/hang`, `${base}/a`, `${base}/gone`, `${base}/b`];
    const out = await Promise.race([
      checkLinks(urls, { timeoutMs: 300, concurrency: 2, deadlineMs: 5000 }),
      new Promise<string>((r) => setTimeout(() => r("still hanging"), 3000)),
    ]);
    assert.notEqual(out, "still hanging");
    const { results, skipped } = out as Awaited<ReturnType<typeof checkLinks>>;
    const by = Object.fromEntries(results.map((r) => [r.url.replace(base, ""), r.status]));
    assert.deepEqual(by, { "/hang": 0, "/a": 200, "/gone": 404, "/b": 200 });
    assert.deepEqual(skipped, []);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("URLs not started before the deadline are skipped, not called broken", async () => {
  const { server, base } = await serve();
  try {
    const urls = [`${base}/hang`, `${base}/a`, `${base}/b`];
    const { results, skipped } = await checkLinks(urls, { timeoutMs: 400, concurrency: 1, deadlineMs: 100 });
    assert.deepEqual(results.map((r) => r.status), [0]);
    assert.equal(skipped.length, 2);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("the link-check route uses the bounded checker, not a bare fetch", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/app/api/cron/link-check/route.ts", "utf8");
  assert.match(src, /checkLinks\(/);
  assert.doesNotMatch(src, /await fetch\(url/);
});
