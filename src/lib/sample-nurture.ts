import { SITE_URL } from "./seo";
import { toMediaUrl } from "@/lib/media-url";
import { emailWordmark } from "@/lib/email-wordmark";

/**
 * After a design sample is delivered (founder, 12 October 2026).
 *
 * "Whenever a sample is delivered, confirm it to the customer and ask: your
 * sample is delivered, would you like to place the order? Then talk to them
 * about it in different ways every alternate day for a week, then once a week
 * for a month, then once a month for the next six months, then mark lost."
 *
 * And the rule that governs every word below: the messages are written from
 * the customer's side of the page and carry only what a customer would want to
 * read. No order numbers, no internal names, nothing about how or why the
 * message was sent. `sample-nurture.test.ts` sweeps the copy for it.
 *
 * Pure: the schedule and the emails. The cron (`/api/cron/sample-nurture`)
 * owns the database and the sending.
 */

/** Days after delivery on which each message is due. Index = message number.
 *  0: the delivery confirmation and the question. Then every alternate day
 *  for the first week (2, 4, 6), weekly for a month (13, 20, 27, 34), and
 *  monthly for six months (64 … 214). */
export const NURTURE_DAYS = [0, 2, 4, 6, 13, 20, 27, 34, 64, 94, 124, 154, 184, 214] as const;

/** A month after the last message with no order, the sample is marked lost. */
export const LOST_AFTER_DAYS = NURTURE_DAYS[NURTURE_DAYS.length - 1] + 30;

const DAY_MS = 86_400_000;

export type NurtureDecision =
  | { kind: "send"; step: number }
  | { kind: "lost" }
  | { kind: "wait" };

/**
 * What to do today for one customer. `sent` is how many messages have gone.
 * A run that was missed (a Sunday, a failed tick) never sends a backlog: if
 * several messages are due, only the LATEST due one goes, so the customer
 * never receives two in a row.
 */
export function nurtureDecision(deliveredAt: Date, sent: number, now: Date): NurtureDecision {
  const days = (now.getTime() - deliveredAt.getTime()) / DAY_MS;
  if (sent >= NURTURE_DAYS.length) return days >= LOST_AFTER_DAYS ? { kind: "lost" } : { kind: "wait" };
  let due = -1;
  for (let i = sent; i < NURTURE_DAYS.length; i++) if (days >= NURTURE_DAYS[i]) due = i;
  if (due < 0) return { kind: "wait" };
  return { kind: "send", step: due };
}

export type NurtureInput = {
  name?: string | null;
  designTitle: string;
  designHandle: string;
  finish?: string | null;
  imageUrl?: string | null;
  whatsappUrl: string;
  unsubscribeUrl?: string | null;
};

type Copy = {
  subject: string;
  heading: string;
  paragraphs: string[];
  cta: { label: string; href: string };
};

const designUrl = (h: string) => `${SITE_URL}/products/${encodeURIComponent(h)}`;
const orderUrl = (h: string) => `${designUrl(h)}?configure=1`;

