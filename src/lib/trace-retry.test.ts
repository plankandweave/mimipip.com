import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { saveTraceFile, type TraceUploadProgress } from "./trace-file-upload";
import { traceRequestId } from "./trace-request-id";
import * as trace from "./trace";

function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Request, Response, Date, console, require: (name: string) => mocks[name] ?? {} });
  return exports;
}

function harness() {
  const tables: Record<string, any[]> = { trace_walks: [], trace_marks: [], trace_segments: [] };
  const sb = { from: (table: string) => {
    const filters: [string, unknown][] = [];
    let inserted: any; let max = Infinity; let sorted = false; let upsert = false;
    const hits = () => {
      const found = tables[table].filter(r => filters.every(([k,v]) => r[k] === v));
      return (sorted ? found.sort((a,b) => b.seq-a.seq) : found).slice(0,max);
    };
    const result = () => {
      if (inserted) {
        const value = inserted; inserted = null;
        const duplicate = tables[table].find(r => (value.id && r.id === value.id) || (table !== "trace_walks" && r.walk_id === value.walk_id && r.seq === value.seq));
        if (duplicate) return { data: upsert ? duplicate : null, error: upsert ? null : { message: "duplicate key", code: "23505" } };
        const row = { id: value.id ?? `row-${table}-${tables[table].length}`, ...value };
        tables[table].push(row); return { data: row, error: null };
      }
      return { data: hits()[0] ?? null, error: null };
    };
    const q: any = {
      select: () => q, eq: (k: string,v: unknown) => { filters.push([k,v]); return q; },
      insert: (r: unknown) => { inserted = r; return q; },
      upsert: (r: unknown) => { inserted = r; upsert = true; return q; },
      order: () => { sorted = true; return q; }, limit: (n: number) => { max = n; return q; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve({ data: hits(), count: hits().length, error: null }).then(resolve),
    };
    return q;
  } };
  const links = load("./trace-link.ts", {});
  const route = load("../app/api/trace/[token]/route.ts", {
    "next/server": { NextResponse: { json: Response.json }, after: () => {} },
    "@/lib/trace": trace, "@/lib/trace-request-id": { traceRequestId },
    "@/lib/trace-link": {
      touchTraceLink: async () => {}, walkOnLink: links.walkOnLink,
      guardTraceRequest: async (_r: Request, token: string) => ({ ok: true, ctx: { sb, link: { id: token }, blueprint: { id: "bp" }, account: { id: "account" } } }),
    },
  });
  const post = async (body: Record<string, unknown>, token = "link-a") => route.POST(new Request("https://example.test/api/trace/synthetic", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ token }) });
  return { tables, post };
}

const key = "12345678-1234-4234-8234-123456789012";
test("retry keys derive separate rows per trusted link/walk/action and reject malformed input", () => {
  assert.equal(traceRequestId("a", "start", key), traceRequestId("a", "start", key.toUpperCase()));
  assert.notEqual(traceRequestId("a", "start", key), traceRequestId("b", "start", key));
  assert.notEqual(traceRequestId("a", "start", key), traceRequestId("a", "mark", key));
  assert.equal(traceRequestId("a", "start", undefined), null);
  for (const invalid of ["", "../path", 42, {}, "a".repeat(300)]) assert.throws(() => traceRequestId("a", "start", invalid));
});

test("lost start AND mark responses retry through the real route without duplicate records", async () => {
  const h = harness(); const lost = new Set(["start", "mark"]); const progress: TraceUploadProgress = {};
  const input = {
    kind: "photo" as const, blob: new Blob(["synthetic"], { type: "image/jpeg" }), seconds: 0,
    name: "Synthetic", where: "Empty wall", progress, put: async () => {},
    post: async (path: string, body: Record<string, unknown>) => {
      if (path === "/media") return { signedUrl: "https://example.test", ok: true };
      if (body.action === "end") return { ok: true };
      const response = await h.post(body); const json = await response.json();
      assert.equal(response.status,200);
      if (lost.delete(String(body.action))) throw new Error("response lost AFTER persistence");
      return json;
    },
  };
  await assert.rejects(saveTraceFile(input), /AFTER persistence/);
  assert.equal(h.tables.trace_walks.length,1);
  await assert.rejects(saveTraceFile(input), /AFTER persistence/);
  assert.equal(h.tables.trace_walks.length,1); assert.equal(h.tables.trace_marks.length,1);
  await saveTraceFile(input);
  assert.equal(h.tables.trace_walks.length,1); assert.equal(h.tables.trace_marks.length,1); assert.equal(progress.ended,true);
});

test("concurrent start/mark retries converge and a foreign walk cannot be marked", async () => {
  const h = harness();
  const starts = await Promise.all([h.post({ action: "start", requestId: key }),h.post({ action: "start", requestId: key })]);
  const ids = await Promise.all(starts.map(async r => (await r.json()).walkId));
  assert.equal(ids[0],ids[1]); assert.equal(h.tables.trace_walks.length,1);
  const marks = await Promise.all([h.post({ action: "mark", walkId: ids[0], requestId: key }),h.post({ action: "mark", walkId: ids[0], requestId: key })]);
  const markIds = await Promise.all(marks.map(async r => (await r.json()).markId));
  assert.equal(markIds[0],markIds[1]); assert.equal(h.tables.trace_marks.length,1);
  assert.equal((await h.post({ action: "mark", walkId: ids[0], requestId: key },"link-b")).status,404);
  const other = await (await h.post({ action: "start", requestId: key },"link-b")).json();
  assert.notEqual(other.walkId,ids[0]); assert.equal(h.tables.trace_walks.length,2);
  assert.equal((await h.post({ action: "start", requestId: "bad" })).status,400);
});
