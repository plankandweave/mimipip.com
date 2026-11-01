import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound from the Magnitude OS: a document has been signed by every party.
//
// The OS owns document signing outright — the signing tokens, the append-only
// event trail, the sealed PDF and the certificate page are all over there, and
// a dispute would be argued from the OS copy. This endpoint exists so the fact
// of a signed agreement is also findable from the Zyvorah side, by people who
// have no login to the OS and never will.
//
// Three things worth knowing before changing any of it.
//
// The signature is an HMAC over the exact body, not a bearer token inside it.
// The other OS webhooks here (production/event, install/complete-notify) pass
// the shared token in the JSON, which is fine but means the secret travels on
// every call and a signature proves nothing about the bytes. This one binds
// the two: a replayed body cannot be edited, and the key is never transmitted.
// It falls back to ZYVORAH_WEBHOOK_TOKEN as the HMAC key so nothing new had to
// be provisioned on either side.
//
// It is idempotent on os_ref. Webhooks get retried — by the OS's own mirror
// button, by a network that dropped our 200 — and the second delivery must
// update the row rather than file the agreement twice.
//
// The PDF is fetched by us, not pushed to us. The OS hands over a short-lived
// URL and we pull the bytes; a few hundred kilobytes of base64 in a webhook
// body is how a retry turns into a timeout. If the fetch fails we still record
// the agreement — knowing that a distributor signed matters more than holding
// the file — but the response then says so with a 202, because the OS's
// download URL expires in half an hour and a silent 200 would leave a
// permanent half-copy that nothing ever completes.

interface SignerPayload {
  name?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
  signedAt?: unknown;
  signedIp?: unknown;
}

interface Payload {
  event?: unknown;
  ref?: unknown;
  documentId?: unknown;
  kind?: unknown;
  title?: unknown;
  completedAt?: unknown;
  signers?: unknown;
  pdfUrl?: unknown;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** 25 MB. A signed agreement that big is a mistake somewhere, and streaming an
 *  unbounded body into memory is how one system's mistake becomes ours. */
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Where a sealed PDF may legitimately come from. */
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

/**
 * Is this a URL we are willing to fetch?
 *
 * Without this check the endpoint fetches whatever URL the payload names, with
 * redirects followed — a request-forgery primitive pointed at everything this
 * function can reach, including cloud metadata and anything else inside the
 * network perimeter. It is gated by the HMAC, but that key is shared with the
 * OS and rides in plaintext on the older webhooks between the two systems, so
 * it is not a boundary to lean the whole thing on.
 *
 * HTTPS, exact host match against the OS, and the sealed-document path shape.
 * Redirects are refused separately at the fetch, because an allowed host that
 * 302s elsewhere would otherwise walk straight past this.
 */
function isOsPdfUrl(raw: string): boolean {
  let u: URL;
  let base: URL;
  try {
    u = new URL(raw);
    base = new URL(OS_BASE);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.host !== base.host) return false;
  return /^\/api\/documents\/\d+\/sealed\.pdf$/.test(u.pathname);
}

export async function POST(req: Request) {
  const secret =
    process.env.ZYVORAH_DOC_WEBHOOK_SECRET || process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  // Read the raw text, not req.json(): the signature is over the bytes that
  // were sent, and re-serialising parsed JSON does not reproduce them.
  const raw = await req.text();
  const supplied = req.headers.get("x-mgos-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (str(body.event) !== "document.signed") {
    return NextResponse.json({ error: "unknown_event" }, { status: 400 });
  }

  const osRef = str(body.ref);
  const osDocumentId = Number(body.documentId);
  // The reference becomes a storage object name a few lines down, so it is
  // constrained here rather than trusted. The OS only ever mints MGI-SIG-####,
  // and anything else — a slash, a "..", a space — has no business reaching
  // the storage API.
  if (osRef && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(osRef)) {
    return NextResponse.json({ error: "invalid_ref" }, { status: 400 });
  }
  const title = str(body.title);
  const kind = str(body.kind) ?? "other";
  if (!osRef || !Number.isFinite(osDocumentId) || !title) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Normalise the signers rather than storing whatever arrived. This column is
  // read as evidence later, so it should have a shape we chose.
  const signers = Array.isArray(body.signers)
    ? (body.signers as SignerPayload[]).slice(0, 20).map((s) => ({
        name: str(s.name) ?? "unknown",
        role: str(s.role),
        email: str(s.email),
        phone: str(s.phone),
        signed_at: str(s.signedAt),
        signed_ip: str(s.signedIp),
      }))
    : [];

  // ── the PDF ─────────────────────────────────────────────────────────
  // Fetched before the upsert so a row never claims a path that holds nothing.
  let pdfPath: string | null = null;
  let pdfBytes: number | null = null;
  const pdfUrl = str(body.pdfUrl);

  if (pdfUrl && !isOsPdfUrl(pdfUrl)) {
    // Refused outright rather than logged and skipped: a payload naming a URL
    // that is not the OS is not a transient glitch, it is someone probing.
    console.error(`[documents/signed] ${osRef}: refused a pdfUrl outside the OS`);
    return NextResponse.json({ error: "invalid_pdf_url" }, { status: 400 });
  }

  if (pdfUrl) {
    try {
      const res = await fetch(pdfUrl, {
        signal: AbortSignal.timeout(30_000),
        // An allowed host that redirects is an allowed host being used to
        // reach a disallowed one. The OS serves these directly.
        redirect: "error",
      });
      if (!res.ok) throw new Error(`OS returned ${res.status}`);

      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_PDF_BYTES) throw new Error(`too large: ${declared} bytes`);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_PDF_BYTES) throw new Error(`too large: ${buf.byteLength} bytes`);
      // A signed agreement that is not a PDF is a misconfiguration upstream,
      // and storing it under a .pdf name would hide that.
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new Error("not a PDF");
      }

      // Keyed by ref with upsert, so a redelivery overwrites the same object
      // instead of leaving an orphan behind every retry.
      const path = `${osRef}.pdf`;
      const up = await sb.storage.from("signed-documents").upload(path, buf, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up.error) throw new Error(up.error.message);

      pdfPath = path;
      pdfBytes = buf.byteLength;
    } catch (err) {
      // Deliberately not fatal — see the header note.
      console.error(
        `[documents/signed] ${osRef}: could not store the PDF:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { error } = await sb
    .from("signed_documents")
    .upsert(
      {
        os_ref: osRef,
        os_document_id: osDocumentId,
        kind,
        title,
        completed_at: str(body.completedAt),
        signers_json: signers,
        ...(pdfPath ? { pdf_path: pdfPath, pdf_bytes: pdfBytes } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "os_ref" },
    );

  if (error) {
    console.error(`[documents/signed] ${osRef}: upsert failed:`, error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }

  // `ok` reflects whether the mirror is COMPLETE, not merely whether the row
  // was written. The OS treats any 2xx as done — it sets mirroredAt and never
  // looks again — and the download URL expires in half an hour, so a row with
  // no PDF would otherwise sit unnoticed until somebody went looking for the
  // file. Reporting 202 lets the OS leave it unmirrored and retry.
  if (pdfUrl && !pdfPath) {
    return NextResponse.json(
      { ok: false, ref: osRef, pdfStored: false, error: "pdf_not_stored" },
      { status: 202 },
    );
  }

  return NextResponse.json({ ok: true, ref: osRef, pdfStored: !!pdfPath });
}
