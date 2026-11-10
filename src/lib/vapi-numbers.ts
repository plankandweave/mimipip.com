import "./ai-meter"; // every model call is reported to the group's meter
import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("messaging",input,init);
/**
 * What the Vapi account can dial out from, said in one sentence.
 *
 * The follow-up caller stays inert until VAPI_PHONE_NUMBER_ID names a number
 * imported into Vapi. Whether the account already owns one is only knowable
 * with the private key, which lives as a Worker secret — so the cron asks
 * Vapi (GET /phone-number, read-only) and the morning brief prints the answer
 * with the id to set, instead of anyone guessing from the dashboard.
 */
export type VapiNumber = { id?: unknown; number?: unknown; provider?: unknown; name?: unknown; status?: unknown };

export function describeVapiNumbers(list: unknown): string {
  if (!Array.isArray(list)) return "Vapi did not return a phone-number list";
  const nums = (list as VapiNumber[]).filter((n) => n && typeof n.id === "string");
  if (nums.length === 0) {
    return "the Vapi account owns no phone number yet — one must be bought in Vapi or imported (Twilio, Vonage, Telnyx or a SIP trunk) before calls can start";
  }
  const each = nums.map((n) => {
    const label = [n.number, n.name].filter((v) => typeof v === "string" && v).join(" · ") || "unnamed";
    const meta = [n.provider, n.status].filter((v) => typeof v === "string" && v).join(", ");
    return `${label}${meta ? ` (${meta})` : ""}, id ${n.id as string}`;
  });
  return `the Vapi account owns ${nums.length === 1 ? "one number" : `${nums.length} numbers`}: ${each.join("; ")} — set VAPI_PHONE_NUMBER_ID to the one to call from`;
}

/** Read-only probe. Never throws; the key never appears in the result. */
export async function probeVapiNumbers(apiKey: string | undefined): Promise<string> {
  if (!apiKey) return "VAPI_API_KEY not set";
  try {
    const res = await fetch("https://api.vapi.ai/phone-number", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return `Vapi refused VAPI_API_KEY (${res.status}) — the key needs replacing`;
    if (!res.ok) return `Vapi phone-number lookup failed (${res.status})`;
    return describeVapiNumbers(await res.json());
  } catch (e) {
    return `Vapi phone-number lookup failed: ${(e as Error)?.message ?? String(e)}`.split(apiKey).join("***");
  }
}
