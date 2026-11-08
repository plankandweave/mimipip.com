import { SITE_URL } from "./seo";
import { toMediaUrl } from "@/lib/media-url";
import { estimateInstallHours } from "./pricing";
import { emailWordmark } from "@/lib/email-wordmark";

// Branded, email-client-safe HTML (inline styles, table layout). One wrapper +
// one content block per lifecycle stage. Every email leads with the order's own
// image (the customer's room mockup when they placed one, else the design).

export type OrderEmailData = {
  order_number: number;
  /** The ZVY number — the one series the whole business quotes. Shown to the
   *  customer in place of the store's internal id; null only on an order
   *  placed before retail numbering, where the id still stands in. */
  zvy?: string | null;
  access_token?: string | null;
  total?: number | string | null;
  courier?: string | null;
  awb?: string | null;
  tracking_url?: string | null;
  order_copy_url?: string | null;
  imageUrl?: string | null; // room mockup or design image for the hero
  productTitle?: string | null; // the design name, for a caption
  // Kept for callers; deliberately NOT rendered — the contribution is shown to
  // a customer only on the paid thank-you screen (Roheena, 11 October 2026).
  contribution?: number | null;
  installByUs?: boolean; // true when the order includes our on-site installation
  installAreaSqft?: number | null; // total sq ft our team will fit (drives the time estimate)
  // Live from the OS at send time (never stored here) — see lib/os-install.ts.
  installerName?: string | null;
  installerPhone?: string | null;
  startOtp?: string | null; // read out to the fitter to begin work
};

const SAGE = "#a9d5b0";

const p = (text: string, top = 12) =>
  `<div style="font-size:13px;color:${SLATE};margin-top:${top}px;line-height:1.6;">${text}</div>`;

/** How long the fitting will take, from this order's own measured area. */
function fittingTimeLine(d: OrderEmailData): string {
  const area = d.installAreaSqft && d.installAreaSqft > 0 ? Math.round(d.installAreaSqft) : null;
  return area
    ? `Your walls come to roughly <strong>${area.toLocaleString("en-IN")} sq ft</strong>, so please set aside <strong>${estimateInstallHours(area).label}</strong> for the fitting — careful work, with a short lunch break somewhere in between.`
    : `An installer usually needs about two to three hours for every 100 sq ft of wall, with a short lunch break in between.`;
}

/** The fitter's name and number, once the OS has assigned them. */
function installerLine(d: OrderEmailData): string {
  if (!d.installerName && !d.installerPhone) return "";
  const who = d.installerName ? `<strong>${d.installerName}</strong>` : "Your installer";
  const tel = d.installerPhone
    ? ` You can reach him directly on <a href="tel:${d.installerPhone.replace(/[^+\d]/g, "")}" style="color:${CHARCOAL};font-weight:700;text-decoration:none;">${d.installerPhone}</a>.`
    : "";
  return p(`${who} will be fitting your wallpaper.${tel}`);
}

/** A prominent, readable OTP chip — the code the customer reads out. */
function otpChip(label: string, code: string, note: string): string {
  return `
    <div style="margin-top:16px;text-align:center;padding:18px;border:1.5px dashed #d8d8d8;border-radius:14px;background:#fbfdfe;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${label}</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:0.22em;color:${CHARCOAL};margin-top:8px;font-family:monospace;">${code}</div>
      <div style="font-size:12px;color:${SLATE};margin-top:8px;line-height:1.5;">${note}</div>
    </div>`;
}

/** One numbered step of the installation journey. */
function step(n: number, title: string, body: string): string {
  return `
    <tr>
      <td width="30" valign="top" style="padding:9px 10px 0 0;">
        <div style="width:22px;height:22px;border-radius:11px;background:${CHARCOAL};color:#ffffff;font-size:12px;font-weight:800;text-align:center;line-height:22px;font-family:Arial,Helvetica,sans-serif;">${n}</div>
      </td>
      <td valign="top" style="padding:8px 0 0;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:13px;font-weight:700;color:${CHARCOAL};">${title}</div>
        <div style="font-size:13px;color:${SLATE};margin-top:3px;line-height:1.6;">${body}</div>
      </td>
    </tr>`;
}

/**
 * The complete "what to expect" for an installation, start to finish — written
 * so there is no ambiguity left about who arrives, what the OTPs are for, and
 * what actually closes the order.
 *
 * `stage` tunes the framing only; the journey itself is identical, because the
 * customer should recognise the same five steps in both emails:
 *   "placed"     — at order time, so they know the shape of what's coming.
 *   "dispatched" — on the day it ships, when the start OTP is live.
 */
