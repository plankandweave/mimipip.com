import * as imageNotes from "./vault-image-notes";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process, console, Buffer, URL, Request, Response, Date,
    require: (name: string) => mocks[name] ?? (name === "@/lib/vault-image-notes" ? imageNotes : {}),
  });
  return exports;
}
const member = { role: "member", active: true, can_vault_upload: true, can_upload: false, can_build: false, can_order: false };
const session = { account: { id: "account-a", slug: "client-a", name: "Client A" }, email: "a@example.test", member, staff: false, agreementPending: false };
const response = { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) };

test("real session resolver restricts a file-only member unless the caller opts into Vault", async () => {
  const rows: Record<string, unknown> = { corporate_sessions: { account_id: "account-a", email: session.email, last_seen_at: new Date().toISOString() }, corporate_accounts: session.account, corporate_members: member };
  const sb = { from: (table: string) => {
    const chain: any = { select: () => chain, eq: () => chain, gt: () => chain, maybeSingle: async () => ({ data: rows[table] }) };
    return chain;
  } };
  const auth = load("./corporate-auth.ts", {
    "node:crypto": { createHash: () => ({ update: () => ({ digest: () => "synthetic-hash" }) }) },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "synthetic-token-never-sent" }) }) },
    "./supabase-admin": { supabaseAdmin: () => sb },
  });
  assert.equal(await auth.currentCorporateSession(), null);
  assert.equal((await auth.currentCorporateSession({ allowVaultUploadOnly: true })).account.id, "account-a");
  rows.corporate_members = { ...member, can_vault_upload: false };
  assert.ok(await auth.currentCorporateSession(), "legacy member behaviour preserved");
});

function vaultHarness() {
  let afters = 0;
  let paid = 0;
  const docs: any[] = [];
  const sb = { from: (table: string) => {
    const filters: Record<string, unknown> = {};
    let pending: any;
    const chain: any = {
      select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      insert: (value: unknown) => { pending = { id: "new-document", ...value as object }; return chain; },
      update: () => chain,
      then: (resolve: any) => resolve({ data: null }),
      single: async () => { docs.push(pending); return { data: pending }; },
      maybeSingle: async () => ({ data: docs.find(d => Object.entries(filters).every(([k,v]) => d[k] === v)) ?? null }),
    };
    assert.equal(table, "vault_documents");
    return chain;
  } };
  const route = load("../app/api/corporate/vault/route.ts", {
    "next/server": { NextResponse: response, after: () => { afters++; } },
    "@/lib/corporate-auth": { currentCorporateSession: async () => session, can: (_s: unknown, cap: string) => cap === "vault_upload", canAdministerAccount: () => false, isVaultUploadOnly: () => true, sessionActor: () => ({ name: "Synthetic" }), recordAudit: async () => {} },
    "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    "@/lib/vault": { ensureBlueprint: async () => ({ id: "blueprint-a", name: "Client A" }), loadVault: async () => ({ documents: [], walks: [], links: [] }), loadPulse: async () => ({ status: "collecting" }), vaultPath: (slug: string, id: string, ext: string, restricted: boolean) => `${restricted ? "vault-private" : "vault"}/${slug}/${id}.${ext}` },
    "@/lib/prism": { loadPresentedProposal: async () => null },
    "@/lib/pulse-draft": { draftPendingWalks: async () => { paid++; } },
    "@/lib/transcribe": { transcribeAudio: async () => { paid++; } },
    "@/lib/vault-kinds": { VAULT_KINDS: [{ id: "plan" }], vaultFileExtension: () => "pdf", vaultStoredType: () => "application/pdf", guessVaultKind: () => "plan", MAX_VAULT_FILE_BYTES: 120 * 1024 * 1024 },
    "@/lib/corporate-art-store": { caSignedUploadUrl: (path: string) => ({ signedUrl: path }), caDownload: async () => ({ data: new Blob(["synthetic"], { type: "application/pdf" }) }) },
  });
  return { route, counts: () => ({ afters, paid }), docs };
}
const post = (action: string, rest = {}) => new Request("https://example.test/api/corporate/vault", { method: "POST", body: JSON.stringify({ action, ...rest }) });

test("opening file-only Vault schedules no AI and exposes independent upload/edit flags", async () => {
  const h = vaultHarness();
  const r = await h.route.GET();
  const body = await r.json();
  assert.equal(body.canUpload, true);
  assert.equal(body.canEdit, false);
  assert.equal(body.canManage, false);
  assert.deepEqual(h.counts(), { afters: 0, paid: 0 });
});

