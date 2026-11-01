
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import InstallSchedule from "./InstallSchedule";
import InstallFeedback from "./InstallFeedback";

// The ONE QR's destination: every QR printed on a custom order (strip headers
// and the shipping label) lands here — the customer's branded order page.
// Pieces map, sizes, installation guide, personal discount — replacing all
// per-order A4 paperwork. The slug is unguessable (minted by the OS).

export const metadata: Metadata = brandMetadata({
  title: "Your Zyvorah order",
  robots: { index: false, follow: false },
});

export const dynamic = "force-dynamic";

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

type OrderPage = {
  ok: boolean;
  orderNo: string | null;
  firstName: string | null;
  designName: string | null;
  material: string;
  widthMm: number | null;
  heightMm: number | null;
  designWidthMm: number | null;
  designHeightMm: number | null;
  panels: number;
  printStatus: string | null;
  stage: string | null;
  deliveryMethod: string | null;
  orderDate: string | null;
  dispatchedAt: string | null;
  podNo: string | null;
  courier: string | null;
  trackingUrl: string | null;
  discountCode: string | null;
  discountPct: number;
  previewUrl: string | null;
  /** Every mail we've sent about this order, oldest first. Shown collapsed so
   *  the customer can reopen one instead of hunting their inbox — and so no
   *  one internally needs a CC to know it went out. */
  emails?: SentEmail[];
};

type SentEmail = {
  sentAt: string;
  subject: string;
  bodyText: string;
  toEmail: string;
};

/** "13 Aug 2026, 8:55 pm" — fixed to IST so the stamp reads the same for the
 *  customer and for us, wherever the page is opened from. */
function sentStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function ftIn(mm: number): string {
  const totalIn = mm / 25.4;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  if (inch === 12) return `${ft + 1} ft`;
  if (ft === 0) return `${inch} in`;
  return inch ? `${ft} ft ${inch} in` : `${ft} ft`;
}

const STAGE_LABEL: Record<string, string> = {
  queued_for_print: "In production",
  processed: "In production",
  printed: "Printed",
  dispatched: "On its way",
  needs_input: "Being prepared",
};

