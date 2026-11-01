import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { sendEmail } from "./email";
import { anthropicKeyFor } from "@/lib/ai-keys";

// The "work with us" pipeline behind /collaborate (creators) and /press
// (journalists), plus artists and designers who email hello@ offering their
// artwork (kind "artist", email-only since 29 Sep 2026). Every submission is automatically verified two ways before a
// human sees it:
//   1. Deterministic checks — is the Instagram handle real and reachable, does
//      the email domain actually receive mail (MX), does a journalist's email
//      domain line up with the outlet they claim, do their links resolve.
//   2. A Claude assessment — brand fit, red flags (feature-for-fee scams,
//      engagement bait, generic copy-paste pitches), a founder-facing summary
//      and a ready-to-send draft reply.
// Both land in outreach_inquiries and the pitch waits on the Collabs tab of
// the marketing desk (/admin/marketing?tab=collabs). Nothing is ever sent to
// the applicant until she approves it there.

const MODEL = "claude-sonnet-5";
const FROM_FOUNDER = "Roheena, Zyvorah <roheena@mail.zyvorah.com>";
const REPLY_TO = "hello@zyvorah.com";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type OutreachSubmission = {
  id: string;
  token: string;
  reference: string;
  kind: "influencer" | "press" | "artist";
  name: string;
  email: string;
  handle: string | null;
  outlet: string | null;
  links: string[];
  fields: Record<string, any>;
  message: string;
  /** Set when the pitch arrived by email rather than through a form. */
  origin?: { subject: string; threadId: string | null };
};

export type InstagramCheck = {
  handle: string;
  url: string;
  /** true = profile exists, false = no such handle, null = we couldn't tell. */
  exists: boolean | null;
  followers: number | null;
  posts: number | null;
  verified: boolean | null;
  private: boolean | null;
  full_name: string | null;
  biography: string | null;
  /** Set when the follower count contradicts the band they picked on the form. */
  followers_mismatch: string | null;
};

export type OutreachChecks = {
  email_domain: string;
  mx_ok: boolean | null; // null = lookup failed, not "no MX"
  freemail: boolean;
  instagram: InstagramCheck | null;
  outlet_domain_match: boolean | null; // press only: email domain appears in their links/outlet
  links: { url: string; ok: boolean | null }[];
};

export type OutreachAI = {
  score: number; // 0–100 fit
  verdict: "recommend" | "consider" | "pass";
  flags: string[];
  summary: string; // 2–3 sentences for the founder
  angle: string; // what we'd get out of it
  draft_reply_html: string; // the reply that goes out on approval
  /** Set when the assessment could not run: the score/verdict are placeholders,
   *  not a judgement, and the outreach-inbox cron re-assesses the row. */
  unavailable?: true;
  error?: string;
  retries?: number;
};

/** A stored assessment that is a placeholder, not a verdict. Rows written
 *  before 29 Sep 2026 carry only the flag text, so both are recognised. */
export const assessmentUnavailable = (ai: any): boolean =>
  !!ai && (ai.unavailable === true || (Array.isArray(ai.flags) && ai.flags.includes(UNAVAILABLE_FLAG)));

const UNAVAILABLE_FLAG = "AI assessment unavailable — review manually";

/** The schema the model must answer in. A forced tool call instead of "return
 *  only JSON" prose: on 25 and 29 Sep 2026 three assessments failed to parse
 *  and the desk showed a placeholder "consider 50" as if it were a verdict. */
