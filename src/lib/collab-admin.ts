// Input rules for the collaboration desk. Pure: the routes call these and
// write what comes back; collab-admin.test.ts pins them.

import { CODE_RE, SLUG_RE } from "@/lib/collab-codes";
import { safePath } from "@/lib/collab-link";

export const STATUSES = ["agreed", "ordered", "delivered", "live", "complete", "cancelled"] as const;
export const DELIVERABLE_KINDS = ["reel", "story", "post", "carousel", "youtube", "short", "blog", "ugc_raw", "other"] as const;
export const DELIVERABLE_STATUSES = ["pending", "posted", "verified", "late", "waived"] as const;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isoDate = (v: unknown): string | null | "bad" => {
  const s = str(v, 40);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s)) ? s.slice(0, 10) : "bad";
};

/** "#ZyvorahWalls, zyvorahxpriya  #Home" → ["ZyvorahWalls","zyvorahxpriya","Home"], no repeats. */
export function parseHashtags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const tag = part.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 60);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

/** Handles from a list or text, lower-cased, no repeats. */
export function parseHandles(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "";
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    // Accept a pasted product URL as well as a bare handle.
    const h = part.replace(/^https?:\/\/[^/]+\/products\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (/^[a-z0-9][a-z0-9-]{0,159}$/.test(h)) out.add(h);
  }
  return [...out].slice(0, 30);
}

/** "@priya.sharma" or an instagram URL → "priya.sharma". */
export function instagramHandle(v: unknown): string | null {
  const s = str(v, 200);
  if (!s) return null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const h = (m ? m[1] : s).replace(/^@/, "").trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null;
}

export type CollabFields = {
  slug?: string;
  status?: (typeof STATUSES)[number];
  name?: string;
  email?: string;
  phone?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  other_links?: string[];
  city?: string | null;
  country?: string;
  followers?: number | null;
  audience_note?: string | null;
  inquiry_id?: string | null;
  code?: string;
  discount_pct?: number;
  max_value_inr?: number | null;
  allowed_handles?: string[] | null;
  free_shipping?: boolean;
  code_expires_at?: string | null;
  hashtags?: string[];
  landing_path?: string;
  notes?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The fields a create or an edit may set. `partial` (an edit) leaves out what
 * was not sent; a create must carry a name and an email.
 */
export function parseCollabFields(body: Record<string, unknown>, partial: boolean): Result<CollabFields> {
  const f: CollabFields = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has("name") || !partial) {
    const name = str(body.name, 120);
    if (!name) return { ok: false, error: "A name is needed." };
    f.name = name;
  }
  if (has("email") || !partial) {
    const email = str(body.email, 200)?.toLowerCase() ?? null;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "A valid email is needed — the code is personal to it." };
    f.email = email;
  }
  if (has("slug")) {
    const slug = str(body.slug, 40)?.toLowerCase() ?? "";
    if (!SLUG_RE.test(slug)) return { ok: false, error: "The link name may use lower-case letters, numbers and hyphens (3 to 40)." };
    f.slug = slug;
  }
  if (has("code")) {
    const code = str(body.code, 60)?.toUpperCase() ?? "";
    if (!CODE_RE.test(code)) return { ok: false, error: "The code may use capital letters, numbers and hyphens (4 to 60)." };
    f.code = code;
  }
  if (has("status")) {
    if (!(STATUSES as readonly string[]).includes(String(body.status))) return { ok: false, error: "Unknown status." };
    f.status = body.status as CollabFields["status"];
  }
  if (has("phone")) f.phone = str(body.phone, 30);
  if (has("instagram")) {
    const raw = str(body.instagram, 200);
    const h = instagramHandle(raw);
    if (raw && !h) return { ok: false, error: "That Instagram handle doesn't look right." };
    f.instagram = h;
  }
  if (has("youtube")) f.youtube = str(body.youtube, 200);
  if (has("other_links")) {
    const links = (Array.isArray(body.other_links) ? body.other_links : String(body.other_links ?? "").split(/\s+/))
      .map((l) => String(l).trim())
      .filter((l) => /^https?:\/\/\S+$/i.test(l))
      .slice(0, 8);
    f.other_links = links;
  }
  if (has("city")) f.city = str(body.city, 80);
  if (has("country")) {
    const c = str(body.country, 2)?.toUpperCase() ?? "IN";
    if (!/^[A-Z]{2}$/.test(c)) return { ok: false, error: "Country is a two-letter code (IN, AE…)." };
    f.country = c;
  }
  if (has("followers")) {
    const n = num(body.followers);
    if (Number.isNaN(n) || (n != null && (n < 0 || n > 1e9))) return { ok: false, error: "Followers must be a number." };
    f.followers = n == null ? null : Math.round(n);
  }
  if (has("audience_note")) f.audience_note = str(body.audience_note, 1000);
  if (has("inquiry_id")) {
    const id = str(body.inquiry_id, 40);
    if (id && !UUID_RE.test(id)) return { ok: false, error: "Unknown pitch." };
    f.inquiry_id = id;
  }
  if (has("discount_pct")) {
    const n = num(body.discount_pct);
    if (n == null || Number.isNaN(n) || n < 1 || n > 100) return { ok: false, error: "The discount is a percentage from 1 to 100." };
    f.discount_pct = Math.round(n);
  }
  if (has("max_value_inr")) {
    const n = num(body.max_value_inr);
    if (Number.isNaN(n) || (n != null && n <= 0)) return { ok: false, error: "The ceiling is an amount in rupees, or blank for none." };
    f.max_value_inr = n;
  }
  if (has("allowed_handles")) {
    const h = parseHandles(body.allowed_handles);
    f.allowed_handles = h.length ? h : null;
  }
  if (has("free_shipping")) f.free_shipping = body.free_shipping === true || body.free_shipping === "true";
  if (has("code_expires_at")) {
    const d = isoDate(body.code_expires_at);
    if (d === "bad") return { ok: false, error: "The expiry is a date." };
    // End of that day in India.
    f.code_expires_at = d ? `${d}T23:59:59+05:30` : null;
  }
  if (has("hashtags")) f.hashtags = parseHashtags(body.hashtags);
  if (has("landing_path")) {
    const p = safePath(str(body.landing_path, 300) ?? "/");
    if (!p) return { ok: false, error: "The landing page is a path on zyvorah.com, such as /collections/kids-room." };
    f.landing_path = p;
  }
  if (has("notes")) f.notes = str(body.notes, 4000);
  return { ok: true, value: f };
}

