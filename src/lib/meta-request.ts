// Meta match signals carried by an incoming request.
//
// The Conversions API matches a server event to a person far better when it
// carries the two cookies Meta's own browser script sets:
//
//   _fbp  the browser id fbevents.js writes on first load
//   _fbc  the click id, written when a visitor arrives on a ?fbclid= link —
//         this is the one that ties a conversion to a specific ad click
//
// Neither is hashed; Meta takes them raw. Both are absent for an organic
// visitor, which is fine — user_data simply carries fewer identifiers.
//
// Pure: takes a Request, returns plain values, so it is testable without a
// server.

/** Read one cookie out of a request's Cookie header. */
export function cookieFromRequest(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export type MetaRequestContext = {
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  userAgent: string | null;
};

/**
 * Cloudflare terminates TLS, so `cf-connecting-ip` is the visitor's real
 * address; x-forwarded-for is the fallback and its FIRST entry is the client
 * (the rest are proxies, and sending a proxy's address as the shopper's is
 * worse than sending none).
 */
export function metaContextFromRequest(req: Request): MetaRequestContext {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    fbp: cookieFromRequest(req, "_fbp"),
    fbc: cookieFromRequest(req, "_fbc"),
    ip:
      req.headers.get("cf-connecting-ip") ||
      (forwarded ? forwarded.split(",")[0]!.trim() || null : null),
    userAgent: req.headers.get("user-agent"),
  };
}