const ASSESS_TOOL = {
  name: "record_assessment",
  description: "Record the assessment of this pitch for the founder.",
  // strict: the API guarantees the call matches this schema. Without it the
  // model sometimes left a field out ("incomplete assessment", 29 Sep 2026).
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      score: { type: "integer", description: "0-100 fit" },
      verdict: { type: "string", enum: ["recommend", "consider", "pass"] },
      flags: { type: "array", items: { type: "string" } },
      summary: { type: "string", description: "2-3 sentences for the founder" },
      angle: { type: "string", description: "one sentence" },
      draft_reply_html: { type: "string", description: "the reply as clean HTML <p> paragraphs" },
    },
    required: ["score", "verdict", "flags", "summary", "angle", "draft_reply_html"],
  },
};

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com",
  "hotmail.com", "live.com", "icloud.com", "rediffmail.com", "protonmail.com",
  "proton.me", "aol.com", "zoho.com", "zohomail.in",
]);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchOk(url: string, timeoutMs = 6000): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Instagram answers 200 for real profiles and 404 for missing ones, but
    // rate-limits datacentre IPs hard — treat anti-bot responses as "unknown".
    if (res.status === 404 || res.status === 410) return false;
    if (res.ok) return true;
    return null;
  } catch {
    return null;
  }
}

// Instagram's public web client endpoint. A plain GET of instagram.com/<handle>
// is useless to us — logged out, it serves the same ~600KB login wall for a
// real handle and a made-up one, so it would report every fake handle as
// "reachable". This endpoint (the one the web app itself calls, hence the app
// id) answers 200 + profile JSON for a real handle and a clean 404 for a
// nonexistent one, and gives us the follower count to check claims against.
const IG_PROFILE_API = "https://www.instagram.com/api/v1/users/web_profile_info/?username=";
const IG_APP_ID = "936619743392459"; // public web-client id, same value every browser sends

/** The audience bands offered on the form, as [min, max] follower counts. */
const FOLLOWER_BANDS: Record<string, [number, number]> = {
  "Under 5k": [0, 5_000],
  "5k–25k": [5_000, 25_000],
  "25k–100k": [25_000, 100_000],
  "100k–500k": [100_000, 500_000],
  "500k+": [500_000, Number.MAX_SAFE_INTEGER],
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

async function checkInstagram(handle: string, claimedBand?: string): Promise<InstagramCheck> {
  const base: InstagramCheck = {
    handle,
    url: `https://www.instagram.com/${handle}/`,
    exists: null,
    followers: null,
    posts: null,
    verified: null,
    private: null,
    full_name: null,
    biography: null,
    followers_mismatch: null,
  };

  try {
    const res = await fetch(`${IG_PROFILE_API}${encodeURIComponent(handle)}`, {
      headers: {
        "User-Agent": UA,
        "x-ig-app-id": IG_APP_ID,
        Accept: "*/*",
        // Node's fetch otherwise sends Sec-Fetch-Site: cross-site, which
        // Instagram rejects outright with "SecFetch Policy violation". These
        // are the values a real in-page XHR sends.
        Referer: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) return { ...base, exists: false };
    if (!res.ok) return base; // 429/5xx — rate-limited, genuinely unknown

    const json = (await res.json().catch(() => null)) as any;
    const u = json?.data?.user;
    if (!u) return base; // 200 but not the shape we expect — don't guess

    const followers: number | null =
      typeof u.edge_followed_by?.count === "number" ? u.edge_followed_by.count : null;

    // Only contradict them when the real number falls outside the band they
    // picked — never when we couldn't read a count.
    let mismatch: string | null = null;
    if (followers !== null && claimedBand && FOLLOWER_BANDS[claimedBand]) {
      const [lo, hi] = FOLLOWER_BANDS[claimedBand];
      if (followers < lo || followers > hi) {
        mismatch = `says "${claimedBand}", actually ${fmtCount(followers)}`;
      }
    }

    return {
      ...base,
      exists: true,
      followers,
      posts: typeof u.edge_owner_to_timeline_media?.count === "number" ? u.edge_owner_to_timeline_media.count : null,
      verified: typeof u.is_verified === "boolean" ? u.is_verified : null,
      private: typeof u.is_private === "boolean" ? u.is_private : null,
      full_name: u.full_name ? String(u.full_name).slice(0, 100) : null,
      biography: u.biography ? String(u.biography).slice(0, 300) : null,
      followers_mismatch: mismatch,
    };
  } catch {
    return base;
  }
}

/** MX lookup over DNS-over-HTTPS — no node:dns so it also works on edge-ish runtimes. */
async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Status?: number; Answer?: unknown[] };
    if (json.Status !== 0) return false;
    return Array.isArray(json.Answer) && json.Answer.length > 0;
  } catch {
    return null;
  }
}