function installJourney(d: OrderEmailData, stage: "placed" | "dispatched"): string {
  const otpStep = d.startOtp
    ? `Read out the <strong>installation OTP</strong> shown above. He enters it in his app, and that begins the job — it is how we know the right person reached you, on time.`
    : `You'll read out an <strong>installation OTP</strong> to him, which we'll send you with your dispatch email. He enters it in his app, and that begins the job — it is how we know the right person reached you, on time.`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
      ${step(1, "We print, then we dispatch", stage === "placed"
        ? "Your mural is printed to your exact measurements. The moment it leaves us, you'll get a dispatch email with tracking — and everything you need for installation day, in that same email."
        : "Done — your mural is printed, checked and on its way to you.")}
      ${step(2, "Your installer calls to fix a time", "He'll agree a day and a slot with you before he comes. You can also confirm the time from your order page.")}
      ${step(3, "He arrives, and you share the start OTP", otpStep)}
      ${step(4, "The fitting itself", `${fittingTimeLine(d)} He'll hang the panels <strong>left to right</strong> — that is how our installers are trained, and it is what will happen unless you ask for something else.`)}
      ${step(5, "A closure OTP, and your thumbs-up", "When he's finished, he presses <em>complete</em> in his app and you'll receive a <strong>closure OTP</strong>. Share it only once you've seen the work and you're happy — then give us a thumbs-up on your order page. That closes your order, and only then is he paid. Your happiness is the last word on the job.")}
    </table>`;
}

/**
 * What a screen can and cannot promise, and the QC photograph that follows.
 *
 * Said at ORDER time, kindly and before any money feels spent — colour is the
 * single thing most likely to surprise someone when the roll is unwrapped, and
 * a customer who was told to expect it reads a warm print as warm, not wrong.
 * Shown on every order: it is about the print itself, whether we fit it or the
 * courier simply leaves it at the door.
 */
function colourAndQcBlock(): string {
  return `
    <div style="margin-top:24px;border:1px solid #ececec;border-left:3px solid #f0c9a8;border-radius:12px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">A word about colour</div>
      ${p("What you saw on your screen and what arrives at your wall will never be quite the same thing — and that is the nature of print, not a fault in it. A screen makes colour by shining light at you; ink can only catch the light already in the room and hand it back.", 8)}
      ${p("So your wall will keep changing all day. Morning light will cool it, a warm bulb will deepen it, and whatever sits nearby — a wooden floor, a green curtain, a bright sofa — will lend it a little of their own colour. Most people come to love this. It is what makes a printed wall feel alive rather than printed.")}
      ${p("You won't be left guessing, though. Before your order leaves us, we'll send you a <strong>QC photograph of your actual printed panels</strong> — the real ink, not the screen — so you see exactly what is coming before it reaches your door.")}
    </div>`;
}

/**
 * Where the fitter's work begins and ends, and the two or three things the
 * household needs to have ready.
 *
 * Said plainly at order time so nobody discovers it with a man already at the
 * door: he does not shift furniture, he needs buckets and a ladder from the
 * house, and he clears his own mess but not the room. Written as a household
 * getting ready for a guest rather than a contract exclusion clause — the
 * facts are firm, the tone isn't.
 */
function installScopeBlock(): string {
  const label = (t: string, top = 16) =>
    `<div style="font-size:12px;font-weight:700;color:${CHARCOAL};margin-top:${top}px;">${t}</div>`;
  return `
    <div style="border-top:1px solid #f0f0f0;margin-top:18px;padding-top:14px;">
      ${label("What to have ready for him", 0)}
      ${p("Please have the wall clear and anything standing against it moved away before he arrives. <strong>Our installers don't move furniture</strong> — they come with paste and ladders, not trolleys, and your own things are far safer in the hands of people who know which of them is fragile.", 8)}
      ${p("He'll also need <strong>two buckets and a ladder</strong> from the house, where the height of the wall calls for one. It's worth keeping them by the wall before he starts, so no one is hunting for a ladder halfway up a panel.")}
      ${label("When the wall is finished")}
      ${p("He'll gather up his own trimmings, offcuts and packaging and take them away with him, then rinse your buckets and hand them back. Do give those buckets a proper wash afterwards — a rinse on site is all he can manage, and dried paste is far easier to shift the same day.", 8)}
      ${p("The floor will want a mop once he's gone, and that one is for your own staff. His work is the wall and his own mess; the room itself we leave to you.")}
    </div>`;
}

/**
 * The installation section, shown only when the order includes our own fitting
 * team. Carries the journey, the fitter's contact, the live OTP when there is
 * one, and the courtesies of the day — a gentle arrival window, grace for
 * weather, and chai. Renders nothing for supply-only orders.
 */
function installationBlock(d: OrderEmailData, stage: "placed" | "dispatched" = "placed"): string {
  if (!d.installByUs) return "";
  const heading = stage === "dispatched" ? "Your installation — what happens now" : "Installation by our team";
  const intro = stage === "dispatched"
    ? p("Your wallpaper is on its way, so here is everything for the fitting — all in this one email, so nothing gets lost across a dozen messages.", 8)
    : p("You've asked us to fit this for you, so here is exactly how it will go — no surprises on the day.", 8);
  const otp = d.startOtp
    ? otpChip("Installation OTP", d.startOtp,
        "Keep this safe. Share it with your installer only when he arrives, to start the work.")
    : "";
  return `
    <div style="margin-top:24px;border:1px solid #ececec;border-left:3px solid ${CYAN};border-radius:12px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${heading}</div>
      ${intro}
      ${installerLine(d)}
      ${otp}
      ${installJourney(d, stage)}
      ${installScopeBlock()}
      <div style="border-top:1px solid #f0f0f0;margin-top:18px;padding-top:14px;">
        ${p("<strong>If you'd like anything done a particular way, say so before he begins.</strong> Which wall to start, a join kept away from a doorway, a socket or a switch you'd like worked around — the moment you hand over the OTP is the moment to tell him. He'll gladly work to it. Left to right is simply what he'll do if nothing is said, and once a panel is on the wall it can't be lifted and moved again.", 0)}
        ${p("Our team will do their best to reach you right on time. Do keep a window of about an hour on either side — the morning's earlier job or the traffic can shift things a little.")}
        ${p("And if the skies open up or something unexpected comes up on the way, please do bear with them. A little rain often means a little delay, and they'll reach you as soon as they safely can.")}
        ${p("And if they happen to be at your home around chai time — the very chai you'd share with the others who help run your home — do offer them a cup. It's a small kindness that means a great deal, and they'll carry that warmth long after the walls are done.")}
      </div>
    </div>`;
}

/**
 * The five steps for a customer fitting it themselves — the mirror of
 * installJourney, for the orders where the courier simply leaves it at the door.
 *
 * Deliberately the same five-step shape as the fitted journey: a supply-only
 * customer is not a lesser customer, and the thing that makes a wall feel
 * looked-after is knowing the sequence before the parcel is open. The paste and
 * the method belong to the printed guide in the box, which is written for the
 * exact media that order was printed on — this is the shape of the day, not a
 * substitute for it.
 */
function selfInstallJourney(stage: "placed" | "dispatched"): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
      ${step(1, "We print, then we dispatch", stage === "placed"
        ? "Your mural is printed to your exact measurements, checked panel by panel, and a QC photograph comes to you before it leaves us."
        : "Done — printed, checked and on its way to you.")}
      ${step(2, "Open it and count it, before anything else",
        "Unroll the panels somewhere flat and clean, check them against your order copy, and lay them out in order. If a panel is short, marked or missing, tell us straight away and we'll reprint it — that is far easier to put right before any paste is mixed than after.")}
      ${step(3, "Get the wall and the tools ready",
        "The wall wants to be clean, dry and sound — no flaking paint, no damp, nothing standing against it. You'll want two buckets, a ladder where the height calls for one, a smoothing brush or a soft roller, and a sharp blade with spare edges. A blunt blade tears wallpaper; a fresh one cuts it.")}
      ${step(4, "Hang it in order, left to right",
        "Your panels are numbered, and they go up in that order. Each carries a small overlap onto the next, so seams are meant to sit slightly over one another rather than butt exactly — that overlap is what makes a join disappear. Smooth from the centre outwards, and never stretch a panel to make it fit; it will spring back as it dries. <strong>The guide in the box has the paste and the method for your exact material</strong> — follow that over anything general.")}
      ${step(5, "Let it settle, then live with it",
        "Seams can look faintly visible while the paste is still wet and close up as it dries. Give it a day before you judge it, and a week before you clean it.")}
    </table>`;
}

