"use client";

import { useCanvasJourney } from "./ShoppingJourney";

import { usePathname } from "next/navigation";
import { storeWhatsappHref } from "@/lib/whatsapp";
import { gaEvent } from "@/lib/ga";
import { metaTrack } from "@/lib/meta-pixel";

/**
 * Count the click. Deliberately NOT a Google Ads / Meta "Lead": a tap on a
 * chat button is not yet an enquiry, and feeding it to the bidders as one
 * would teach them to buy taps. GA gets a plain event; Meta gets its standard
 * Contact event, which exists for exactly this.
 */
export function trackWhatsappClick(placement: string): void {
  gaEvent("whatsapp_click", { placement, page_path: location.pathname });
  metaTrack("Contact", { content_category: placement });
}

/**
 * The floating "chat on WhatsApp" button, on every storefront page.
 *
 * Bottom-right, lifted by --sticky-cta-h (the height the product page, the
 * cart and the office builder publish for their sticky bars) so it never sits
 * on an Add to Cart button. z-30 keeps it under the invitation cards (z-40)
 * that use the same corner, so a card, when shown, simply covers it.
 *
 * The opening message names the page the visitor is on, so the first reply
 * can be about the design they were looking at.
 *
 * On a phone product page it steps aside while the pinned price bar is up
 * (`html[data-configure-bar]`, set by MobileConfigureBar): the bar carries its
 * own small WhatsApp button (WhatsAppBarButton), and the floating one sat on
 * the page's text above it (founder, 8 October 2026). Icon-only on a phone,
 * 44px — big enough to tap, small enough not to cover a heading.
 */
function useWhatsappMessage() {
  const canvas = useCanvasJourney();
  const pathname = usePathname() ?? "/";
  const onDesign = pathname.startsWith("/products/");
  const message = onDesign
    ? `Hi Zyvorah, I'd like to know more about this design: https://zyvorah.com${pathname}`
    : canvas ? "Hi Zyvorah, I'm looking for canvas artwork." : "Hi Zyvorah, I'm looking for wallpaper for my wall.";
  return { onDesign, message };
}

const WHATSAPP_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current" focusable="false">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.1-1.2-.2-.1-.4-.2Z" />
  </svg>
);

/** The small round WhatsApp button that lives inside the product page's
 *  pinned price bar, beside Buy now, instead of floating over the page. */
export function WhatsAppBarButton() {
  const { message } = useWhatsappMessage();
  return (
    <a
      href={storeWhatsappHref(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsappClick("configure-bar")}
      aria-label="Chat with us on WhatsApp"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-charcoal"
    >
      {WHATSAPP_ICON}
    </a>
  );
}

export function WhatsAppButton() {
  const { onDesign, message } = useWhatsappMessage();

  return (
    <a
      href={storeWhatsappHref(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsappClick(onDesign ? "floating-product" : "floating")}
      aria-label="Chat with us on WhatsApp"
      className="wa-launcher fixed right-4 z-30 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-edge bg-surface px-3 text-sm font-semibold sm:h-12 sm:px-4 text-charcoal shadow-lg transition hover:border-charcoal sm:right-5"
      style={{ bottom: "calc(1.25rem + var(--sticky-cta-h, 0px) + var(--configure-bar-h, 0px))" }}
    >
      {WHATSAPP_ICON}
      <span className="hidden sm:inline">Chat on WhatsApp</span>
    </a>
  );
}
