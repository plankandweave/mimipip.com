"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/AuthModal";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function AccessGate({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  return <main className="iilm-access"><div className="iilm-access-card">
    <p className="iilm-eyebrow">Zyvorah · Private presentation</p>
    <h1>IILM Greater Noida</h1>
    <p>{signedIn ? "This email address is not on the presentation access list." : "Please verify an invited IILM email address to view the proposal."}</p>
    {signedIn
      ? <button onClick={async () => { await supabaseBrowser.auth.signOut(); router.refresh(); }}>Use an invited email <span aria-hidden="true">↗</span></button>
      : <button onClick={() => setAuthOpen(true)}>Continue with work email <span aria-hidden="true">↗</span></button>}
  </div>
    <AuthModal emailOnly open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { setAuthOpen(false); router.refresh(); }} reason="view the IILM Greater Noida presentation" />
  </main>;
}
