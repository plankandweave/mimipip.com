import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { anthropicKeyFor } from "@/lib/ai-keys";

// Proof-of-trade AI review — the automated replacement for a human approval
// step (spec: "Reviewed automatically ... no admin in the loop"). The
// applicant supplies ONE of: a bill they issued a customer, some other trade
// document (upload, image or PDF), or their Instagram handle. This reviews
// whichever was given and returns a structured verdict the apply route acts
// on. Degrades to null when ANTHROPIC_API_KEY is unset — the caller must
// treat null as "verification unavailable, try later", never as a pass.

const MODEL = "claude-sonnet-5";

let cached: Anthropic | null | undefined;

function client(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = anthropicKeyFor("shoppers");
  cached = apiKey ? new Anthropic({ apiKey }) : null;
  return cached;
}

export type ProofVerdict = {
  plausible_trade_professional: boolean;
  operates_in_india: boolean;
  confidence: number; // 0-1
  reason: string;
};

export type ProofReviewResult = {
  verdict: ProofVerdict;
  /** Both booleans true AND confidence >= 0.6 — the pass/fail line the apply
   *  route acts on. Computed here so every caller applies the same bar. */
  passed: boolean;
  raw: unknown;
};

const VERDICT_SCHEMA = {
  type: "object" as const,
  properties: {
    plausible_trade_professional: {
      type: "boolean" as const,
      description:
        "True if the document/profile plausibly shows the applicant operating as a trade professional (architect, interior designer, curator, contractor, or similar) — e.g. a bill issued to a customer, a trade document, or a professional Instagram presence.",
    },
    operates_in_india: {
      type: "boolean" as const,
      description: "True if the evidence indicates the applicant operates in India.",
    },
    confidence: {
      type: "number" as const,
      description: "Overall confidence in this verdict, from 0 to 1.",
    },
    reason: {
      type: "string" as const,
      description: "One or two sentences explaining the verdict, for the audit log.",
    },
  },
  required: ["plausible_trade_professional", "operates_in_india", "confidence", "reason"],
  additionalProperties: false as const,
};

const SYSTEM_PROMPT = `You are reviewing an applicant's proof-of-trade for Zyvorah's trade partner program (architects, interior designers, curators). You are given either a document (a bill the applicant issued to a customer, or another trade document) or the text/content of their public Instagram profile. Decide whether the evidence plausibly shows a real trade professional operating in India. Be reasonably strict — a blank or unrelated document/profile should not pass — but this is not a legal determination, just a first-pass filter; a plausible professional presence is enough. Respond only via the requested structured output.`;

function computeVerdict(v: ProofVerdict): boolean {
  return v.plausible_trade_professional && v.operates_in_india && v.confidence >= 0.6;
}

async function runReview(userContent: Anthropic.MessageParam["content"]): Promise<ProofReviewResult | null> {
  const c = client();
  if (!c) return null;
  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
      messages: [{ role: "user", content: userContent }],
    });
    if (response.stop_reason === "refusal") {
      console.error("trade-proof: model refused review");
      return null;
    }
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) return null;
    const verdict = JSON.parse(textBlock.text) as ProofVerdict;
    return { verdict, passed: computeVerdict(verdict), raw: response };
  } catch (e) {
    console.error("trade-proof review error:", e);
    return null;
  }
}

/** Review an uploaded trade document (bill or other document), as an image
 *  or PDF passed base64. `mediaType` decides whether it's sent as an `image`
 *  or `document` content block. */
export async function reviewProofDocument(
  base64: string,
  mediaType: string,
): Promise<ProofReviewResult | null> {
  const isPdf = mediaType === "application/pdf";
  const block: Anthropic.MessageParam["content"] = [
    isPdf
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as Anthropic.DocumentBlockParam)
      : ({
          type: "image",
          source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 },
        } as Anthropic.ImageBlockParam),
    {
      type: "text",
      text: "This is the applicant's proof-of-trade document (a bill they issued to a customer, or another trade document). Review it per your instructions.",
    },
  ];
  return runReview(block);
}

/** Review a public Instagram handle by fetching the public profile page
 *  server-side (no Instagram API credentials — best-effort text scrape) and
 *  handing the page text to the model. Returns null (unavailable) if the
 *  fetch itself fails, same degrade-to-null contract as the rest of this
 *  file — a fetch failure is NOT a fail verdict. */
export async function reviewInstagramHandle(handle: string): Promise<ProofReviewResult | null> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  if (!cleanHandle) return null;

  let pageText: string;
  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZyvorahTradeVerify/1.0)" },
    });
    if (!res.ok) {
      console.error("trade-proof: instagram fetch failed", res.status);
      return null;
    }
    const html = await res.text();
    // Best-effort: Instagram serves mostly script-rendered content to
    // unauthenticated requests, but the <title>/meta description and any
    // embedded JSON usually carry the bio/name/follower count. Strip tags
    // rather than parse — we only need text for the model to reason over.
    pageText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch (e) {
    console.error("trade-proof: instagram fetch error:", e);
    return null;
  }

  if (!pageText) return null;

  const block: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `This is the scraped public text of the Instagram profile @${cleanHandle}. Review it per your instructions — look for signs of a real trade/design professional operating in India (bio, business name, location, post captions if present). Scraped content:\n\n${pageText}`,
    },
  ];
  return runReview(block);
}
