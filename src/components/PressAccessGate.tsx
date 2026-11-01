"use client";

import { useEffect, useState } from "react";
import { OutreachForm } from "./OutreachForm";

const SESSION_KEY = "zyvorah:press-kit-unlocked";

// Gates the press kit's downloads (logos + hi-res imagery) behind the same
// press inquiry form already on the page — no separate download-only form.
// Submitting runs our checks + an AI assessment synchronously (see
// /api/outreach), and a verdict of anything but "pass" (the scam/advertorial-
// fishing signal) unlocks the section below immediately, in this browser —
// no waiting on Roheena. She still gets the full dossier by email either way,
// so nothing about her own review loop changes; this only gates the assets.
export function PressAccessGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    // A per-tab convenience, not a security boundary — the underlying files
    // aren't secret, this just spares a repeat visitor the form a second time
    // within the same session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionStorage.getItem(SESSION_KEY)) setUnlocked(true);
  }, []);

  if (unlocked) return <>{children}</>;

  return (
    <div className="rounded-[20px] border border-edge bg-wash p-6 sm:p-8">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-mist">Verify to access</p>
      <p className="mt-2 text-lg text-charcoal">A couple of details first</p>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        We check every request automatically, so most are verified instantly — tell us who you are and
        what you&apos;re working on, and the logos and hi-res imagery unlock right here the moment it clears.
        This is the same note that reaches Roheena, so it does double duty as your press request too.
      </p>
      <OutreachForm
        kind="press"
        onUnlocked={() => {
          sessionStorage.setItem(SESSION_KEY, "1");
          setUnlocked(true);
        }}
      />
    </div>
  );
}