function domainOf(urlOrEmail: string): string {
  const at = urlOrEmail.lastIndexOf("@");
  let host = at >= 0 ? urlOrEmail.slice(at + 1) : urlOrEmail;
  host = host.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
  return host.toLowerCase().trim();
}

/** Root domain, roughly: last two labels (indianexpress.com from epaper.indianexpress.com). */
function rootDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

export async function runOutreachChecks(sub: OutreachSubmission): Promise<OutreachChecks> {
  const emailDomain = domainOf(sub.email);
  const links = (sub.links ?? []).filter((l) => /^https?:\/\//i.test(l)).slice(0, 6);

  const [mx, linkResults, instagram] = await Promise.all([
    hasMx(emailDomain),
    Promise.all(links.map(async (url) => ({ url, ok: await fetchOk(url) }))),
    sub.kind !== "press" && sub.handle && (sub.fields?.platform ?? "instagram") === "instagram"
      ? checkInstagram(sub.handle, typeof sub.fields?.followers === "string" ? sub.fields.followers : undefined)
      : Promise.resolve(null),
  ]);

  let outletMatch: boolean | null = null;
  if (sub.kind === "press") {
    if (FREEMAIL.has(emailDomain)) {
      outletMatch = false; // freelancer on gmail is common — a flag, never a rejection
    } else {
      const root = rootDomain(emailDomain);
      const haystack = [sub.outlet ?? "", ...links].join(" ").toLowerCase();
      outletMatch = haystack.includes(root) || haystack.includes(root.split(".")[0]);
    }
  }

  return {
    email_domain: emailDomain,
    mx_ok: mx,
    freemail: FREEMAIL.has(emailDomain),
    instagram,
    outlet_domain_match: outletMatch,
    links: linkResults,
  };
}

const BRAND_CONTEXT = `Zyvorah is an Indian brand of mural wallpaper and hand-designed wall murals, prepared for your order in premium materials. Woman-founded (founder: Roheena), designed & printed in India, supports women entrepreneurs (₹1 per chargeable sq ft from eligible orders funds grants and mentorship). Sells direct at zyvorah.com: catalogue murals, bespoke design, print-your-own, a room visualizer, trade & commercial programmes, and its own installation network.`;

const SYSTEM_INFLUENCER = `You screen inbound creator-collaboration requests for Zyvorah. ${BRAND_CONTEXT}

You are given the creator's form submission plus automated verification results. Assess it for the founder:
- Fit: does their content/aesthetic plausibly suit an interiors/design/home brand? Home, interiors, architecture, lifestyle, DIY, art and mom/family-home creators fit well; pure fashion/comedy/finance rarely do, unless the pitch is specific.
- Substance: is the pitch specific to Zyvorah, or a copy-paste blast?
- Red flags: feature-for-fee "we charge for posts about brands we select" scams, an ask for free product with no deliverable, agency spam, a follower count that contradicts what they claimed.
- The ask: what they want (gifted product, paid partnership, affiliate, content trade) and whether it's proportionate to their actual reach.

The creator names their main platform in submission.fields.platform (instagram, tiktok or youtube; Instagram when absent). Zyvorah works with creators on any of them — judge fit and reach on that platform, and never count a missing Instagram account against a TikTok or YouTube creator. For those, the profile is in links and links[].ok says whether it loads.

Verification notes: instagram.exists true/false is reliable — false means there is genuinely no such handle, which is a serious flag. null means our lookup was rate-limited: say "unverified", never "fake". followers/posts/verified/private come from the live profile, so weigh the REAL follower count, not their claim. followers_mismatch, when present, means their stated audience band contradicts reality — call that out plainly. mx_ok null likewise means the lookup failed, not that the domain is bad.

Zyvorah is an Indian brand and wants Indian creators above all: submission.fields.audience says where their audience is. Treat a creator based in India, or with a mostly Indian audience, as the best kind of fit, weigh their reach in Indian terms (a smaller account with a real local following is worth more than a large overseas one), and keep any figure they mention in rupees. A creator with no Indian audience can still be good; say plainly that the fit is weaker for an Indian brand that ships within India.

Also draft the reply Roheena would send IF she approves: warm, founder-voiced, Indian English, specific to their pitch. Do not commit to money or free product; propose the concrete next step (e.g. share their rate card / shortlist 2–3 designs they'd feature / a quick call), from Roheena. 60–110 words of clean HTML <p> paragraphs, no greeting or sign-off (added around it).

Record it with the record_assessment tool, in this shape:
{"score": 0-100, "verdict": "recommend"|"consider"|"pass", "flags": ["…"], "summary": "2-3 sentences for the founder", "angle": "one sentence: what Zyvorah gets", "draft_reply_html": "<p>…</p>"}`;

const SYSTEM_PRESS = `You screen inbound press/media requests for Zyvorah. ${BRAND_CONTEXT}

You are given the journalist's form submission plus automated verification results. Assess for the founder:
- Legitimacy: does the outlet exist, does their email domain match it? A freelancer on gmail is normal — flag it, don't fail it. outlet_domain_match=false + freemail=true simply means "freelancer, verify byline".
- Story fit: is the angle real (interiors trends, made-to-measure/print-on-demand, women founders, D2C in India) or advertorial fishing ("guaranteed coverage for a fee" is a hard flag)?
- What they need: hi-res imagery, founder interview, samples for a shoot, data — and the deadline.

Verification notes: null values mean the automated lookup failed, not that the claim is false.

Also draft the reply Roheena would send IF she approves: professional, warm, founder-voiced. Confirm what we can provide (hi-res imagery, founder conversation, design story, facts), reference their angle specifically, and ask for their deadline if not given. 60–110 words of clean HTML <p> paragraphs, no greeting or sign-off.

Record it with the record_assessment tool, in this shape:
{"score": 0-100, "verdict": "recommend"|"consider"|"pass", "flags": ["…"], "summary": "2-3 sentences for the founder", "angle": "one sentence: the story and why it helps Zyvorah", "draft_reply_html": "<p>…</p>"}`;

const SYSTEM_ARTIST = `You screen inbound pitches from artists and designers — illustrators, painters, surface/pattern/textile designers, mural artists — who offer their own artwork for Zyvorah wallpaper or murals. ${BRAND_CONTEXT} Zyvorah already runs artist collections on a royalty model (the artist keeps authorship, Zyvorah prints and sells, the artist earns a royalty per sale), so a good artist is a potential collection, not a marketing post.

You are given the pitch plus automated verification results. Assess it for the founder:
- The work: from what they describe and link (portfolio, Behance, Instagram), is it distinctive, and would it translate to a wall — scale, repeat or panoramic composition, colour — for Indian homes, hospitality or offices? Say what kind of collection it could become.
- Evidence: is there a real, reachable portfolio? Named past clients or licensing work are a plus but unverified claims; say so.
- Rights: they must own the work outright. Flag fan art, AI-generated work presented as hand-made, or anything that looks derivative of another artist or brand.
- The ask: licensing/royalty, a commission fee, a one-off collaboration, or a job. Flag anyone who wants money up front for speculative work.
- Substance: specific to Zyvorah, or a copy-paste blast to every wallpaper brand?

Verification notes: instagram (when present) is live data; null means the lookup was rate-limited, so say "unverified", never "fake". mx_ok null means the lookup failed. links[].ok says whether their portfolio links actually load.

Also draft the reply Roheena would send IF she approves: warm, founder-voiced, Indian English, specific to their work. Do not commit to money, exclusivity or a collection; propose the concrete next step — e.g. ask for 3–5 pieces they own outright at print resolution, or a short call about a royalty-based artist collection. 60–110 words of clean HTML <p> paragraphs, no greeting or sign-off (added around it).

Record it with the record_assessment tool, in this shape:
{"score": 0-100, "verdict": "recommend"|"consider"|"pass", "flags": ["…"], "summary": "2-3 sentences for the founder", "angle": "one sentence: the collection this could become and what Zyvorah gets", "draft_reply_html": "<p>…</p>"}`;

export async function aiAssess(
  sub: OutreachSubmission,
  checks: OutreachChecks,
): Promise<OutreachAI> {
  const fallback = (error: string): OutreachAI => ({
    unavailable: true,
    error: error.slice(0, 300),
    score: 50,
    verdict: "consider",
    flags: [UNAVAILABLE_FLAG],
    summary: "Automated assessment could not run; the deterministic checks above are all you have.",
    angle: "",
    draft_reply_html:
      "<p>Thank you for reaching out — I loved reading your note. Let me come back to you personally with next steps in a day or two.</p>",
  });

  if (!anthropicKeyFor("outreach")) return fallback("ANTHROPIC_API_KEY not configured");

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("outreach") });
    const ask = (tool: typeof ASSESS_TOOL | Omit<typeof ASSESS_TOOL, "strict">) => anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: sub.kind === "press" ? SYSTEM_PRESS : sub.kind === "artist" ? SYSTEM_ARTIST : SYSTEM_INFLUENCER,
      tools: [tool],
      tool_choice: { type: "tool", name: ASSESS_TOOL.name },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            channel: sub.origin
              ? "Unsolicited email to hello@zyvorah.com. The submission fields were extracted from the email by a parser; a missing Instagram handle means the email named none, which is itself worth flagging for a creator (not for an artist, whose portfolio link matters more)."
              : "Website form",
            submission: {
              name: sub.name,
              email: sub.email,
              handle: sub.handle,
              outlet: sub.outlet,
              links: sub.links,
              fields: sub.fields,
              message: sub.message,
            },
            verification: checks,
          }),
        },
      ],
    });
    // If the API ever refuses strict schemas for this model, a loose call with
    // the validation below beats every pitch landing unscored.
    const res = await ask(ASSESS_TOOL).catch((e: Error) => {
      if (!/strict/i.test(e?.message ?? "")) throw e;
      const { strict: _strict, ...loose } = ASSESS_TOOL;
      return ask(loose);
    });
    const call = res.content.find((b) => b.type === "tool_use");
    if (!call) return fallback(`no assessment returned (stop_reason ${res.stop_reason})`);
    const json = call.input as any;
    const score = Number(json.score);
    const missing = [
      Number.isFinite(score) ? null : `score=${JSON.stringify(json.score)}`,
      typeof json.draft_reply_html === "string" && json.draft_reply_html.trim() ? null : "draft_reply_html",
      typeof json.summary === "string" && json.summary.trim() ? null : "summary",
    ].filter(Boolean);
    if (missing.length) {
      return fallback(`incomplete assessment: ${missing.join(", ")} (stop_reason ${res.stop_reason})`);
    }
    json.score = score;
    return {
      score: Math.max(0, Math.min(100, Math.round(json.score))),
      verdict: ["recommend", "consider", "pass"].includes(json.verdict) ? json.verdict : "consider",
      flags: Array.isArray(json.flags) ? json.flags.map(String).slice(0, 8) : [],
      summary: String(json.summary ?? ""),
      angle: String(json.angle ?? ""),
      draft_reply_html: String(json.draft_reply_html),
    };
  } catch (e) {
    console.error("[outreach] AI assessment failed:", e);
    return fallback((e as Error)?.message ?? String(e));
  }
}