export type DeliverableFields = {
  kind?: (typeof DELIVERABLE_KINDS)[number];
  description?: string | null;
  due_on?: string | null;
  status?: (typeof DELIVERABLE_STATUSES)[number];
  url?: string | null;
  posted_at?: string | null;
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  metrics_at?: string | null;
  note?: string | null;
};

const METRICS = ["views", "reach", "likes", "comments", "saves", "shares"] as const;

export function parseDeliverableFields(body: Record<string, unknown>, now: Date = new Date()): Result<DeliverableFields> {
  const f: DeliverableFields = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (has("kind")) {
    if (!(DELIVERABLE_KINDS as readonly string[]).includes(String(body.kind))) return { ok: false, error: "Unknown deliverable type." };
    f.kind = body.kind as DeliverableFields["kind"];
  }
  if (has("description")) f.description = str(body.description, 1000);
  if (has("due_on")) {
    const d = isoDate(body.due_on);
    if (d === "bad") return { ok: false, error: "The due date is a date." };
    f.due_on = d;
  }
  if (has("url")) {
    const u = str(body.url, 500);
    if (u && !/^https?:\/\/\S+$/i.test(u)) return { ok: false, error: "The post link must start with https://" };
    f.url = u;
  }
  if (has("status")) {
    if (!(DELIVERABLE_STATUSES as readonly string[]).includes(String(body.status))) return { ok: false, error: "Unknown deliverable status." };
    f.status = body.status as DeliverableFields["status"];
  }
  // A link pasted on a pending deliverable means it went up.
  if (f.url && !f.status && !has("status")) f.status = "posted";
  if (f.status === "posted" || f.status === "verified") {
    const posted = has("posted_at") ? isoDate(body.posted_at) : null;
    if (posted === "bad") return { ok: false, error: "The posted date is a date." };
    if (posted) f.posted_at = `${posted}T12:00:00+05:30`;
    else if (!has("posted_at")) f.posted_at = now.toISOString();
  }
  let anyMetric = false;
  for (const m of METRICS) {
    if (!has(m)) continue;
    const n = num(body[m]);
    if (Number.isNaN(n) || (n != null && n < 0)) return { ok: false, error: `${m[0].toUpperCase()}${m.slice(1)} must be a number.` };
    f[m] = n == null ? null : Math.round(n);
    anyMetric = true;
  }
  if (anyMetric) f.metrics_at = now.toISOString();
  if (has("note")) f.note = str(body.note, 1000);
  return { ok: true, value: f };
}

/** A deliverable past its date and still not up. */
export function isOverdue(d: { status: string; due_on: string | null }, todayIst: string): boolean {
  return d.status === "pending" && !!d.due_on && d.due_on < todayIst;
}
