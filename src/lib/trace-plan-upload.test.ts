import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PDFDocument } from "pdf-lib";
import ts from "typescript";
import { traceRequestId } from "./trace-request-id";
import { MAX_TRACE_PLAN_BYTES, tracePlansEnabled } from "./trace-plan";

function harness() {
  const docs: any[] = []; const objects = new Map<string, ArrayBuffer>();
  let closed = false; let failReceipt = false;
  const sb = { from: () => {
    const filters: [string, unknown][] = []; let inserted: any; let updated: any;
    const match = () => docs.find(d => filters.every(([k,v]) => d[k] === v));
    const result = () => {
      if (inserted) {
        if (docs.some(d => d.id === inserted.id)) return { data: null, error: { message: "duplicate" } };
        docs.push(inserted); return { data: inserted, error: null };
      }
      if (updated) {
        if (failReceipt) return { data: null, error: { message: "receipt unavailable" } };
        const row = match(); if (row) Object.assign(row, updated);
      }
      return { data: match() ?? null, error: null };
    };
    const q: any = { select: () => q, eq: (k: string,v: unknown) => { filters.push([k,v]); return q; },
      insert: (r: any) => { inserted = {...r}; return q; }, update: (r: any) => { updated = r; return q; },
      maybeSingle: async () => result(), single: async () => result() };
    return q;
  } };
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "node:crypto": { createHash }, "pdf-lib": { PDFDocument }, "next/server": { NextResponse: { json: Response.json } },
    "@/lib/trace-plan": { MAX_TRACE_PLAN_BYTES, tracePlansEnabled }, "@/lib/trace-request-id": { traceRequestId },
    "@/lib/trace-link": { guardTraceRequest: async (_req: Request, token: string) => closed
      ? { ok: false, status: 403, state: "revoked", error: "closed" }
      : { ok: true, ctx: { sb, account: { id: "account", slug: token === "other-tenant" ? "other" : "dr-mehtas-hospitals", email_domain: "dr-mehtas-hospitals.trace.invalid" }, blueprint: { id: "bp" }, link: { id: token, recipient_email: "synthetic@example.test", recipient_name: "Synthetic" } } } },
    "@/lib/r2-media": { privateBucket: async () => ({
      put: async (path: string, bytes: ArrayBuffer, options: any) => {
        assert.equal(options.onlyIf.etagDoesNotMatch,"*");
        if (objects.has(path)) return null;
        objects.set(path,bytes); return { size: bytes.byteLength };
      }, head: async (path: string) => objects.has(path) ? { size: objects.get(path)!.byteLength } : null,
    }) },
  };
  runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/trace/[token]/documents/route.ts",import.meta.url),"utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,{exports,Request,Response,TextDecoder,Date,console,require:(name:string)=>mocks[name]??{}});
  const key = "12345678-1234-4234-8234-123456789012";
  const post = (bytes: Uint8Array, token = "link-a", headers: Record<string,string> = {}) => exports.POST(new Request("https://example.test", {
    method:"POST",headers:{"content-type":"application/pdf","x-trace-request-id":key,"x-file-name":"Synthetic%20plan.pdf",...headers},body:new Blob([bytes as Uint8Array<ArrayBuffer>]),
  }),{params:Promise.resolve({token})});
  return { docs, objects, post, close: () => { closed = true; }, failReceipt: (fail: boolean) => { failReceipt = fail; } };
}
async function pdfBytes() { const pdf = await PDFDocument.create(); pdf.addPage([100,100]); return pdf.save(); }

test("only the exact approved tenant can upload plans; malformed, empty and oversized PDFs fail", async () => {
  const h=harness(); const pdf=await pdfBytes();
  assert.equal((await h.post(pdf,"other-tenant")).status,403);
  assert.equal((await h.post(pdf,"link-a",{"x-trace-request-id":"bad"})).status,400);
  assert.equal((await h.post(new Uint8Array())).status,413);
  assert.equal((await h.post(new TextEncoder().encode("%PDF-not actually a PDF"))).status,415);
  assert.equal((await h.post(pdf,"link-a",{"content-length":String(MAX_TRACE_PLAN_BYTES+1)})).status,413);
  assert.equal(h.docs.length,0); assert.equal(h.objects.size,0);
});

test("PDF lost receipt retries one row/object, rejects changed content, and closed links do not remove saved files", async () => {
  const h=harness(); const pdf=await pdfBytes();
  h.failReceipt(true);
  assert.equal((await h.post(pdf)).status,503);
  assert.equal(h.docs.length,1); assert.equal(h.objects.size,1);
  h.failReceipt(false);
  const saved=await h.post(pdf); assert.equal(saved.status,200);
  const id=(await saved.json()).id;
  assert.equal((await h.post(pdf)).status,200); assert.equal(h.docs.length,1); assert.equal(h.objects.size,1);
  const different=await PDFDocument.create(); different.addPage([200,200]);
  assert.equal((await h.post(await different.save())).status,409);
  // Same client retry key on a different bearer link never selects the first row.
  assert.notEqual((await (await h.post(pdf,"link-b")).json()).id,id);
  h.close();
  assert.equal((await h.post(pdf)).status,403);
  assert.equal(h.docs.find(d=>d.id===id).deleted_at,null);
  assert.deepEqual(new Uint8Array(h.objects.get(h.docs.find(d=>d.id===id).path ? `corporate-art/${h.docs.find(d=>d.id===id).path}` : "")!),pdf);
});

test("a retry cannot restore a plan removed by staff", async () => {
  const h = harness(); const pdf = await pdfBytes();
  assert.equal((await h.post(pdf)).status, 200);
  h.docs[0].deleted_at = new Date().toISOString();
  assert.equal((await h.post(pdf)).status, 410);
  assert.notEqual(h.docs[0].deleted_at, null);
});
