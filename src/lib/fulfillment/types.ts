// The shape of a paid order as it leaves this app.
//
// The store does not book couriers. It once did — there was a pluggable
// ShippingProvider here with a Shiprocket implementation behind it — and that
// was wrong for a reason worth keeping written down: paid is not shippable.
// Booking at payment mints an AWB, and eventually summons a courier, for a
// mural that has not been printed yet.
//
// So dispatch belongs to the OS, which books against the one event that means
// the print is genuinely committed — the bridge acking the files into the hot
// folder — and asks for the pickup only once a human has confirmed the print
// came off the roll. See lib/zyvorah-shiprocket.ts in the OS repo.
//
// What survives here is the payload: every paid order is handed to the OS
// (see os-sync.ts), and this is what it is handed. The AWB comes back the
// other way, through /api/production/event.

export type ShippingOrder = {
  order_id: string;
  order_number: number;
  email: string | null;
  phone: string | null;
  subtotal: number;
  shipping_address: {
    name?: string;
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    countryCode?: string;
  } | null;
  items: { title: string; qty: number; line_total: number; area_sqft: number; height_cm: number }[];
};
