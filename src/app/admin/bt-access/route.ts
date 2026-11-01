import { NextRequest, NextResponse } from "next/server";
import {
  BT_ALLOWED_EMAIL,
  BT_SESSION_COOKIE,
  BT_SESSION_SECONDS,
  createBtSession,
} from "@/lib/bt-access";

export async function GET(request: NextRequest) {
  const email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (email !== BT_ALLOWED_EMAIL) {
    return new NextResponse("This edition is private.", {
      status: 403,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }

  const secret = process.env.BT_SESSION_SECRET;
  if (!secret) {
    return new NextResponse("The private reader is not configured.", { status: 503 });
  }

  const requested = request.nextUrl.searchParams.get("next") ?? "/bt";
  const destination = /^\/bt(?:\/|$)/.test(requested) ? requested : "/bt";
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set(BT_SESSION_COOKIE, await createBtSession(secret), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/bt",
    maxAge: BT_SESSION_SECONDS,
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}
