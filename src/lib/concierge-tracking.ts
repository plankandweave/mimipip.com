import type { ClientEvent, EventContext, EventExtra } from "./concierge-events";

// Acknowledged, bounded retries with the SAME id: a lost response cannot double
// count. Nothing about telemetry is awaited by a customer's chat action.
export async function sendConciergeEvent(
  context: EventContext, event: ClientEvent, extra: EventExtra = {},
  send = (body: string) => fetch("/api/concierge/event", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
  }),
) {
  const body = JSON.stringify({ ...context, ...extra, event, id: crypto.randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await send(body);
      if (response.ok) return true;
      if (response.status < 500) return false;
    } catch { /* retry a transient transport failure once */ }
  }
  console.warn("[concierge] journey event not saved", event);
  return false;
}