/**
 * The self-installation section — everything a supply-only customer needs, and
 * the counterpart to installationBlock. Renders nothing on fitted orders, where
 * installationBlock is doing this job instead.
 *
 * This exists because for most of our orders nobody from Mimi Pip ever reaches
 * the customer's door: they get a parcel and a silence. Telling them the shape
 * of it in advance is the whole difference between a made-to-measure product
 * and a roll bought off a shelf.
 */
function selfInstallBlock(d: OrderEmailData, stage: "placed" | "dispatched" = "placed"): string {
  if (d.installByUs) return "";
  const heading = stage === "dispatched" ? "Putting it up — what happens now" : "Putting it up yourself";
  const intro = stage === "dispatched"
    ? p("Your wallpaper is on its way, so here is the whole of it — what to check when it lands, and how the fitting goes. Keep this email; it's the one to come back to on the day.", 8)
    : p("You're fitting this one yourself, so here is exactly how it will go — worth reading now rather than with a parcel already open on the floor.", 8);
  return `
    <div style="margin-top:24px;border:1px solid #ececec;border-left:3px solid ${CYAN};border-radius:12px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${heading}</div>
      ${intro}
      ${selfInstallJourney(stage)}
      <div style="border-top:1px solid #f0f0f0;margin-top:18px;padding-top:14px;">
        ${p("<strong>If you'd rather not do it yourself, ask us before you start.</strong> We fit walls ourselves in a handful of cities, and where we don't, we can usually point you to someone who does this properly. A good fitter costs less than a wall that has to be reprinted.", 0)}
        ${p("And if you get halfway up a panel and something isn't behaving, stop and email us a photograph rather than pressing on. Wallpaper is very forgiving while it's wet and not at all forgiving once it's dry.")}
      </div>
    </div>`;
}

/**
 * Aftercare — what to do once the wall is actually up.
 *
 * Sent at the end of the job, whichever way the job ended: an installer closing
 * with his OTP, or a parcel simply arriving at a supply-only customer's door.
 * The promise that matters most here is the single-panel reprint: a customer
 * who knows one damaged panel can be replaced never has to fear the wall, and
 * that is the difference between owning a mural and worrying about one.
 */
function aftercareBlock(): string {
  const label = (t: string, top = 16) =>
    `<div style="font-size:12px;font-weight:700;color:${CHARCOAL};margin-top:${top}px;">${t}</div>`;
  return `
    <div style="margin-top:24px;border:1px solid #ececec;border-left:3px solid #a9d5b0;border-radius:12px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Living with it</div>
      ${label("Give it a week", 12)}
      ${p("Let the adhesive cure for a full week before you wipe anything down. It looks finished long before it is finished.", 8)}
      ${label("Cleaning it")}
      ${p("For dust, a dry microfibre cloth is all it needs. For a mark, barely damp — and always blot rather than scrub. Nothing abrasive, no solvents, and no household spray straight onto the wall.", 8)}
      ${label("If a panel is ever damaged")}
      ${p("We keep your exact design and measurements on file permanently. If a panel is ever torn or stained, we can reprint <strong>that one panel</strong> to match the rest — you will never have to redo the room. Just tell us the order number.", 8)}
      ${label("If something looks off")}
      ${p("A lifting edge, a seam that has caught your eye — tell us. That is not a courtesy line; a wall we printed is a wall we stand behind, and most of these are a five-minute fix if we hear about them early.", 8)}
      ${label("And if you would")}
      ${p("Send us a photograph of the finished room whenever you have a moment. Our best work tends to live in other people's houses where nobody can see it.", 8)}
    </div>`;
}

// On phones, tighten the generous desktop side-padding so text isn't cramped.
const MOBILE_CSS = "@media only screen and (max-width:600px){.zy-pad{padding-left:22px!important;padding-right:22px!important}}";

const CLOUD = "#FAFAF7";
const CHARCOAL = "#0F0F0F";
const SLATE = "#3f3f3f";
const MIST = "#6b6b6b";
const CYAN = "#48b3d7";

function orderLink(d: OrderEmailData): string {
  return d.access_token ? `${SITE_URL}/order/${d.access_token}` : `${SITE_URL}`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${CHARCOAL};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 30px;border-radius:9999px;">${label}</a>`;
}

/** What the customer is told to quote: the ZVY number, falling back to the
 *  store's own id for orders that predate retail numbering. */
export const orderLabel = (d: { zvy?: string | null; order_number: number }): string =>
  d.zvy ? `order ${d.zvy}` : `order #${d.order_number}`;

const orderChip = (d: { zvy?: string | null; order_number: number }) =>
  `<span style="display:inline-block;background:#f3f3f0;border-radius:8px;padding:3px 10px;font-weight:700;color:${CHARCOAL};">${d.zvy ? `Order ${d.zvy}` : `Order #${d.order_number}`}</span>`;

function heroImage(d: OrderEmailData): string {
  if (!d.imageUrl) return "";
  // Mail clients fetch this from outside — R2-migrated URLs must go out in
  // their /media spelling, since the Supabase copy is being retired.
  d = { ...d, imageUrl: toMediaUrl(d.imageUrl) };
  const caption = d.productTitle
    ? `<div style="padding:12px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${MIST};font-weight:700;">${d.productTitle}</div>`
    : "";
  return `<tr><td style="padding:0;">
      <img src="${d.imageUrl}" alt="${d.productTitle || "Your Mimi Pip design"}" width="820" style="display:block;width:100%;max-width:820px;height:auto;" />
    </td></tr>${caption ? `<tr><td>${caption}</td></tr>` : ""}`;
}

