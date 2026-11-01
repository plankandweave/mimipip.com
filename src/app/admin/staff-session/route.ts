import { NextRequest, NextResponse } from "next/server";
import { accessIdentity, mintStaffSession, STAFF_COOKIE, STAFF_SESSION_SECONDS } from "@/lib/staff-access";

// The one door. This path sits under /admin, so Cloudflare Access fronts it: a
// visitor who has not signed in with Google never reaches this code, and one who
// has arrives with an identity Access itself vouched for. All this route does is
// turn that identity into a cookie the rest of the app — including /api/*, which
// Access does not front — can verify on its own.
//
// Two callers:
//   fetch("/admin/staff-session")            → JSON, used by a staff page on load
//   link to /admin/staff-session?next=/path  → redirect, the "sign in" link
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const identity = await accessIdentity(request);
  const requested = request.nextUrl.searchParams.get("next");
  const destination = requested && requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : null;

  if (!identity) {
    // Access should have turned this request away before it reached the app, so
    // arriving here means one of its two signals did not survive the hop. Say
    // which, in booleans: without this the only symptom is a staff page that
    // will not open, and no way to tell a missing header from a rejected token.
    // Safe to return — this path is inside the Access application, and it
    // reveals nothing a caller did not already send.
    return NextResponse.json(
      {
        error: "unauthorized",
        saw: {
          identityHeader: !!request.headers.get("cf-access-authenticated-user-email"),
          jwtHeader: !!request.headers.get("cf-access-jwt-assertion"),
          accessCookie: /(?:^|;\s*)CF_Authorization=/.test(request.headers.get("cookie") ?? ""),
        },
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const token = await mintStaffSession(identity.email);
  if (!token) {
    // No signing secret in this runtime. Say so plainly rather than handing back
    // a cookie that verifies as nothing.
    return NextResponse.json(
      { error: "staff sessions are not configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const response = destination
    ? NextResponse.redirect(new URL(destination, request.url), 303)
    : NextResponse.json({ email: identity.email });

  response.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_SESSION_SECONDS,
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}
