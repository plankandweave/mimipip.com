// Some catalogue rows are SERVICES, not designs you can look at and buy by the
// square foot. They exist as products only because the cart/order pipeline is
// keyed on a product handle — but they must never be presented like a design.
//
// A service has no pattern to inspect, so none of the design tooling applies:
// no zoomable gallery, no "See it on your wall" room visualiser, no design
// visualiser (drag/zoom to set pattern scale), no per-sq-ft price, no sample,
// no attributes/reviews/"complete the look". Showing those is not just noise —
// on a service page the gallery's pills fire visualiser events that nothing is
// listening for, so they are dead controls.
//
// `custom-wallpaper` is a special case: it's the container SKU that the Print
// Your Own flow adds to the cart, and it has no artwork of its own at all
// (that's the flat-image-rule exemption). Its own URL is not a page a customer
// should ever land on — /print-your-own is the real experience.

export const BESPOKE_SERVICE_HANDLE = "bespoke-customisation";
export const CUSTOM_PRINT_HANDLE = "custom-wallpaper";

/** Service handles that must render as a service, never as a design. */
export const SERVICE_HANDLES: readonly string[] = [BESPOKE_SERVICE_HANDLE, CUSTOM_PRINT_HANDLE];

/** True when this handle is a service rather than a wallpaper design. */
export function isServiceHandle(handle: string): boolean {
  return SERVICE_HANDLES.includes(handle);
}

/**
 * Where a service handle sends a visitor instead of rendering a product page.
 * Each service has ONE real home — its landing page, which explains how it
 * works and what it costs. A second, thinner page competing on the same URL
 * space would just be duplicate content.
 */
export function serviceRedirect(handle: string): string | null {
  if (handle === CUSTOM_PRINT_HANDLE) return "/print-your-own";
  if (handle === BESPOKE_SERVICE_HANDLE) return "/bespoke";
  return null;
}