function wrap(d: OrderEmailData, opts: { accent: string; kicker: string; heading: string; body: string; cta?: { label: string; href: string }; footNote?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${opts.accent};"></td></tr>
        ${heroImage(d)}
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${opts.kicker}</div>
          <div style="font-size:26px;line-height:1.22;font-weight:800;color:${CHARCOAL};margin-top:8px;">${opts.heading}</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">${opts.body}</div>
          ${opts.cta ? `<div style="margin-top:26px;">${button(opts.cta.label, opts.cta.href)}</div>` : ""}
          ${opts.footNote ? `<div style="font-size:12px;color:${MIST};margin-top:22px;line-height:1.5;">${opts.footNote}</div>` : ""}
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const named = (d: OrderEmailData) => (d.productTitle ? `<strong>${d.productTitle}</strong>` : "your design");

/**
 * The founder's personal note — AI-written per order, wrapped in the brand
 * shell. `letterHtml` is 2–3 <p> paragraphs from Claude (no greeting/signature).
 *
 * Deliberately ONLY a thank-you: their design at the top, a few warm words,
 * a signature. Everything practical — colour, the fitting, what to have ready
 * — follows an hour later in orderDetailsEmail(), because a letter that opens
 * with delight and then turns into a checklist stops being a letter. The one
 * concession is a slim line naming the order and linking to it, so the email
 * is still actionable if they need us today.
 */
export function founderNoteEmail(
  d: OrderEmailData,
  opts: { letterHtml: string; firstName?: string | null; designLine?: string | null; isSample?: boolean },
): { subject: string; html: string } {
  const greeting = opts.firstName ? `Dear ${opts.firstName},` : "Hello,";
  const orderLine = `
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #ececec;font-size:13px;color:${MIST};line-height:1.6;">
      ${opts.isSample ? "Your sample" : "Your order"} &middot;
      <strong style="color:${CHARCOAL};">${d.zvy ?? `#${d.order_number}`}</strong>${opts.designLine ? ` &middot; ${opts.designLine}` : ""}
      &nbsp;·&nbsp; <a href="${orderLink(d)}" style="color:${CHARCOAL};font-weight:700;">view it here</a>
      <br>${opts.isSample
        ? "Everything else about your sample follows in a separate note shortly."
        : "The practical details — colour, timings and how the fitting works — follow in a separate note shortly."}
    </div>`;

  const body = `
    <div style="font-size:15px;line-height:1.7;color:${SLATE};">
      <p style="margin:0 0 14px;">${greeting}</p>
      ${opts.letterHtml}
      <p style="margin:20px 0 0;">With warmth,</p>
      <p style="margin:2px 0 0;"><strong style="color:${CHARCOAL};">Roheena</strong><br><span style="color:${MIST};font-size:13px;">Founder, Mimi Pip</span></p>
      ${orderLine}
    </div>`;

  const subject = opts.firstName
    ? `${opts.firstName}, a personal note from Roheena at Mimi Pip ✦`
    : `A personal note from Roheena at Mimi Pip ✦`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:#c9b8f0;"></td></tr>
        ${heroImage(d)}
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:8px 40px 0;font-family:Georgia,'Times New Roman',serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;font-family:Arial,Helvetica,sans-serif;">A note from our founder</div>
          ${body}
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  return { subject, html };
}

export function orderQueuedEmail(d: OrderEmailData) {
  // The PDF sits in a private bucket, so the email links to the durable
  // per-order route rather than the stored file reference — a signed URL would
  // be dead long before the customer opens this. Falls back to the stored URL
  // for the rare order with no access token.
  const copyHref = d.order_copy_url
    ? d.access_token
      ? `${SITE_URL}/order/${d.access_token}/doc/copy`
      : d.order_copy_url
    : null;
  const proofLine = copyHref
    ? `<br><br>The exact composition you approved — crop, scale and position — is saved in your <a href="${copyHref}" style="color:${CHARCOAL};font-weight:700;">order copy (PDF)</a>. That's precisely what we'll print.`
    : "";
  return {
    subject: `We've got it — ${orderLabel(d)} is queued to print`,
    html: wrap(d, {
      accent: "#c9b8f0",
      kicker: "Order confirmed",
      heading: "Your wall is about to become the best part of the room ✦",
      body: `Thank you — ${orderChip(d)} is confirmed, and ${named(d)} is now queued to print, cut to your exact wall.<br><br>Everything from here is automated, so printing can begin very soon.${proofLine}<br><br>Changed your mind? You can cancel within 12 hours — but only while it's still queued. Once the press starts, it's locked in.<br><br>A separate note follows shortly with the practical side — colour, timings${d.installByUs ? " and how the fitting will run" : ""}.`,
      cta: { label: "View or cancel your order", href: orderLink(d) },
    }),
  };
}

/**
 * The practical companion to the founder's letter, sent an hour later.
 *
 * Everything a customer actually needs to act on lives here — what colour will
 * really do, the QC photograph, and for a fitted order the whole installation
 * journey, what to have ready, and where the installer's work ends. Kept apart
 * from the letter on purpose: delight and logistics are both better for not
 * being in the same breath, and an hour's gap means this arrives when the
 * excitement has settled and the practical questions have started.
 */
export function orderDetailsEmail(d: OrderEmailData) {
  const fitted = !!d.installByUs;
  return {
    subject: `The practical bits for ${orderLabel(d)}${fitted ? " — including installation day" : ""}`,
    html: wrap(d, {
      accent: "#f0c9a8",
      kicker: "What happens next",
      heading: fitted
        ? "Everything you need before we arrive ✦"
        : "A few things worth knowing about your wall ✦",
      body:
        `You'll have had a note from Roheena a little while ago. This is the practical companion to it — ` +
        `the things worth knowing before ${named(d)} reaches you, gathered in one place so nothing arrives as a surprise.` +
        `${colourAndQcBlock()}${installationBlock(d)}${selfInstallBlock(d)}`,
      cta: { label: "View your order", href: orderLink(d) },
      footNote: "Keep this one — it's the email to come back to on the day.",
    }),
  };
}

export function productionStartedEmail(d: OrderEmailData) {
  return {
    subject: `It's printing — ${orderLabel(d)} is on the press`,
    html: wrap(d, {
      accent: CYAN,
      kicker: "Now printing",
      heading: "Ink, meet wall — your mural is printing ✦",
      body: `The press is running and ${named(d)} is being printed to your exact measurements, colour-matched across every panel.<br><br>Great walls take a little time, so we're giving yours the care it deserves. Because printing has begun, this order can no longer be changed or cancelled.`,
      cta: { label: "Track your order", href: orderLink(d) },
    }),
  };
}

export function productionCompleteEmail(d: OrderEmailData) {
  return {
    subject: `Printed & perfect — ${orderLabel(d)} ships next`,
    html: wrap(d, {
      accent: "#a9d5b0",
      kicker: "Printed",
      heading: "Printed, checked, and ready for its journey ✦",
      body: `${named(d)} has finished printing and passed our quality check — every panel inspected, every colour true.<br><br>${orderChip(d)} now goes out with our very next dispatch, and we'll email your tracking the moment it leaves us.`,
      cta: { label: "View your order", href: orderLink(d) },
    }),
  };
}

export function orderShippedEmail(d: OrderEmailData) {
  const trackingBlock = d.tracking_url
    ? `<br><br>Follow it, door to door:<br><br>${button("Track your parcel", d.tracking_url)}`
    : d.awb
      ? `<br><br>Courier: <strong>${d.courier ?? "—"}</strong> &middot; Tracking (AWB): <strong>${d.awb}</strong>`
      : "";
  // Install-by-us orders get the whole installation story here — the fitter, the
  // start OTP and the closure flow — deliberately in this ONE email rather than
  // spread across several, so nothing important gets lost in the customer's inbox.
  const closing = d.installByUs
    ? `<br><br>Everything you need for installation day is below — please keep this email handy.`
    : `<br><br>Everything you need for the fitting is below, along with how to look after it once it's up — the guide's in the box too, and we're an email away if you need us.`;
  // Supply-only orders have no installer and no closure OTP, so dispatch is the
  // last time we can reach the customer before the wall goes up. That makes this
  // email their aftercare email as well — the fitted orders get theirs later,
  // from installCompleteEmail, when there is actually a finished wall to talk about.
  const aftercare = d.installByUs ? "" : aftercareBlock();
  return {
    // Only promise the OTP in the subject if we actually have one to show.
    subject: d.startOtp
      ? `On its way — ${orderLabel(d)} has shipped (your installation OTP inside)`
      : `On its way — ${orderLabel(d)} has shipped`,
    html: wrap(d, {
      accent: "#f0c9a8",
      kicker: "Shipped",
      heading: "Your walls are about to get a lot more interesting ✦",
      body: `Good news — ${named(d)} is packed and on its way to you${d.courier ? `, travelling with <strong>${d.courier}</strong>` : ""}.${trackingBlock}${closing}${installationBlock(d, "dispatched")}${selfInstallBlock(d, "dispatched")}${aftercare}`,
      cta: { label: "View your order", href: orderLink(d) },
      footNote: "Tracking is handled by the courier; delivery timelines are their estimates.",
    }),
  };
}

/**
 * The gift-card recipient email — sent automatically once payment clears, so
 * the buyer no longer has to forward the code themselves. Self-contained (a
 * gift card isn't tied to an order, so this doesn't use OrderEmailData/wrap).
 */
export function giftCardRecipientEmail(input: {
  code: string;
  amountLabel: string; // pre-formatted, e.g. "₹2,000"
  recipientName?: string | null;
  purchaserName?: string | null;
  message?: string | null;
  isSelfPurchase: boolean;
  design?: string | null;
}): { subject: string; html: string } {
  const greetingName = input.recipientName?.trim() || null;
  const greeting = greetingName ? `Hello ${greetingName},` : "Hello,";
  const from = input.purchaserName?.trim() || null;

  const intro = input.isSelfPurchase
    ? `Your Mimi Pip gift card is ready to use.`
    : from
      ? `<strong>${from}</strong> has sent you a Mimi Pip gift card ✦`
      : `You've been sent a Mimi Pip gift card ✦`;

  const messageBlock = input.message?.trim()
    ? `<div style="margin-top:18px;padding:16px 18px;border-left:3px solid ${CYAN};background:#f7fbfc;border-radius:4px;font-style:italic;color:${SLATE};">
        &ldquo;${input.message.trim()}&rdquo;
      </div>`
    : "";

  const codeBlock = `
    <div style="margin-top:24px;text-align:center;padding:22px;border:1.5px dashed #d8d8d8;border-radius:16px;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Your gift code</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:0.06em;color:${CHARCOAL};margin-top:8px;font-family:monospace;">${input.code}</div>
      <div style="font-size:13px;color:${SLATE};margin-top:8px;">Worth ${input.amountLabel} — redeemable at checkout, across every design.</div>
    </div>`;

  const body = `${greeting}<br><br>${intro}${messageBlock}${codeBlock}<br><br>
    <div style="font-size:13px;color:${MIST};">Enter this code in the &ldquo;Gift card&rdquo; field at checkout. It can be used for part or all of an order — any balance left over stays on the card for next time.</div>`;

  // The visual gift card (same design the buyer chose) — a rendered PNG so it
  // shows identically across email clients.
  const cardImgUrl =
    `${SITE_URL}/api/gift-card/image?design=${encodeURIComponent(input.design || "general")}` +
    `&amount=${encodeURIComponent(input.amountLabel)}` +
    (input.recipientName?.trim() ? `&to=${encodeURIComponent(input.recipientName.trim())}` : "") +
    `&v=2`; // bump when the card design changes — busts the CDN cache on the image route
  const cardBlock = `<tr><td class="zy-pad" style="padding:18px 40px 0;">
          <img src="${cardImgUrl}" alt="Mimi Pip gift card — ${input.amountLabel}" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:16px;" />
        </td></tr>`;

  return {
    subject: input.isSelfPurchase
      ? `Your Mimi Pip gift card (${input.amountLabel})`
      : from
        ? `${from} sent you a Mimi Pip gift card ✦`
        : `You've received a Mimi Pip gift card ✦`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:#f0c9a8;"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        ${cardBlock}
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Gift card</div>
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">The gift of a beautiful wall ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">${body}</div>
          <div style="margin-top:26px;">${button("Start shopping", `${SITE_URL}/collections/wall-art`)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * Sent a few days after delivery (not instantly) — a genuine invitation to
 * leave a verified review, never a fabricated testimonial. Links to the
 * specific design's review section; the order number is what verifies it.
 */
export function reviewRequestEmail(input: {
  orderNumber: number;
  /** The ZVY number, when the order has one. */
  zvy?: string | null;
  items: { productHandle: string; productTitle: string }[];
}): { subject: string; html: string } {
  const first = input.items[0];
  const itemLines = input.items
    .slice(0, 3)
    .map((it) => `<li style="margin:4px 0;"><a href="${SITE_URL}/products/${it.productHandle}#reviews" style="color:${CHARCOAL};font-weight:700;">${it.productTitle}</a></li>`)
    .join("");

  return {
    subject: `How's your new wall? Tell us — ${input.zvy ? `order ${input.zvy}` : `order #${input.orderNumber}`}`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:#a9d5b0;"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Order ${input.zvy ?? `#${input.orderNumber}`}</div>
          <div style="font-size:25px;line-height:1.25;font-weight:800;color:${CHARCOAL};margin-top:8px;">How's it looking on your wall? ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            It's been a little while since ${first ? `<strong>${first.productTitle}</strong>` : "your order"} was delivered —
            we hope it's settled in beautifully. If you have a minute, we'd love a genuine review (a photo if you have one) —
            it helps other people picture it in their own space.
            ${itemLines ? `<ul style="margin:14px 0 0;padding-left:18px;">${itemLines}</ul>` : ""}
          </div>
          <div style="margin-top:26px;">${button("Leave a review", first ? `${SITE_URL}/products/${first.productHandle}#reviews` : `${SITE_URL}/collections/wall-art`)}</div>
          <div style="font-size:12px;color:${MIST};margin-top:22px;line-height:1.5;">Have your order number (${input.zvy ?? `#${input.orderNumber}`}) handy — that's how we verify it's a real, delivered purchase.</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * "It's up" — sent the moment the installer presses Complete in his app, from
 * whichever wallpaper order this was: mimipip.com, phone, a corporate portal,
 * the desk. The OS calls this directly with everything it needs (email, name,
 * the fitter's own geo-selfie, and their OWN discount code — the same one
 * printed on the physical insert, never a second code for the order) — it
 * never depends on a matching row existing in the store's own `orders`
 * table, which is what makes the email fire for an order the store may never
 * have known about.
 *
 * The hero is the installer's OWN photo, not the design mockup — the point of
 * this email is proof the wall is real and finished, not a preview of it.
 *
 * discountCode/discountPct are optional: the OS omits them on the rare order
 * that somehow reached completion without ever getting one (see
 * orderDiscountCode() in zyvorah-installer.ts) — the thank-you still goes out,
 * just without the code chip, rather than the whole email failing.
 */
export function installCompleteEmail(input: {
  name?: string | null;
  orderRef: string;
  designName?: string | null;
  photoUrl: string;
  discountCode?: string | null;
  discountPct?: number | null;
}): { subject: string; html: string } {
  const firstName = input.name?.trim()?.split(/\s+/)[0] || null;
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const design = input.designName ? ` — ${input.designName}` : "";

  const discountChip = input.discountCode && input.discountPct
    ? `
    <div style="margin-top:22px;text-align:center;padding:20px;border:1.5px dashed #d8d8d8;border-radius:16px;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Your Mimi Pip code</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:0.05em;color:${CHARCOAL};margin-top:8px;font-family:monospace;">${input.discountCode}</div>
      <div style="font-size:13px;color:${SLATE};margin-top:8px;line-height:1.55;">The same ${input.discountPct}% code from your install guide, in case you haven't used it yet — keep it for your next wall, or pass it to a friend who's been eyeing theirs.</div>
    </div>`
    : "";

  return {
    subject: `It's up! Your wallpaper is installed ✦`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:#a9d5b0;"></td></tr>
        <tr><td style="padding:0;">
          <img src="${input.photoUrl}" alt="Your wall, freshly installed" width="600" style="display:block;width:100%;max-width:600px;height:auto;" />
        </td></tr>
        <tr><td class="zy-pad" style="padding:24px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${input.orderRef}${design}</div>
          <div style="font-size:25px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">It's up — and it's beautiful ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            ${greeting} your wall is finished, just as you see it above — fresh off our installer's own phone, straight from your room.
            Thank you for trusting us with it; we hope it changes how the whole space feels, every day it's lived in.
          </div>
          ${aftercareBlock()}
          ${discountChip}
          <div style="margin-top:24px;">${button("Explore more designs", `${SITE_URL}/collections/wall-art`)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

export function orderCancelledEmail(d: OrderEmailData) {
  return {
    subject: `Order ${d.zvy ?? `#${d.order_number}`} has been cancelled`,
    html: wrap(d, {
      accent: "#e6a8a8",
      kicker: "Cancelled",
      heading: "Your order has been cancelled",
      body: `${orderChip(d)} has been cancelled, as requested. If it was paid, your refund is already on its way back to your original payment method and typically completes within 7 working days.<br><br>Changed your mind, or picked the wrong size? We'd love to help you get it right — just reply to this email.`,
      cta: { label: "Find your design again", href: `${SITE_URL}/collections/wall-art` },
    }),
  };
}

/**
 * Trade partner program (Phase 1 — onboarding/KYC). Self-contained, like
 * giftCardRecipientEmail — there's no order to hang these off. Approval is
 * fully automated (spec: "no human verification step, ever"), so this IS the
 * approval notice, sent the instant every automated check clears.
 */
export function tradeWelcomeEmail(input: {
  legalName: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `You're in — welcome to the Mimi Pip Trade Partner Program ✦`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Trade partner program</div>
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">Welcome, ${input.legalName} ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            Every check passed — PAN, GST status and your bank account are verified, and your account is live.
            You can now place orders for your clients from the full Mimi Pip catalogue, plus your own uploaded designs.
            Commission and payouts follow the terms you agreed to at sign-up; every order is invoiced by Mimi Pip at
            the time of dispatch, so your clients never see the trade pricing behind the scenes.
          </div>
          <div style="margin-top:26px;">${button("Go to your trade dashboard", input.dashboardUrl)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * Welcome for a new authorised RESELLER account on the partner portal
 * (/partners/<slug>). Never sent automatically — the desk sends it
 * deliberately when the account is created, so a reseller is welcomed by a
 * person's decision, not a database trigger. States the standard terms in
 * brief and warns that the first login presents the reseller agreement to
 * review and sign (migration 0095) — the email should never promise a portal
 * the gate then appears to contradict.
 */
export function resellerWelcomeEmail(input: {
  name: string;
  businessName: string;
  portalUrl: string;
  /** ₹ ex-GST per order; null = no minimum set. */
  minOrder: number | null;
  discountPct: number;
}): { subject: string; html: string } {
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const term = (k: string, v: string) =>
    `<tr><td style="padding:7px 14px 7px 0;font-size:13px;color:${MIST};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:7px 0;font-size:13px;color:${CHARCOAL};">${v}</td></tr>`;
  return {
    subject: `Welcome to Mimi Pip — ${input.businessName} is now an authorised reseller`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Authorised reseller</div>
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">Welcome, ${input.name} ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            <strong>${input.businessName}</strong> is now an authorised Mimi Pip reseller, with its own
            portal for ordering made-to-order wallpaper — from our full catalogue or your own uploaded
            artwork — at your reseller rate. Quote freely, commit when your client does, and every
            order is invoiced to your business, never your customer.
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid #ececec;border-bottom:1px solid #ececec;width:100%;">
            ${term("Your pricing", `${input.discountPct}% flat off website pricing, ex-GST — irrespective of volume`)}
            ${term("Payment", "100% in the portal before production begins")}
            ${term("Shipping", "Always to-pay — payable to the carrier on delivery")}
            ${term("Minimum order", input.minOrder && input.minOrder > 0 ? `${inr(input.minOrder)} ex-GST per order` : "No minimum currently set")}
            ${term("Cancellation", "One window only — after you commit an order, before you pay. Payment releases it to production irrevocably.")}
          </table>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:18px;">
            One thing before your first order: when you first sign in, the portal will present the
            Mimi Pip Reseller Agreement — the standard terms above, in full — to review and sign
            online. It takes a couple of minutes and unlocks the portal for your whole team.
          </div>
          <div style="margin-top:26px;">${button("Open your reseller portal", input.portalUrl)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * Sent when any automated check fails. `reason` is a short, honest sentence
 * (never internal vendor jargon) — the partner can fix the underlying issue
 * and re-apply, so this should read as a fixable next step, not a rejection.
 */
export function tradeRejectedEmail(input: {
  legalName: string;
  reason: string;
  applyUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Your Mimi Pip trade partner application`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:#e6a8a8;"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Trade partner program</div>
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">We couldn't verify your application</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            Hi ${input.legalName}, thanks for applying to the Mimi Pip Trade Partner Program. One of our automated checks
            didn't clear:
          </div>
          <div style="margin-top:16px;padding:14px 18px;border-left:3px solid #e6a8a8;border-radius:4px;background:#fdf7f7;font-size:14px;color:${CHARCOAL};">
            ${input.reason}
          </div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            You're welcome to fix this and re-apply — most applications clear on a second try once the detail above
            is corrected.
          </div>
          <div style="margin-top:26px;">${button("Re-apply", input.applyUrl)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * Phase 2 — sent to the END CUSTOMER of a trade order, with the Razorpay
 * payment link. Self-contained, like tradeWelcomeEmail — there's no
 * OrderEmailData to hang this off (the order isn't the recipient's own
 * account). Co-branded with the partner's logo/name (spec: "partner logo may
 * appear on the invoice and payment experience; seller of record is always
 * Mimi Pip") — Mimi Pip is named as the seller throughout, the partner is
 * framed as "your designer/architect", never as the merchant.
 */
export function tradePaymentLinkEmail(input: {
  /** The ZVY number, when the partner's order already has one. */
  zvy?: string | null;
  partnerName: string;
  partnerLogoUrl?: string | null;
  orderNumber: number;
  totalLabel: string; // pre-formatted, e.g. "₹48,200"
  paymentUrl: string;
}): { subject: string; html: string } {
  const logo = input.partnerLogoUrl
    ? `<img src="${input.partnerLogoUrl}" alt="${input.partnerName}" height="28" style="display:block;height:28px;width:auto;margin-bottom:6px;" />`
    : "";
  return {
    subject: `Payment link for your Mimi Pip order ${input.zvy ?? `#${input.orderNumber}`} — placed via ${input.partnerName}`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          ${logo}
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">In partnership with ${input.partnerName}</div>
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">Your order is ready for payment ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            ${input.partnerName} has placed ${orderChip({ zvy: input.zvy, order_number: input.orderNumber })} for you on Mimi Pip — original mural wallpaper designs.
            Mimi Pip is the seller for this order; ${input.partnerName} designed it with you. Complete payment below to confirm it —
            full payment starts production.
          </div>
          <div style="margin-top:24px;padding:16px 18px;border:1px solid #ececec;border-radius:14px;">
            <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MIST};font-weight:700;">Amount due</div>
            <div style="font-size:26px;font-weight:800;color:${CHARCOAL};margin-top:4px;">${input.totalLabel}</div>
          </div>
          <div style="margin-top:26px;">${button("Pay securely with Razorpay", input.paymentUrl)}</div>
          <div style="font-size:12px;color:${MIST};margin-top:16px;line-height:1.5;">
            Trade orders are sized to your wall and non-refundable once dispatched. Questions about the design belong with
            ${input.partnerName}; questions about payment, production or delivery are ours to answer.
          </div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * Sent to a trade partner once RazorpayX confirms their commission payout
 * actually processed (not on payment — see trade_ledger.status='paying' vs
 * 'paid' in src/lib/trade-ledger.ts). Links the self-billed commission
 * invoice when one was generated.
 */
export function tradePayoutEmail(input: {
  orderNumber: number;
  /** The ZVY number, when the order has one. */
  zvy?: string | null;
  netPayoutLabel: string; // pre-formatted, e.g. "₹9,640"
  invoiceUrl: string | null;
}): { subject: string; html: string } {
  return {
    subject: `Commission paid — ${input.netPayoutLabel} for order ${input.zvy ?? `#${input.orderNumber}`}`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};margin-top:8px;">Your commission has been paid ✦</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:16px;">
            ${orderChip({ zvy: input.zvy, order_number: input.orderNumber })} is paid in full and your commission has been sent to your bank account —
            already net of TDS and, where applicable, GST is included on top for you to remit.
          </div>
          <div style="margin-top:24px;padding:16px 18px;border:1px solid #ececec;border-radius:14px;">
            <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MIST};font-weight:700;">Net amount paid</div>
            <div style="font-size:26px;font-weight:800;color:${CHARCOAL};margin-top:4px;">${input.netPayoutLabel}</div>
          </div>
          ${input.invoiceUrl ? `<div style="margin-top:26px;">${button("View self-billed invoice", input.invoiceUrl)}</div>` : ""}
          <div style="font-size:12px;color:${MIST};margin-top:16px;line-height:1.5;">
            This invoice is issued by Mimi Pip on your behalf under GST self-invoicing provisions, with your consent from onboarding —
            you don't need to raise anything separately.
          </div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}

/**
 * The sign-in code for the email gate. Sent through Resend rather than
 * Supabase's built-in mailer, which caps at a handful of messages an hour and
 * would lock customers out at any real traffic level.
 */
export function loginCodeEmail(code: string) {
  return {
    // "<code> is your <brand> ... code" is the canonical phrasing iOS/macOS Mail
    // and Android look for to offer a one-tap "Copy Code" suggestion themselves
    // — the closest thing to a real copy button an email can have, since email
    // clients strip the scripts a JS clipboard button would need to work at all.
    subject: `${code} is your Mimi Pip sign-in code`,
    html: wrap({ order_number: 0 }, {
      accent: SAGE,
      kicker: "Sign in",
      heading: "Here's your code",
      body: `Enter this code on mimipip.com to unlock saving designs and seeing them on your own wall:
        <div style="margin:24px 0 8px;font-size:34px;font-weight:800;letter-spacing:0.22em;color:${CHARCOAL};font-family:'Courier New',Courier,monospace;user-select:all;-webkit-user-select:all;-moz-user-select:all;cursor:text;">${code}</div>
        <div style="font-size:13px;color:${MIST};">Tap once to select the whole code, then copy it in. It expires in an hour and can only be used once.</div>`,
      footNote: `If you didn't try to sign in, you can safely ignore this email — nobody can get in without the code above.`,
    }),
  };
}

/**
 * "Your wall is saved" — the one email a shopper gets after leaving a cart
 * they gave us an email for (cart-followups cron, 7 October 2026).
 *
 * Not a discount and not a countdown: a made-to-measure wall is bought in a
 * conversation, so the email returns the exact wall they priced (a link that
 * rebuilds it on the design page — a cart lives in one browser's cookie and
 * cannot be opened from an inbox) and offers the conversation. Sent once,
 * Mon–Sat 09:00–19:00 IST, from Team Mimi Pip.
 */
export function cartSavedEmail(input: {
  name?: string | null;
  lines: { title: string; handle: string; size: string; material: string; priceLabel: string; resumeUrl: string }[];
  totalLabel: string;
  whatsappUrl: string;
}): { subject: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const firstName = input.name?.trim()?.split(/\s+/)[0] || null;
  const first = input.lines[0];
  const rows = input.lines.slice(0, 4).map((l) => `
          <tr><td style="padding:12px 0;border-top:1px solid #ececec;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:15px;font-weight:700;color:${CHARCOAL};"><a href="${l.resumeUrl}" style="color:${CHARCOAL};text-decoration:none;">${esc(l.title)}</a></div>
            <div style="font-size:13px;color:${MIST};margin-top:2px;">${esc(l.size)} &middot; ${esc(l.material)} &middot; ${esc(l.priceLabel)}</div>
          </td></tr>`).join("");
  return {
    subject: first ? `Your ${first.title} wall is saved` : "Your wall is saved",
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${SAGE};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:24px;line-height:1.28;font-weight:800;color:${CHARCOAL};">${firstName ? `${esc(firstName)}, your` : "Your"} wall is saved</div>
          <div style="font-size:15px;line-height:1.7;color:${SLATE};margin-top:14px;">
            Here is the wall you priced on mimipip.com, exactly as you left it. Every design is sized to your wall's size, so if anything about the size, finish or fitting is unclear, reply to this email or message us on WhatsApp and we will help you finish it.
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">${rows}
            <tr><td style="padding:12px 0;border-top:1px solid #ececec;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${CHARCOAL};"><strong>Total ${esc(input.totalLabel)}</strong> <span style="color:${MIST};font-size:13px;">incl. GST &middot; free delivery across India</span></td></tr>
          </table>
          <div style="margin-top:24px;">${first ? button("Open my wall", first.resumeUrl) : button("Visit mimipip.com", SITE_URL)}</div>
          <div style="font-size:14px;margin-top:16px;"><a href="${input.whatsappUrl}" style="color:${CHARCOAL};font-weight:700;">Prefer to talk it through? WhatsApp us</a></div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            With warm regards, Team Mimi Pip<br>
            Mural wallpaper &amp; hand-designed murals, prepared for your order in India.<br>
            Questions? <a href="mailto:hello@mimipip.com" style="color:${SLATE};">hello@mimipip.com</a> &middot; <a href="${SITE_URL}" style="color:${SLATE};">mimipip.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
  };
}