/** The fourteen messages. `d` is the design title, `f` the finish phrase. */
function copyFor(step: number, i: NurtureInput): Copy {
  const d = i.designTitle;
  const f = i.finish ? ` in ${i.finish}` : "";
  const h = i.designHandle;
  switch (step) {
    case 0:
      return {
        subject: `Your ${d} sample has arrived`,
        heading: "Your sample is with you",
        paragraphs: [
          `Your ${d} sample${f} has been delivered. We hope it feels every bit as lovely in your hands as it looked on screen.`,
          `Would you like to place the order for your wall? Share your wall's width and height, and we will print ${d} to fit it exactly.`,
        ],
        cta: { label: `Order ${d}`, href: orderUrl(h) },
      };
    case 1:
      return {
        subject: `How does ${d} look in your light?`,
        heading: "Try it in morning and evening light",
        paragraphs: [
          `Colours change through the day. Hold your ${d} sample against the wall in the morning, and again in the evening with your lamps on, to see how it lives in your room.`,
          `If it feels right in both, your wall is only a few steps away.`,
        ],
        cta: { label: "Plan my wall", href: orderUrl(h) },
      };
    case 2:
      return {
        subject: "Measuring your wall takes two minutes",
        heading: "All we need is two numbers",
        paragraphs: [
          `To print ${d} for your wall, we only need its width and height. Our short guide shows exactly where to measure.`,
          `If anything is unusual about the wall, such as a window, a door or a sloping ceiling, simply send us a photograph and we will help.`,
        ],
        cta: { label: "How to measure", href: `${SITE_URL}/how-to-measure` },
      };
    case 3:
      return {
        subject: `See ${d} on your own wall`,
        heading: "Picture it in your room",
        paragraphs: [
          `A sample shows the colour and the finish. To see the whole design across your wall, take a photograph of the room and place ${d} on it.`,
          `It takes a minute, and it is often the moment the decision becomes easy.`,
        ],
        cta: { label: "See it in my room", href: `${SITE_URL}/see-it-in-my-room` },
      };
    case 4:
      return {
        subject: `${d}, made for your wall`,
        heading: "Printed to your measurements",
        paragraphs: [
          `Every Zyvorah wall is prepared for your order, to the size of your wall, with the design scaled so it sits beautifully from corner to corner.`,
          `The ${d} you are holding is exactly the finish your wall will have.`,
        ],
        cta: { label: `Order ${d}`, href: orderUrl(h) },
      };
    case 5:
      return {
        subject: "Would you like us to install it for you?",
        heading: "We can take care of the fitting",
        paragraphs: [
          `If you would rather not hang ${d} yourself, our installation team can fit it for you, so all you need to do is enjoy the finished wall.`,
          `Have a look at how it works, or reply to this email and we will tell you more.`,
        ],
        cta: { label: "About installation", href: `${SITE_URL}/installation` },
      };
    case 6:
      return {
        subject: "A few questions we are often asked",
        heading: "Before you decide",
        paragraphs: [
          `Can I choose any size? Yes. Every wall is printed to its own measurements.`,
          `Can I use ${d} on more than one wall? Of course. Add each wall to the same order.`,
          `Do you deliver to my city? We deliver across India, free of charge.`,
          `Anything else on your mind? Simply reply and we will answer.`,
        ],
        cta: { label: `View ${d}`, href: designUrl(h) },
      };
    case 7:
      return {
        subject: "Still deciding? Take your time",
        heading: "The right wall is worth the wait",
        paragraphs: [
          `Choosing a wall is a big decision, and there is no rush. If ${d} is the one, it will be ready whenever you are.`,
          `And if you would like to compare it with something else, our collections are a lovely place to wander.`,
        ],
        cta: { label: "Explore our designs", href: `${SITE_URL}/collections` },
      };
    case 8:
      return {
        subject: `Thinking of you and ${d}`,
        heading: "A wall that feels like you",
        paragraphs: [
          `It has been a little while since your ${d} sample arrived. We hope it has found a good spot to sit while you think.`,
          `Whenever you are ready to bring it to the whole wall, we would be glad to make it for you.`,
        ],
        cta: { label: `Order ${d}`, href: orderUrl(h) },
      };
    case 9:
      return {
        subject: "New designs, if you would like a look",
        heading: "Fresh from the studio",
        paragraphs: [
          `New designs have joined the collection since your ${d} sample arrived. If you are still deciding, they may be worth a look.`,
          `We would be happy to send a sample of any of them too.`,
        ],
        cta: { label: "See what is new", href: `${SITE_URL}/new` },
      };
    case 10:
      return {
        subject: `Styling a room around ${d}`,
        heading: "Let the wall lead the room",
        paragraphs: [
          `A patterned wall looks its best with calm walls beside it. Pick one or two colours from ${d} for cushions, curtains or a throw, and the room comes together on its own.`,
          `If you would like a second opinion on the wall to choose, send us a photograph of the room.`,
        ],
        cta: { label: `View ${d}`, href: designUrl(h) },
      };
    case 11:
      return {
        subject: "Ready for a change at home?",
        heading: "For the moment you are ready",
        paragraphs: [
          `Moving home, welcoming guests, or simply wanting a room to feel new again, a single wall can change how a whole room feels.`,
          `${d} is ready to be printed for your wall whenever the moment comes.`,
        ],
        cta: { label: "Plan my wall", href: orderUrl(h) },
      };
    case 12:
      return {
        subject: "We are here whenever you are ready",
        heading: "Happy to help you choose",
        paragraphs: [
          `If you are torn between designs, sizes or rooms, we are always happy to talk it through with you.`,
          `Send us a message on WhatsApp, or simply reply to this email.`,
        ],
        cta: { label: "Message us on WhatsApp", href: i.whatsappUrl },
      };
    default:
      return {
        subject: `A last note about your ${d} sample`,
        heading: "Thank you for considering Zyvorah",
        paragraphs: [
          `This is our last note about your ${d} sample, as we would not want to fill your inbox.`,
          `Whenever you would like to bring it to your wall, or to look at something new, simply reply to this email and we will be delighted to help.`,
        ],
        cta: { label: `View ${d}`, href: designUrl(h) },
      };
  }
}

