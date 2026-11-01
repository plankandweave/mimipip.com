import { gaEvent } from "./ga";
import { visitorReady } from "./visitor-ready";

/** A failed first beacon must not permanently erase this visitor's intent. */
export function configurationTracker(handle: string, dependencies = {
  ready: visitorReady,
  send: (body: string) => fetch("/api/configuration-event", {
    method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true,
  }),
  event: gaEvent,
}, extra: Record<string, unknown> = {}) {
  let recorded = false;
  let pending = false;
  let gaRecorded = false;
  return async () => {
    if (recorded || pending) return;
    pending = true;
    try {
      if (!gaRecorded) {
        dependencies.event("configuration_start", { item_id: handle });
        gaRecorded = true;
      }
      await dependencies.ready();
      recorded = (await dependencies.send(JSON.stringify({ ...extra, handle }))).ok;
    } catch {
      // A later interaction can retry; telemetry never blocks the wall builder.
    } finally {
      pending = false;
    }
  };
}
