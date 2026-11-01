// Turn a founder-approved ad decision into a typed, budget-bounded CampaignPlan.
// The decision text already carries a brief (the intelligence layer prepared it);
// Claude structures it into our schema, clamped to the caps we pass in, and the
// landing URLs are validated to be real Zyvorah pages so an ad never drives to a
// 404. The brand-safety gate then vets the ad copy — the same gate the organic
// engine uses — so no trade-secret or wrong-price copy can ship in a paid ad.

import Anthropic from "@anthropic-ai/sdk";
import { checkCaption, autoCorrect } from "../safety";
import type { CampaignPlan } from "./meta";
import type { Decision } from "../intel";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-sonnet-5";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";

const PLAN_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    objective: { type: "string", enum: ["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"] },
    lifetimeCapInr: { type: "number" },
    adSets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dailyBudgetInr: { type: "number" },
          cities: { type: "array", items: { type: "string" } },
          interests: { type: "array", items: { type: "string" } },
          landingPath: { type: "string", description: "site-relative path, e.g. /collections/serene" },
        },
        required: ["name", "dailyBudgetInr", "cities", "landingPath"],
      },
    },
    creativeMessage: { type: "string", description: "primary ad text, brand voice, <=125 words" },
  },
  required: ["name", "objective", "lifetimeCapInr", "adSets", "creativeMessage"],
};

const SYSTEM = `You are the Zyvorah paid-media planner. Turn an approved marketing decision into a concrete Meta (Instagram/Facebook) campaign plan for an Indian premium mural wallpaper brand.

Rules:
- Respect the caps you are given: total lifetime budget MUST be <= the lifetime cap; the sum of ad-set daily budgets should let the campaign run ~7 days within that cap.
- Ad sets target Indian metros. Use real city names (Mumbai, Delhi, Bengaluru, Pune, Hyderabad, Chennai, etc.).
- Landing paths must be plausible real site paths (/collections/<x>, /products/<handle>, /) — never invent query strings or external URLs.
- The creative message is brand voice: warm and editorial. NEVER mention how anything is manufactured (no machines/inks/suppliers). Omit numeric prices from ad copy; the exact current design rate appears on its product page. Describe a design's surface only when verified: smooth matte surface or linen feel. Do not offer a media choice.
Return via the tool.`;

/** Build a plan, clamped to caps, copy safety-gated. Returns null if unsafe. */
export async function buildCampaignPlan(
  decision: Decision,
  caps: { lifetimeCapInr: number; perCampaignCapInr: number },
): Promise<CampaignPlan | null> {
  const client = new Anthropic({ apiKey: anthropicKeyFor("marketing"), maxRetries: 2 });
  const cap = Math.min(caps.lifetimeCapInr, caps.perCampaignCapInr);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    tool_choice: { type: "tool", name: "campaign_plan" },
    tools: [{ name: "campaign_plan", description: "The structured campaign plan.", input_schema: PLAN_SCHEMA }],
    messages: [
      {
        role: "user",
        content: `APPROVED DECISION
Title: ${decision.title}
Recommendation: ${decision.recommendation ?? ""}
Context: ${decision.context ?? ""}
Prepared brief (notes): ${decision.execution_notes ?? ""}

CAPS (hard): lifetime budget must be <= ₹${cap}. Plan ~7 days.`,
      },
    ],
  });

  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) return null;
  const raw = block.input as Record<string, unknown>;

  // Safety-gate the ad copy (same gate as organic).
  const copy = autoCorrect(String(raw.creativeMessage ?? ""));
  // The model has no catalogue-price lookup. A numeric ad price could be
  // correct for one design and wrong for another, so leave it to the landing page.
  if (/₹\s*\d|\b(?:Rs\.?|INR)\s*\d/i.test(copy)) return null;
  const safety = checkCaption(copy, { fromPrice: 200 });
  if (!safety.ok) return null;

  // Clamp budget to the cap regardless of what the model returned.
  const lifetime = Math.min(Number(raw.lifetimeCapInr) || cap, cap);

  const adSets = (Array.isArray(raw.adSets) ? raw.adSets : []).map((entry: unknown) => {
    const s = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      name: String(s.name),
      dailyBudgetInr: Math.max(50, Math.min(Number(s.dailyBudgetInr) || 0, Math.floor(lifetime / 7))),
      cities: Array.isArray(s.cities) ? s.cities.map(String) : [],
      interests: Array.isArray(s.interests) ? s.interests.map(String) : [],
      landingUrl: `${SITE}${String(s.landingPath || "/").replace(/^(?!\/)/, "/")}`,
    };
  });

  return {
    name: String(raw.name || `Zyvorah — ${decision.title}`).slice(0, 100),
    objective: (["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"].includes(String(raw.objective))
      ? raw.objective
      : "OUTCOME_TRAFFIC") as CampaignPlan["objective"],
    lifetimeCapInr: lifetime,
    adSets,
    creative: { message: copy },
  };
}