const CLOUD = "#FAFAF7";
const CHARCOAL = "#0F0F0F";
const SLATE = "#3f3f3f";
const MIST = "#6b6b6b";
const SAGE = "#a9d5b0";
const MOBILE_CSS = "@media only screen and (max-width:600px){.zy-pad{padding-left:22px!important;padding-right:22px!important}}";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One message of the sequence, as the customer reads it. */
export function sampleNurtureEmail(step: number, input: NurtureInput): { subject: string; html: string; text: string } {
  const c = copyFor(step, input);
  const firstName = input.name?.trim()?.split(/\s+/)[0] || null;
  const greeting = firstName ? `Dear ${firstName},` : "Hello,";
  const image = input.imageUrl
    ? `<tr><td style="padding:0;"><a href="${esc(designUrl(input.designHandle))}"><img src="${esc(toMediaUrl(input.imageUrl))}" alt="${esc(input.designTitle)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>`
    : "";
  const paras = c.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${SLATE};">${esc(p)}</p>`)
    .join("");
  const optOut = input.unsubscribeUrl
    ? `<br>Prefer not to hear from us? <a href="${esc(input.unsubscribeUrl)}" style="color:${MIST};">Unsubscribe</a>.`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 20px;"><div style="line-height:0;">${emailWordmark(30)}</div></td></tr>
        ${image}
        <tr><td class="zy-pad" style="padding:28px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-bottom:18px;">${esc(c.heading)}</div>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${SLATE};">${esc(greeting)}</p>
          ${paras}
          <div style="margin-top:22px;"><a href="${esc(c.cta.href)}" style="display:inline-block;background:${CHARCOAL};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 30px;border-radius:9999px;">${esc(c.cta.label)}</a></div>
          ${step === 12 ? "" : `<div style="font-size:14px;margin-top:16px;"><a href="${esc(input.whatsappUrl)}" style="color:${CHARCOAL};font-weight:700;">Prefer to talk it through? WhatsApp us</a></div>`}
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            With warm regards, Team Zyvorah<br>
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@zyvorah.com" style="color:${SLATE};">hello@zyvorah.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">zyvorah.com</a>${optOut}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  const text = [greeting, "", ...c.paragraphs.flatMap((p) => [p, ""]), `${c.cta.label}: ${c.cta.href}`, "", "With warm regards,", "Team Zyvorah", "zyvorah.com"].join("\n");
  return { subject: c.subject, html, text };
}
