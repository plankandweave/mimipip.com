// A partner's portal as an app on their phone's home screen (Vijay Sales,
// 8 October 2026: "everything is just like an app in front of him"). The
// storefront's own manifest (src/app/manifest.webmanifest/route.ts) opens the shop at "/", so a
// partner who installed from inside their portal landed on the shop. Each
// partner gets a manifest of its own, scoped to its portal, that opens
// straight on its dashboard — where "Waiting on you" leads.

/** "Vijay Sales India Private Limited" → "Vijay Sales": the home-screen label
 *  has room for about twelve characters. */
export function partnerShortName(name: string): string {
  const short = name
    .replace(/\b(india\s+)?(private|pvt\.?)\s+(limited|ltd\.?)\s*$/i, "")
    .replace(/\b(limited|ltd\.?|llp|inc\.?)\s*$/i, "")
    .trim();
  return short || name;
}

export function partnerManifest(account: { slug: string; name: string }) {
  const home = `/partners/${account.slug}`;
  const short = partnerShortName(account.name);
  return {
    id: home,
    name: `${short} · Zyvorah`,
    short_name: short,
    description: `${account.name}'s Zyvorah portal — approvals, orders and documents.`,
    // The sign-in page sends a signed-in partner on to their dashboard, so it
    // is the right door whether or not this phone has signed in yet.
    start_url: `${home}?source=app`,
    // No trailing slash: the sign-in page itself is `/partners/<slug>`.
    scope: home,
    display: "standalone",
    background_color: "#FBFBFD",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/api/brand/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/api/brand/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/api/brand/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/api/brand/icon-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
