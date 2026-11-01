"use client";
import { serviceAvailable } from "@/brand/services";

import { useEffect, useRef, useState } from "react";
import { useAuthGate } from "@/components/AuthGate";
import { VOICE_ENABLED } from "@/lib/voice-flag";

// Voice concierge control for the chat header. Uses VAPI's browser SDK to run a
// live voice call: VAPI does mic capture, speech-to-text and text-to-speech,
// and calls our Custom LLM endpoint (/api/voice/chat) for every reply, which
// runs the same Zyvorah concierge brain as the text chat.
//
// Renders NOTHING unless voice is switched on AND both public config values are
// set, so the feature is dark while VOICE_ENABLED is false or VAPI isn't wired
// up. Gated here rather than at each mount site so every caller is covered.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

type CallState = "idle" | "connecting" | "active" | "error";

// Minimal shape of the bits of the VAPI web client we use — avoids depending on
// the SDK's exported types at build time.
type VapiClient = {
  start: (assistant: string) => Promise<unknown>;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  on: (event: string, cb: (payload?: unknown) => void) => void;
  removeAllListeners: () => void;
};

export function VoiceCall() {
  const { promptAuth, authModal, signedIn } = useAuthGate();
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  // Who's talking right now — drives the "Speaking…" / "Listening…" cue.
  const [speaker, setSpeaker] = useState<"you" | "concierge" | null>(null);
  // Live transcript line (partials included) — doubles as proof the mic path is
  // actually capturing the caller: if you speak and no "You:" caption appears,
  // the words never reached the transcriber.
  const [caption, setCaption] = useState<{ who: "you" | "concierge"; text: string } | null>(null);
  const vapiRef = useRef<VapiClient | null>(null);

  // Tear the call down if the widget unmounts mid-call.
  useEffect(() => {
    return () => {
      try {
        vapiRef.current?.stop();
        vapiRef.current?.removeAllListeners();
      } catch {
        // already gone
      }
    };
  }, []);

  if (!serviceAvailable("ai") || !VOICE_ENABLED || !PUBLIC_KEY || !ASSISTANT_ID) return null;

  const startCall = async () => {
    if (state === "connecting" || state === "active") return;
    // Same email gate as the text concierge — a live call runs the identical
    // Sonnet 5 brain (see /api/voice/chat) and was reachable with no check at
    // all until now, since /api/voice/chat is called by VAPI's servers rather
    // than the browser and so can't see the customer's session itself.
    if (!signedIn) {
      promptAuth("talk with our voice concierge");
      return;
    }
    setState("connecting");
    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(PUBLIC_KEY) as unknown as VapiClient;
      vapiRef.current = vapi;

      vapi.on("call-start", () => setState("active"));
      vapi.on("call-end", () => {
        setState("idle");
        setSpeaker(null);
        setCaption(null);
      });
      vapi.on("speech-start", () => setSpeaker("concierge"));
      vapi.on("speech-end", () => setSpeaker(null));
      vapi.on("error", (e?: unknown) => {
        console.error("VAPI error:", e);
        setState("error");
      });
      // Transcript events: partials drive the live caption (instant feedback
      // that the mic is being heard); finals also update the speaker cue.
      vapi.on("message", (msg?: unknown) => {
        const m = msg as { type?: string; role?: string; transcript?: string; transcriptType?: string };
        if (m?.type !== "transcript" || !m.transcript) return;
        const who = m.role === "assistant" ? ("concierge" as const) : ("you" as const);
        setCaption({ who, text: m.transcript });
        if (m.transcriptType === "final") setSpeaker(who);
      });

      await vapi.start(ASSISTANT_ID);
    } catch (e) {
      console.error("Could not start voice call:", e);
      setState("error");
    }
  };

  const endCall = () => {
    try {
      vapiRef.current?.stop();
    } catch {
      // ignore
    }
    setState("idle");
    setSpeaker(null);
    setCaption(null);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      vapiRef.current?.setMuted(next);
    } catch {
      // ignore
    }
  };

  // Idle / error → a compact "Call" button in the header.
  if (state === "idle" || state === "error") {
    return (
      <>
        <button
          onClick={startCall}
          aria-label="Talk to the concierge by voice"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-charcoal/90 px-3 py-1.5 text-[0.68rem] font-semibold text-surface transition-transform hover:scale-105"
        >
          <PhoneIcon />
          {state === "error" ? "Try call again" : "Talk"}
        </button>
        {authModal}
      </>
    );
  }

  // Connecting / active → status pill with mute + end, plus a live caption of
  // the last thing either side said (so you can SEE whether you're being heard).
  return (
    <>
    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-charcoal px-2 py-1 text-surface">
      <span className="relative ml-1 flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${
            state === "active" ? "animate-ping bg-peach/80" : "bg-mist"
          }`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${state === "active" ? "bg-peach" : "bg-mist"}`} />
      </span>
      <span className="text-[0.64rem] font-semibold">
        {state === "connecting"
          ? "Connecting…"
          : speaker === "concierge"
            ? "Speaking…"
            : "Listening…"}
      </span>
      {state === "active" && (
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="grid h-6 w-6 place-items-center rounded-full text-surface/80 hover:text-surface"
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>
      )}
      <button
        onClick={endCall}
        aria-label="End call"
        className="grid h-6 w-6 place-items-center rounded-full bg-surface/15 text-surface hover:bg-surface/25"
      >
        <EndIcon />
      </button>
    </div>
    {state === "active" && caption && (
      <p className="max-w-[200px] truncate text-right text-[0.62rem] leading-tight text-charcoal/60">
        <span className="font-semibold">{caption.who === "you" ? "You: " : "Concierge: "}</span>
        {caption.text}
      </p>
    )}
    </>
  );
}

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 2 20 20M9 9v1a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 10a5 5 0 0 1-.54 2.27M5 10a7 7 0 0 0 10.79 5.93M12 19v3" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
