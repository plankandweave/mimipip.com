// What to tell ourselves when a client has done something.
//
// A pure composer — no database, no mailer — so the wording can be tested, which
// matters more than usual here: this is the only thing standing between "a
// client captured a tower" and "nobody here noticed for a week".
//
// The rules it follows, in order of how much they matter:
//
//  1. THE SUBJECT LINE IS THE WHOLE MESSAGE. It is read on a phone, in a list,
//     next to forty other things. If it does not say who and what, the mail has
//     failed regardless of what is inside it.
//  2. EVERY LINE SAYS WHERE. "6 walls" is not actionable; "6 walls in One BKC ·
//     Level 12 · Lift lobby" is.
//  3. WHAT WE OWE THEM COMES FIRST. A client waiting on us outranks a client
//     who has just given us work, because the first one is losing patience and
//     the second one is not.

export type AlertKind = "walls" | "walkthrough" | "approved" | "waiting_library" | "stuck";

export type AlertItem = {
  kind: AlertKind;
  /** Identity of the thing, so the sweep can record that it was reported. */
  subjectId: string;
  accountName: string;
  /** "One BKC · Level 12 · Lift lobby", or just the account for account-level
   *  items. Never empty. */
  where: string;
  /** How many walls, which design was approved — the specific fact. */
  detail: string;
};

export type Digest = { subject: string; html: string; text: string };

/** Waiting-on-us first, then decisions, then new work. Within a kind, the order
 *  they arrived in — which is the order they happened. */
const RANK: Record<AlertKind, number> = {
  // A job that has stopped is worse than a client waiting on a decision: the
  // client at least knows they are waiting, and this one nobody knows about.
  stuck: 0,
  waiting_library: 1,
  approved: 2,
  walkthrough: 3,
  walls: 4,
};

const LEAD: Record<AlertKind, (i: AlertItem) => string> = {
  stuck: (i) => `${i.accountName}'s design run has stopped — ${i.detail}`,
  waiting_library: (i) => `${i.accountName} are waiting on us — ${i.detail}`,
  approved: (i) => `${i.accountName} approved a design — ${i.detail}`,
  walkthrough: (i) => `${i.accountName} recorded a walkthrough — ${i.detail}`,
  walls: (i) => `${i.accountName} captured ${i.detail}`,
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Build the mail, or null when there is nothing to say.
 *
 * Returning null rather than an empty digest is deliberate: a sweep that mails
 * "nothing happened" every fifteen minutes trains the reader to ignore it, and
 * the one that matters then arrives in a folder nobody opens.
 */
export function composeDigest(items: AlertItem[], deskUrl: string): Digest | null {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  const waiting = sorted.filter((i) => i.kind === "waiting_library" || i.kind === "stuck");
  const accounts = [...new Set(sorted.map((i) => i.accountName))];

  // The subject names the single most important thing when there is one clear
  // winner, and counts when there is not. "3 updates" tells nobody anything.
  const first = sorted[0]!;
  const subject = sorted.length === 1
    ? LEAD[first.kind](first)
    : waiting.length > 0
      ? `${LEAD[waiting[0]!.kind](waiting[0]!)}, and ${sorted.length - 1} more`
      : accounts.length === 1
        ? `${accounts[0]} — ${sorted.length} updates on their walls`
        : `${sorted.length} updates from ${accounts.length} clients`;

  const lines = sorted.map((i) => ({
    lead: LEAD[i.kind](i),
    where: i.where,
    urgent: i.kind === "stuck" || i.kind === "waiting_library" || i.kind === "approved",
  }));

  const text = [
    ...lines.map((l) => `• ${l.lead}\n  ${l.where}`),
    "",
    deskUrl,
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#171b22;line-height:1.55">
  <h2 style="margin:0 0 16px;font-size:17px">${esc(subject)}</h2>
  <ul style="margin:0 0 20px;padding:0;list-style:none">
    ${lines.map((l) => `<li style="margin:0 0 14px;padding:0 0 0 12px;border-left:3px solid ${l.urgent ? "#171b22" : "#d5d8dd"}">
      <div style="font-size:14px;${l.urgent ? "font-weight:600" : ""}">${esc(l.lead)}</div>
      <div style="font-size:12px;color:#5a626f;margin-top:2px">${esc(l.where)}</div>
    </li>`).join("")}
  </ul>
  <p style="margin:0 0 18px;font-size:13px;color:#5a626f">
    Their own screen already tells them what to do next. This is the half they cannot see.
  </p>
  <p style="margin:0">
    <a href="${esc(deskUrl)}" style="display:inline-block;background:#171b22;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Open the desk</a>
  </p>
</div>`;

  return { subject, html, text };
}