/* ---------------------------------------------------------------- emails */

const CHARCOAL = "#0F0F0F";
const MIST = "#6b6b6b";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// There is deliberately NO per-pitch email to the founder any more. Until
// 27 Sep 2026 each pitch sent a dossier with a review link; she asked for one
// window instead ("I do not want to get so many emails and reply to each one
// separately"). The queue is the Collabs tab of /admin/marketing, and the
// morning brief carries the count of what is waiting there.

/**
 * Verify → assess → store. Split out from processOutreach so the press-kit
 * gate (see /api/outreach) can run this INLINE, before answering the visitor
 * — it needs the verdict to decide whether to unlock downloads right away —
 * while the collab pipeline still runs the same steps in after().
 */
export async function recordOutreachAssessment(
  sub: OutreachSubmission,
): Promise<{ checks: OutreachChecks; ai: OutreachAI } | null> {
  try {
    const checks = await runOutreachChecks(sub);
    const ai = await aiAssess(sub, checks);
    const { data: stored, error } = await supabase.rpc("outreach_record_check", {
      p_id: sub.id,
      p_token: sub.token,
      p_checks: checks,
      p_ai: ai,
    });
    if (error || stored !== true) {
      console.error("[outreach] record_check failed:", error?.message ?? "not stored");
      return null; // don't email a dossier for a row we couldn't mark checked
    }
    return { checks, ai };
  } catch (e) {
    console.error("[outreach] assessment failed:", e);
    return null;
  }
}