test("file-only Vault rejects every wall, note, transcription and management action", async () => {
  const h = vaultHarness();
  for (const action of ["audio-transcribe", "note", "delete", "wall-update", "wall-add", "wall-drop", "wall-restore", "pulse-draft", "transcribe", "mint-trace", "revoke-trace", "walk-remove"]) {
    assert.equal((await h.route.POST(post(action))).status, 403, action);
  }
  assert.deepEqual(h.counts(), { afters: 0, paid: 0 });
});

test("upload slot belongs to the session; a foreign project document cannot be committed", async () => {
  const h = vaultHarness();
  const r = await h.route.POST(post("sign", { title: "Synthetic plan", fileName: "synthetic.pdf", contentType: "application/pdf", bytes: 42, account_id: "account-b", blueprint_id: "blueprint-b" }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).signedUrl, "vault-private/client-a/new-document.pdf");
  assert.equal(h.docs[0].account_id, "account-a");
  assert.equal(h.docs[0].blueprint_id, "blueprint-a");
  h.docs[0].path = "vault-private/client-a/new-document.pdf";
  assert.equal((await h.route.POST(post("commit", { id: "new-document" }))).status, 200);
  h.docs.push({ id: "foreign", blueprint_id: "blueprint-b", path: "vault-private/client-b/foreign.pdf" });
  assert.equal((await h.route.POST(post("commit", { id: "foreign" }))).status, 404);
  assert.equal((await h.route.POST(post("sign", { bytes: 121 * 1024 * 1024 }))).status, 413);
});

// This is the explicit scope boundary. A new opt-in must be reviewed here;
// session-only ordering, paid model and member-management routes remain denied.
test("only the reviewed Vault and identity boundaries accept file-only sessions", () => {
  const root = new URL("../", import.meta.url);
  const allowed = new Set([
    "app/api/corporate/session/route.ts", "app/api/corporate/vault/route.ts",
    "app/api/corporate/vault/guide/route.ts",
    "app/api/files/corporate-art/[...path]/route.ts", "app/api/media-upload/route.ts",
    "app/partners/[slug]/page.tsx", "app/partners/[slug]/vault/page.tsx", "lib/partner-mode.ts",
  ]);
  function visit(dir: URL, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix + item.name;
      if (item.isDirectory()) visit(new URL(item.name + "/", dir), path + "/");
      else if (/\.tsx?$/.test(path) && !path.endsWith(".test.ts")) {
        const text = readFileSync(new URL(item.name, dir), "utf8");
        if (/allowVaultUploadOnly:\s*true/.test(text)) assert.ok(allowed.delete(path), path);
      }
    }
  }
  visit(root);
  assert.equal(allowed.size, 0);
});

test("a copied private Vault download link requires the matching account session", async () => {
  let identity: unknown = null;
  let reads = 0;
  const route = load("../app/api/files/corporate-art/[...path]/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/corporate-auth": { currentCorporateSession: async () => identity },
    "@/lib/corporate-art-store": { caVerify: () => true },
    "@/lib/r2-media": { privateBucket: async () => ({ get: async () => { reads++; return { httpMetadata: { contentType: "application/pdf" }, arrayBuffer: async () => new TextEncoder().encode("synthetic").buffer }; } }) },
  });
  const request = { nextUrl: new URL("https://example.test/file?exp=9999999999&sig=synthetic"), headers: new Headers() };
  const ctx = { params: Promise.resolve({ path: ["vault-private", "client-a", "synthetic.pdf"] }) };
  assert.equal((await route.GET(request, ctx)).status, 403);
  identity = { ...session, account: { ...session.account, slug: "client-b" } };
  assert.equal((await route.GET(request, ctx)).status, 403);
  assert.equal(reads, 0);
  identity = session;
  assert.equal((await route.GET(request, ctx)).status, 200);
  assert.equal(reads, 1);
});

