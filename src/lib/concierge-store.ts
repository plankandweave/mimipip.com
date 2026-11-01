import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { chatMessageId, confirmedWrite } from "./concierge-records";
import type { ClientEvent, ServerEvent, EventContext, EventExtra } from "./concierge-events";

export async function recordConciergeEvent(context: EventContext, event: ClientEvent | ServerEvent,
  extra: EventExtra = {}, source: "client" | "server" = "server", id: string = randomUUID()) {
  const db = supabaseAdmin();
  const failed = () => console.error("[concierge] event_storage_failed", { sessionId: context.sessionId, event, id });
  if (!db) { failed(); return false; }
  return confirmedWrite(() => db.from("concierge_events").upsert({
    id, session_id: context.sessionId, turn_id: context.turnId ?? null, event, source,
    is_test: context.isTest === true, status: extra.status ?? null, duration_ms: extra.durationMs ?? null,
  }, { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(3000)), failed);
}

export async function saveConciergeMessage(context: EventContext, identity: string,
  role: "user" | "assistant", content: string, products: string[] | null = null) {
  const db = supabaseAdmin();
  const failed = () => console.error("[concierge] chat_storage_failed", { sessionId: context.sessionId, turnId: context.turnId, role });
  if (!db || !context.turnId) { failed(); await recordConciergeEvent(context, "storage_failed"); return false; }
  const saved = await confirmedWrite(() => db.from("chat_messages").upsert({
    id: chatMessageId(identity, context.sessionId, context.turnId!, role), session_id: context.sessionId,
    role, content: content.slice(0, 4000), products, surface: context.isTest ? "concierge:diagnostic" : "concierge",
  }, { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(3000)), failed);
  await recordConciergeEvent(context, saved ? (role === "user" ? "user_saved" : "reply_saved") : "storage_failed");
  return saved;
}
