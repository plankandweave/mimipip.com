import Anthropic from "@anthropic-ai/sdk";
import { anthropicKeyFor, type AiWorkflow } from "@/lib/ai-keys";

/**
 * PIN code lookup — a machine's job, not a human's.
 *
 * Roheena 2026-09-19, on a store saved without a PIN blocking its orders:
 * "the AI system can fetch from Google, not needed a human for it." So when a
 * destination arrives with a place but no PIN — a store on the Stores page, a
 * site address on an order — Claude Sonnet 5 looks it up with web search
 * (Google / India Post listings) and returns the six digits, or nothing.
 *
 * Rules:
 *   - A blank PIN is FILLED, a typed PIN is never second-guessed.
 *   - The answer must be a real Indian PIN (6 digits, not starting with 0)
 *     and must agree with the state where the state is known — the first two
 *     digits are the postal circle, so a Gujarat address cannot resolve to a
 *     41xxxx PIN. Disagreement = no answer, never a guess.
 *   - Never throws into a request path. No credentials, no network, no answer → null,
 *     and the caller refuses the order the same way it would for a blank one.
 */

export const PINCODE_MODEL = "claude-sonnet-5";

export type PincodeQuery = {
  /** Store / site name, e.g. "Vijay Sales Bhosari" — the strongest signal. */
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type PincodeAnswer = { pincode: string; locality: string | null };

/**
 * Indian postal circles by the first two PIN digits. Used only to reject an
 * answer that contradicts a known state; an unknown state skips the check.
 */
const CIRCLE_BY_STATE: Record<string, string[]> = {
  "Delhi": ["11"],
  "Haryana": ["12", "13"],
  "Punjab": ["14", "15", "16"],
  "Chandigarh": ["16"],
  "Himachal Pradesh": ["17"],
  "Jammu and Kashmir": ["18", "19"],
  "Ladakh": ["19"],
  "Uttar Pradesh": ["20", "21", "22", "23", "24", "25", "26", "27", "28"],
  "Uttarakhand": ["24", "26"],
  "Rajasthan": ["30", "31", "32", "33", "34"],
  "Gujarat": ["36", "37", "38", "39"],
  "Dadra and Nagar Haveli and Daman and Diu": ["39"],
  "Maharashtra": ["40", "41", "42", "43", "44"],
  "Goa": ["40"],
  "Madhya Pradesh": ["45", "46", "47", "48"],
  "Chhattisgarh": ["49"],
  "Telangana": ["50"],
  "Andhra Pradesh": ["51", "52", "53"],
  "Karnataka": ["56", "57", "58", "59"],
  "Kerala": ["67", "68", "69"],
  "Lakshadweep": ["68"],
  "Tamil Nadu": ["60", "61", "62", "63", "64"],
  "Puducherry": ["60", "67"],
  "West Bengal": ["70", "71", "72", "73", "74"],
  "Sikkim": ["73"],
  "Andaman and Nicobar Islands": ["74"],
  "Odisha": ["75", "76", "77"],
  "Assam": ["78"],
  "Arunachal Pradesh": ["79"],
  "Manipur": ["79"],
  "Meghalaya": ["79"],
  "Mizoram": ["79"],
  "Nagaland": ["79"],
  "Tripura": ["79"],
  "Bihar": ["80", "81", "82", "83", "84", "85"],
  "Jharkhand": ["81", "82", "83"],
};

export function pincodeAgreesWithState(pincode: string, state: string | null | undefined): boolean {
  if (!state) return true;
  const circles = CIRCLE_BY_STATE[state.trim()];
  if (!circles) return true;
  return circles.includes(pincode.slice(0, 2));
}

/** Everything the resolver has to say about a place, in one line for the model. */
function describe(q: PincodeQuery): string {
  return [q.name, q.address, q.city, q.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

/**
 * Look the PIN up. Returns null when nothing trustworthy came back — the
 * caller then behaves exactly as it would for a blank PIN.
 */
export async function resolvePincode(q: PincodeQuery, opts: { timeoutMs?: number; workflow?: AiWorkflow } = {}): Promise<PincodeAnswer | null> {
  const place = describe(q);
  if (place.length < 6) return null;
  // Credentials resolve from the environment (ANTHROPIC_API_KEY in
  // production, an `ant auth login` profile on a laptop). None → the request
  // fails and the catch below turns it into "no answer".
  const client = new Anthropic({ apiKey: anthropicKeyFor(opts.workflow ?? "proposals"), timeout: opts.timeoutMs ?? 45_000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content:
      `Find the Indian postal PIN code for this delivery location:\n\n${place}\n\n` +
      `Search the web (Google Maps / India Post / the business's own listing). ` +
      `Prefer the PIN shown on the business's Google listing for that exact branch. ` +
      `If the location is a chain store, the branch named here is the one that matters, not the head office.\n\n` +
      `Reply with exactly two lines and nothing else:\n` +
      `PINCODE: <six digits, or NONE if you could not establish it with confidence>\n` +
      `LOCALITY: <the post-office / locality name that PIN belongs to, or NONE>`,
  }];

  try {
    for (let turn = 0; turn < 4; turn++) {
      const res = await client.messages.create({
        model: PINCODE_MODEL,
        max_tokens: 2048,
        system:
          "You are a postal lookup service for an Indian courier desk. You answer with facts you found in search results, never from memory alone. " +
          "A wrong PIN misroutes a parcel; when sources disagree or none names the branch, answer NONE.",
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "IN" } }],
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages,
      });
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      return parseAnswer(text, q.state);
    }
    return null;
  } catch (err) {
    console.warn("[pincode-resolver] lookup failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Exported for tests: the two-line contract, validated. */
export function parseAnswer(text: string, state: string | null | undefined): PincodeAnswer | null {
  const pin = /PINCODE:\s*([1-9][0-9]{5})\b/i.exec(text)?.[1] ?? null;
  if (!pin) return null;
  if (!pincodeAgreesWithState(pin, state)) return null;
  const loc = /LOCALITY:\s*(.+)/i.exec(text)?.[1]?.trim() ?? null;
  return { pincode: pin, locality: loc && !/^none$/i.test(loc) ? loc.slice(0, 120) : null };
}