test("private upload tokens cannot be used by another account or without Vault permission", async () => {
  let identity: unknown = null;
  let grant = true;
  let writes = 0;
  const route = load("../app/api/media-upload/route.ts", {
    "next/server": { NextResponse: response },
    "@/lib/corporate-auth": { currentCorporateSession: async () => identity, can: () => grant },
    "@/lib/upload-token": { verifyUploadToken: () => ({ bucket: "corporate-art", path: "vault-private/client-a/test.pdf", upsert: true }) },
    "@/lib/vault-kinds": { MAX_VAULT_FILE_BYTES: 120 * 1024 * 1024 },
    "@/lib/corporate-art-store": { caUpload: async () => { writes++; return {}; } },
  });
  const request = { nextUrl: new URL("https://example.test/api/media-upload?token=synthetic"), headers: new Headers(), arrayBuffer: async () => new Uint8Array([1]).buffer };
  assert.equal((await route.PUT(request)).status, 403);
  identity = { ...session, account: { ...session.account, slug: "client-b" } };
  assert.equal((await route.PUT(request)).status, 403);
  identity = session;
  grant = false;
  assert.equal((await route.PUT(request)).status, 403);
  assert.equal(writes, 0);
  grant = true;
  assert.equal((await route.PUT(request)).status, 200);
  assert.equal(writes, 1);
});

test("new private slots enforce uploader, saved immutability and audio byte ceiling", async () => {
  let row = { uploaded_by_email: session.email, deleted_at: 'pending', parent_document_id: 'picture', upload_key: 'synthetic' };
  let writes = 0;
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({data:row,error:null}) };
  const route = load('../app/api/media-upload/route.ts', {
    'next/server': {NextResponse:response},
    '@/lib/corporate-auth': {currentCorporateSession:async()=>({...session,account:{id:'account-a',slug:'superhealth'}}),can:()=>true},
    '@/lib/supabase-admin': {supabaseAdmin:()=>({from:()=>chain})},
    '@/lib/upload-token': {verifyUploadToken:()=>({bucket:'corporate-art',path:'vault-private/superhealth/test.mp3',upsert:true})},
    '@/lib/vault-kinds': {MAX_VAULT_FILE_BYTES:120*1024*1024},
    '@/lib/r2-media': {privateBucket:async()=>({put:async(_key: string,_body: unknown,opts: {onlyIf:unknown})=>{assert.equal(JSON.stringify(opts.onlyIf),JSON.stringify({etagDoesNotMatch:'*'}));writes++;return {};}})}
  });
  const request={nextUrl:new URL('https://example.test/api/media-upload'),headers:new Headers(),arrayBuffer:async()=>new Uint8Array([1]).buffer};
  assert.equal((await route.PUT(request)).status,200);
  row={...row,uploaded_by_email:'another@example.test'};assert.equal((await route.PUT(request)).status,403);
  row={...row,uploaded_by_email:session.email,deleted_at:''};assert.equal((await route.PUT(request)).status,409);
  row={...row,deleted_at:'pending'};request.headers.set('content-length',String(13*1024*1024));assert.equal((await route.PUT(request)).status,413);
  assert.equal(writes,1);
});


test("overlapping PUT cannot overwrite bytes even when commit wins before its body arrives", async () => {
  let committed = false;
  let bytes: ArrayBuffer | null = null;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const chain = {select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{uploaded_by_email:session.email,deleted_at:committed ? null : 'pending',upload_key:'key',content_type:'image/png'},error:null})};
  const route = load('../app/api/media-upload/route.ts', {
    'next/server':{NextResponse:response},
    '@/lib/corporate-auth':{currentCorporateSession:async()=>({...session,account:{id:'account-a',slug:'superhealth'}}),can:()=>true},
    '@/lib/supabase-admin':{supabaseAdmin:()=>({from:()=>chain})},
    '@/lib/upload-token':{verifyUploadToken:()=>({bucket:'corporate-art',path:'vault-private/superhealth/test.png',upsert:true})},
    '@/lib/r2-media':{privateBucket:async()=>({put:async(_key:string,body:ArrayBuffer,opts:{onlyIf:{etagDoesNotMatch:string},httpMetadata:{contentType:string}})=>{
      assert.equal(opts.onlyIf.etagDoesNotMatch,'*');
      assert.equal(opts.httpMetadata.contentType,'image/png');
      if(bytes) return null;
      bytes=body;return {};
    }})},
  });
  const request=(slow:boolean)=>({nextUrl:new URL('https://example.test/api/media-upload'),headers:new Headers({'content-type':'text/plain'}),arrayBuffer:async()=>{if(slow) await waiting;return new Uint8Array([slow ? 2 : 1]).buffer;}});
  const slow=route.PUT(request(true));
  assert.equal((await route.PUT(request(false))).status,200);
  committed=true;
  release();
  assert.equal((await slow).status,409);
  assert.equal(new Uint8Array(bytes!)[0],1);
});
