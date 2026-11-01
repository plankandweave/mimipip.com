import { supabase } from "@/lib/supabase";
import { normaliseEmail } from "@/lib/subscribe-rules";

/**
 * Put an email on the newsletter — the server half of the subscribe line
 * (src/lib/subscribe-disclosure.ts) every email surface shows. Calls the one
 * database rule, auto_subscribe, which never re-subscribes anyone who
 * unsubscribed, bounced or is in DoNotContact. Best-effort: a failure here is
 * logged and never fails the order, sample or message it rides on.
 */
export async function autoSubscribe(email: unknown, source: string): Promise<void> {
  const addr = normaliseEmail(email);
  if (!addr) return;
  const { error } = await supabase.rpc("auto_subscribe", { p_email: addr, p_source: source.slice(0, 60) });
  if (error) console.error(`[subscribe] auto_subscribe(${source}) failed:`, error.message);
}
