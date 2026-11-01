"use client";

import { useEffect, useState } from "react";

// "Install app" in a partner's portal header: puts the portal on the phone's
// home screen, opening on its dashboard (lib/partner-app.ts). The shop's
// install card stays quiet on /partners on purpose — a partner at work should
// not be sold to — so the portal offers its own, only when asked: a button,
// never a pop-up. Hidden once the portal is running as the installed app.

type InstallPrompt = Event & { prompt: () => Promise<void> };

export default function PortalInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iphone|ipad|ipod/i.test(ua));
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt && !ios) return null;
  return (
    <span className="relative">
      <button type="button" className="font-semibold text-indigo-600"
        onClick={async () => { if (prompt) { await prompt.prompt(); setPrompt(null); } else setHint(h => !h); }}>
        Install app
      </button>
      {hint && (
        <span role="status" className="absolute right-0 top-7 z-40 w-60 rounded-xl border border-stone-200 bg-white p-3 text-xs font-normal leading-relaxed text-stone-600 shadow-sm">
          In Safari, tap the Share button, then <b>Add to Home Screen</b>. The portal then opens like an app and keeps you signed in.
        </span>
      )}
    </span>
  );
}
