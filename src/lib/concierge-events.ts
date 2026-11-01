// Event payloads deliberately contain no email, OTP, photo, message or URL.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CLIENT_EVENTS = [
  "opened", "closed", "auth_prompted", "code_requested", "code_request_failed",
  "code_request_succeeded", "verification_started", "verification_failed",
  "verification_succeeded", "auth_completion_failed", "chat_ready", "code_restart",
  "message_submitted", "reply_received", "reply_error", "network_error", "stream_incomplete",
] as const;
export type ClientEvent = typeof CLIENT_EVENTS[number];
export type ServerEvent = "code_request_received" | "code_sent" | "code_send_failed" |
  "auth_completed" | "auth_complete_failed" | "request_received" | "auth_blocked" |
  "request_rejected" | "user_saved" | "reply_saved" | "reply_failed" | "storage_failed";
export type EventContext = { sessionId: string; turnId?: string; isTest?: boolean };
export type EventExtra = { status?: number; durationMs?: number };
export function eventContext(value: unknown): EventContext | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.sessionId !== "string" || !UUID.test(v.sessionId)) return null;
  return { sessionId: v.sessionId, ...(typeof v.turnId === "string" && UUID.test(v.turnId) ? { turnId: v.turnId } : {}), isTest: v.isTest === true };
}
export function clientEvent(value: unknown) {
  const context = eventContext(value);
  if (!context) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !UUID.test(v.id) || !CLIENT_EVENTS.includes(v.event as ClientEvent)) return null;
  return { ...context, id: v.id, event: v.event as ClientEvent,
    ...(Number.isInteger(v.status) && Number(v.status) >= 100 && Number(v.status) <= 599 ? { status: Number(v.status) } : {}),
    ...(Number.isInteger(v.durationMs) && Number(v.durationMs) >= 0 && Number(v.durationMs) <= 600_000 ? { durationMs: Number(v.durationMs) } : {}),
  };
}
