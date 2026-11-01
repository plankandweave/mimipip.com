import { brand } from "../brand/current";
// The brief a collaborating creator receives: her code, her link, what she
// has agreed to make, and the hashtags to use. Pure — the route sends it.

import { SITE_URL } from "@/lib/seo";
import { trackingPath } from "@/lib/collab-codes";

export type BriefInput = {
  name: string;
  code: string;
  slug: string;
  discountPct: number;
  maxValueInr: number | null;
  freeShipping: boolean;
  codeExpiresAt: string | null;
  allowedTitles: string[];
  hashtags: string[];
  deliverables: { kind: string; description: string | null; due_on: string | null }[];
};

const KIND_LABEL: Record<string, string> = {
  reel: "Instagram Reel",
  story: "Instagram Story",
  post: "Instagram post",
  carousel: "Instagram carousel",
  youtube: "YouTube video",
  short: "YouTube Short",
  blog: "Blog post",
  ugc_raw: "Raw footage for our own use",
  other: "Other",
};
export const deliverableLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * When a work email may leave: 9 am to 7 pm India time, never on a Sunday
 * (founder's standing rule). Returns `now` when it is inside the window, or
 * the next 9:05 am IST on a working day — handed to Resend as scheduledAt so
 * a brief written at midnight lands at a civil hour without a cron of ours.
 */
export function nextSendWindow(now: Date = new Date()): Date {
  const IST = 5.5 * 3600_000;
  const local = new Date(now.getTime() + IST); // fields read as UTC = IST wall clock
  const dow = local.getUTCDay(); // 0 = Sunday
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (dow !== 0 && minutes >= 9 * 60 && minutes < 19 * 60) return now;
  const next = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 9, 5));
  if (minutes >= 9 * 60 || dow === 0) next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - IST);
}

export function briefEmail(b: BriefInput): { subject: string; html: string } {
  const first = b.name.trim().split(/\s+/)[0] || b.name;
  const link = `${SITE_URL}${trackingPath(b.slug)}`;
  const codeLink = `${SITE_URL}/r/${encodeURIComponent(b.code)}`;
  const gift =
    b.discountPct >= 100
      ? b.maxValueInr
        ? `your wall, on us, up to ₹${Math.round(b.maxValueInr).toLocaleString("en-IN")}`
        : "your wall, on us"
      : `${b.discountPct}% off your wall${b.maxValueInr ? `, up to ₹${Math.round(b.maxValueInr).toLocaleString("en-IN")}` : ""}`;

  const p = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:10px 0;border-top:1px solid #E0E0E0;color:#6B6B6B;font-size:13px;width:150px;vertical-align:top;">${label}</td><td style="padding:10px 0;border-top:1px solid #E0E0E0;color:#2D2D2D;font-size:14px;">${value}</td></tr>`;

  const deliverables = b.deliverables.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 18px;">${b.deliverables
        .map((d) =>
          row(
            esc(deliverableLabel(d.kind)),
            `${d.description ? esc(d.description) : "&nbsp;"}${d.due_on ? `<br><span style="color:#6B6B6B;font-size:13px;">By ${esc(longDate(d.due_on))}</span>` : ""}`,
          ),
        )
        .join("")}<tr><td colspan="2" style="border-top:1px solid #E0E0E0;"></td></tr></table>`
    : "";

  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 18px;">
    ${row("Your code", `<strong style="font-family:Menlo,Consolas,monospace;letter-spacing:0.04em;">${esc(b.code)}</strong>`)}
    ${row("What it covers", `${esc(gift)}${b.freeShipping ? ", delivery included" : ""}${b.allowedTitles.length ? `<br><span style="color:#6B6B6B;font-size:13px;">For ${esc(b.allowedTitles.join(", "))}</span>` : ""}`)}
    ${row("How to use it", `Order on ${esc(new URL(brand.origin).host)} with this email address and enter the code at checkout. It works once.${b.codeExpiresAt ? ` Please place the order by ${esc(longDate(b.codeExpiresAt))}.` : ""}`)}
    ${row("Your link", `<a href="${link}" style="color:#2D2D2D;">${esc(link.replace(/^https:\/\//, ""))}</a><br><span style="color:#6B6B6B;font-size:13px;">Please use this link in your bio, on Story link stickers and under your posts, so we can see what your audience enjoys.</span>`)}
    ${b.hashtags.length ? row("Hashtags", esc(b.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "))) : ""}
    <tr><td colspan="2" style="border-top:1px solid #E0E0E0;"></td></tr>
  </table>`;

  const body = `
    ${p(`Dear ${esc(first)},`)}
    ${p("Thank you for choosing to create with us. It is a pleasure to have you on board, and we are looking forward to seeing your space come to life.")}
    ${p("Everything you need is below, in one place.")}
    ${details}
    ${deliverables ? `${p("<strong style=\"color:#2D2D2D;\">What we agreed</strong>")}${deliverables}` : ""}
    ${p(`When you are ready, you can start from <a href="${codeLink}" style="color:#2D2D2D;">this page</a>, which carries your code straight to checkout.`)}
    ${p("If anything is unclear, or you would like help choosing a design or measuring your wall, simply reply to this email and we will take care of it.")}
    ${p(`With warm regards,<br>Team ${esc(brand.name)}`)}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border:1px solid #E0E0E0;">
<tr><td style="padding:36px 40px 8px;font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#8C7B6B;letter-spacing:0.06em;">${esc(brand.name)} · Creator collaboration</td></tr>
<tr><td style="padding:8px 40px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2D2D2D;">${body}</td></tr>
<tr><td style="padding:0 40px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B6B6B;line-height:1.6;">${esc(brand.description)}${brand.contactEmail ? `<br><a href="mailto:${esc(brand.contactEmail)}" style="color:#6B6B6B;">${esc(brand.contactEmail)}</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `Your ${brand.name} collaboration, ${first}: your code and brief`, html };
}