/** Runs in after(): verify → assess → store. It then waits on the Collabs tab. */
export async function processOutreach(sub: OutreachSubmission): Promise<void> {
  await recordOutreachAssessment(sub);
}

/** After the founder decides: the reply to the person who wrote in. */
export async function sendOutreachDecision(row: {
  kind: string;
  name: string;
  email: string;
  reference: string;
  ai: OutreachAI | null;
  approved: boolean;
}): Promise<void> {
  const firstName = row.name.split(/\s+/)[0];
  const body = row.approved
    ? row.ai?.draft_reply_html ??
      "<p>Thank you for reaching out — I'd love to take this forward. I'll write to you with next steps shortly.</p>"
    : row.kind === "press"
      ? `<p>Thank you so much for thinking of Zyvorah for your story. This particular angle isn't one we can support right now, but I'd genuinely love to stay in touch — our press door is always open at hello@zyvorah.com.</p>`
      : row.kind === "artist"
        ? `<p>Thank you for sharing your work with us, and for thinking of Zyvorah. We're building our artist collections slowly and this isn't one we can take forward right now — but I'd be glad to see new work from you in a few months.</p>`
      : `<p>Thank you for the lovely note, and for thinking of Zyvorah. We're keeping our collaborations very small and slow just now, so I can't take this one forward — but tastes and timing change, and I'd be happy to hear from you again in a few months.</p>`;

  const html = `
  <div style="max-width:560px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;padding:28px 18px;">
    <div style="font-size:15px;color:${CHARCOAL};line-height:1.7;">
      <p>Dear ${esc(firstName)},</p>
      ${body}
      <p style="margin-top:18px;">Warmly,<br/>Roheena<br/><span style="font-size:13px;color:${MIST};">Founder, Zyvorah · zyvorah.com</span></p>
    </div>
  </div>`;

  await sendEmail({
    to: row.email,
    from: FROM_FOUNDER,
    replyTo: REPLY_TO,
    subject:
      row.kind === "press"
        ? "Your press note to Zyvorah"
        : "Your collaboration note to Zyvorah",
    html,
    tags: [{ name: "kind", value: `outreach-reply-${row.approved ? "yes" : "no"}` }],
  });
}