const PASTE_STEPS = [
  "Prepare a smooth, clean, dry wall — fill cracks, sand, and prime freshly painted walls.",
  "Draw a light vertical plumb line one piece-width from the left corner.",
  "Apply adhesive evenly to the wall, one piece-width at a time (paste the wall, not the paper).",
  "Hang piece P1 against the line and smooth from the centre outwards with a soft squeegee.",
  "Overlap the next piece on the printed seam allowance — the pattern matches automatically.",
  "Trim the excess at top and bottom with a sharp blade; wipe off any paste immediately.",
];
const SELF_ADH_STEPS = [
  "Clean the wall with a dry cloth and let it dry fully — dust is the enemy of adhesion.",
  "Peel 10–15 cm of the liner from the top of piece P1 and stick the top edge level.",
  "Peel the liner away gradually while smoothing downwards and outwards with a squeegee.",
  "Overlap the next piece on the printed seam allowance — the pattern matches automatically.",
  "Trim the excess at top and bottom with a sharp blade.",
  "Repositionable: if a piece goes crooked, peel it back gently and re-stick.",
];

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slug = decodeURIComponent(token).trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,60}$/.test(slug)) notFound();

  let data: OrderPage | null = null;
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/order-page/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) data = (await r.json()) as OrderPage;
  } catch {
    /* fall through to notFound */
  }
  if (!data?.ok) notFound();

  const pieces = Math.max(1, data.panels || 1);
  const pieceW = data.widthMm ? Math.round(data.widthMm / pieces) : null;
  const steps = data.material === "self_adhesive" ? SELF_ADH_STEPS : PASTE_STEPS;
  const stageText = STAGE_LABEL[data.printStatus ?? ""] ?? STAGE_LABEL[data.stage ?? ""] ?? "In production";
  const hasMargin = data.designWidthMm && data.widthMm && data.designWidthMm < data.widthMm - 1;
  const emails = data.emails ?? [];

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">
          {data.firstName ? `Made for ${data.firstName}` : "Made to order"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold">
          {data.designName || "Your wallpaper"}
        </h1>
        <p className="mt-2 text-sm text-slate">
          Order <span className="font-mono font-semibold">{data.orderNo}</span>
          {data.orderDate ? ` · ${data.orderDate}` : ""} ·{" "}
          <span className="font-semibold text-charcoal">{stageText}</span>
        </p>

        {/* The install sheet itself, first (Roheena, 25 Oct 2026): whoever
            scans the strip's QR sees exactly what the fitter's paper says —
            the design with its seams, how many strips and how wide, the
            finished size, the hanging order and the wall. Drawn by the print
            engine from what came off the machine. */}
        <div className="mt-6 overflow-hidden rounded-[18px] border border-edge bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
            <p className="caps text-slate">Installation sheet</p>
            <a href={`/o/${encodeURIComponent(slug)}/sheet?format=pdf`} target="_blank" rel="noopener noreferrer"
              className="text-[0.8rem] font-semibold text-charcoal underline">
              Download PDF
            </a>
          </div>
          <a href={`/o/${encodeURIComponent(slug)}/sheet`} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/o/${encodeURIComponent(slug)}/sheet`}
              alt={`Installation sheet for ${data.orderNo ?? "this order"}: strips, sizes and hanging order`}
              className="block w-full"
            />
          </a>
          <p className="px-4 py-2 text-[11px] text-mist">Tap the sheet to open it full size.</p>
        </div>

        {data.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.previewUrl}
            alt="Your design"
            className="mt-6 w-full rounded-[18px] border border-edge object-cover"
          />
        )}

        {data.dispatchedAt && data.podNo && (
          <div className="mt-6 rounded-[18px] border border-edge bg-surface p-6">
            <p className="caps text-slate">On its way</p>
            <p className="mt-2 text-sm text-slate">
              Your wallpaper has been dispatched{data.courier ? ` via ${data.courier}` : ""}.
            </p>
            <p className="mt-2 text-sm">
              Tracking / POD number: <span className="font-mono font-semibold text-charcoal">{data.podNo}</span>
            </p>
            {data.trackingUrl && (
              <div className="mt-4">
                <a href={data.trackingUrl} target="_blank" rel="noopener noreferrer"
                  className="btn inline-flex h-11 px-6 text-[0.8rem]">
                  Track your shipment
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 rounded-[18px] bg-wash p-6">
          <p className="caps text-slate">Your pieces</p>
          <p className="mt-2 text-sm text-slate">
            {data.designWidthMm && data.designHeightMm && (
              <>Your design is <strong>{ftIn(data.designWidthMm)} × {ftIn(data.designHeightMm)}</strong>. </>
            )}
            {hasMargin && data.widthMm && data.heightMm && (
              <>The print is <strong>{ftIn(data.widthMm)} × {ftIn(data.heightMm)}</strong> including a fitting margin — trim the excess at install. </>
            )}
            It arrives as <strong>{pieces} piece{pieces !== 1 ? "s" : ""}</strong>, hung left to right.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: pieces }, (_, i) => (
              <div key={i} className="rounded-[12px] border border-edge bg-surface px-3 py-2 text-center">
                <div className="font-display text-lg font-bold">P{i + 1}</div>
                {pieceW && data.heightMm && (
                  <div className="text-[11px] text-slate">{ftIn(pieceW)} × {ftIn(data.heightMm)}</div>
                )}
              </div>
            ))}
          </div>
          {/* Total printed area — the installation-billing basis (₹/sq ft), so the
              installer and the customer read the same number off this QR page. */}
          {data.widthMm && data.heightMm && (
            <p className="mt-3 text-sm text-slate">
              Total area: <strong>{((data.widthMm * data.heightMm) / 92903.04).toFixed(1)} sq ft</strong>
              <span className="text-mist"> — installation is billed on this area.</span>
            </p>
          )}
          <p className="mt-3 text-[11px] text-mist">
            Each piece is labelled on its header strip — match P1, P2… and the TOP arrow.
          </p>
        </div>

        <div className="mt-6 rounded-[18px] bg-wash p-6">
          <p className="caps text-slate">
            How to install — {data.material === "self_adhesive" ? "self-sticking" : "paste the wall"}
          </p>
          <ol className="mt-3 space-y-2 text-sm text-charcoal">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display font-bold text-mist">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {data.discountCode && (
          <div className="mt-6 rounded-[18px] border border-edge bg-surface p-6 text-center">
            <p className="font-display text-xl font-extrabold">{data.discountPct}% off your next wallpaper</p>
            <p className="mt-1 text-sm text-slate">Your personal one-time code:</p>
            <p className="mt-2 inline-block rounded-full bg-wash px-4 py-2 font-mono text-sm font-bold">{data.discountCode}</p>
            <div className="mt-4">
              <Link href={`/r/${encodeURIComponent(data.discountCode)}`} className="btn inline-flex h-11 px-6 text-[0.8rem]">
                Use it now
              </Link>
            </div>
          </div>
        )}

        {emails.length > 0 && (
          <div className="mt-6 rounded-[18px] border border-edge bg-surface p-6">
            <p className="caps text-slate">Emails we&rsquo;ve sent you</p>
            <p className="mt-2 text-sm text-slate">
              Every update we email about this order is kept here — open one to read it again.
            </p>
            <div className="mt-4 divide-y divide-edge border-t border-edge">
              {emails.map((m, i) => (
                <details key={i} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4">
                    <span className="text-sm font-semibold text-charcoal group-open:underline">
                      {m.subject}
                    </span>
                    <span className="shrink-0 text-[11px] text-mist">{sentStamp(m.sentAt)}</span>
                  </summary>
                  <div className="mt-3 rounded-[12px] bg-wash p-4">
                    <p className="text-[11px] text-mist">Sent to {m.toEmail}</p>
                    <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate">
                      {m.bodyText.split(/\n{2,}/).map((para, j) => (
                        <p key={j} className="whitespace-pre-line break-words">
                          {para.split("\n").map((line, k) => {
                            const t = line.trim();
                            const isUrl = /^https?:\/\/\S+$/.test(t);
                            return (
                              <span key={k}>
                                {k > 0 && "\n"}
                                {isUrl ? (
                                  <a href={t} className="font-semibold text-charcoal underline">{t}</a>
                                ) : line}
                              </span>
                            );
                          })}
                        </p>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        <InstallSchedule token={slug} />
        <InstallFeedback token={slug} />

        <p className="mt-8 text-center text-xs text-mist">
          Questions? hello@zyvorah.com · Prepared for your order in India
        </p>
      </div>
    </div>
  );
}
