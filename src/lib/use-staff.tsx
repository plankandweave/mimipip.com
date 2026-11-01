"use client";

import { useEffect, useState } from "react";
import { ensureStaffSession, staffSignInHref } from "./admin-rpc";

export type StaffState = "checking" | "in" | "out";

/**
 * Is a staff member signed in on this page?
 *
 * This replaced the "Enter the admin key" screen that opened all fifteen staff
 * pages. On /admin and /studio Cloudflare Access has already required the Google
 * sign-in before the page rendered at all, so this is one quick round trip that
 * turns that into the session cookie the API routes read — not a second
 * password, and nothing for anyone to remember, copy or leak.
 */
export function useStaff(): StaffState {
  const [state, setState] = useState<StaffState>("checking");
  useEffect(() => {
    let live = true;
    ensureStaffSession().then((staff) => {
      if (live) setState(staff ? "in" : "out");
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** What a staff page shows while it is deciding, and when nobody is signed in. */
export function StaffGate({ state, title }: { state: StaffState; title?: string }) {
  return (
    <div
      style={{
        maxWidth: 420,
        margin: "80px auto",
        fontFamily: "Inter, system-ui",
        padding: 24,
      }}
    >
      {title ? <h1 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h1> : null}
      {state === "checking" ? (
        <p style={{ color: "#57606a", fontSize: 14 }}>Checking your sign-in…</p>
      ) : (
        <>
          <p style={{ color: "#57606a", fontSize: 14, marginBottom: 16 }}>
            You&rsquo;re signed out. Staff pages open with your Google account.
          </p>
          <a
            href={staffSignInHref()}
            style={{
              display: "inline-block",
              padding: "10px 16px",
              background: "#0F0F0F",
              color: "#fff",
              borderRadius: 999,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Sign in with Google
          </a>
        </>
      )}
    </div>
  );
}
