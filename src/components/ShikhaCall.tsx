"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthGate } from "@/components/AuthGate";
import { SHIKHA_LAUNCH_ENABLED } from "@/lib/customer-service-flag";
import { SHIKHA_IDENTITY } from "@/lib/customer-service-policy";

export function ShikhaCall() {
  const { signedIn, promptAuth, authModal } = useAuthGate();
  const [state, setState] = useState<"idle" | "connecting" | "active">("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const callId = useRef<string | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cleanup() {
    generation.current++;
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    connectionTimer.current = null;
    abort.current?.abort();
    abort.current = null;
    peer.current?.close(); peer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; }
    const id = callId.current; callId.current = null;
    if (id) void fetch("/api/customer-service/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", callId: id }), keepalive: true }).catch(() => {});
  }
  useEffect(() => () => cleanup(), []);
  function end() { cleanup(); setState("idle"); setMuted(false); }
  async function start() {
    if (!SHIKHA_LAUNCH_ENABLED || peer.current || state !== "idle") return;
    if (!signedIn) { promptAuth("call Zyvorah"); return; }
    const turn = ++generation.current;
    setError(""); setState("connecting"); setMuted(false);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (turn !== generation.current) { mic.getTracks().forEach(t => t.stop()); return; }
      stream.current = mic;
      const pc = new RTCPeerConnection(); peer.current = pc;
      const player = audio.current ?? new Audio(); audio.current = player; player.autoplay = true;
      pc.ontrack = event => { player.srcObject = event.streams[0]; void player.play().catch(() => setError("Tap Resume audio to hear Shikha.")); };
      pc.onconnectionstatechange = () => {
        if (turn !== generation.current) return;
        if (pc.connectionState === "connected") {
          if (connectionTimer.current) clearTimeout(connectionTimer.current);
          connectionTimer.current = null; setState("active");
        }
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) { end(); setError("The call ended. You can start another call."); }
      };
      mic.getTracks().forEach(track => pc.addTrack(track, mic));
      // No client business tools or editable agent instructions: OS owns them.
      pc.createDataChannel("oai-events");
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const controller = new AbortController(); abort.current = controller;
      const timer = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try { response = await fetch("/api/customer-service/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sdp: offer.sdp }), signal: controller.signal }); }
      finally { clearTimeout(timer); }
      const body = await response.json();
      if (turn !== generation.current) {
        if (body.callId) void fetch("/api/customer-service/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", callId: body.callId }), keepalive: true });
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Unable to connect.");
      callId.current = body.callId;
      await pc.setRemoteDescription({ type: "answer", sdp: body.sdp });
      if (turn === generation.current && pc.connectionState !== "connected") connectionTimer.current = setTimeout(() => { end(); setError("The call could not connect. Please try again."); }, 20_000);
    } catch (e) {
      if (turn !== generation.current) return;
      end(); setError(e instanceof Error && e.name === "NotAllowedError" ? "Allow microphone access to start your call." : e instanceof Error ? e.message : "Unable to connect.");
    }
  }
  return <section className="mx-auto max-w-lg rounded-2xl border border-charcoal/15 bg-surface p-8">
    <h1 className="font-display text-3xl" style={{ wordSpacing: "0.2em" }}>Call Zyvorah</h1>
    <p className="mt-3 text-sm">{SHIKHA_IDENTITY}</p>
    <p className="mt-3 text-sm text-charcoal/65">Ask about a design, your wall measurements or an order.</p>
    <p role="status" className="my-6 text-sm">{!SHIKHA_LAUNCH_ENABLED ? "Calls are not available yet. Please use Ask Zyvorah for help." : state === "connecting" ? "Connecting…" : state === "active" ? muted ? "Microphone muted" : "Call connected" : "Ready when you are"}</p>
    <div className="flex flex-wrap gap-3">
      {state === "idle" ? <button disabled={!SHIKHA_LAUNCH_ENABLED} onClick={() => void start()} className="rounded-full bg-charcoal px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-40">Start call</button> : <>
        <button disabled={state !== "active"} aria-pressed={muted} onClick={() => { const next = !muted; stream.current?.getAudioTracks().forEach(t => { t.enabled = !next; }); setMuted(next); }} className="rounded-full border border-charcoal/20 px-6 py-3 disabled:opacity-40">{muted ? "Unmute" : "Mute"}</button>
        <button onClick={end} className="rounded-full bg-charcoal px-6 py-3 text-white">End call</button>
      </>}
    </div>
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
    {error.includes("Resume audio") && <button onClick={() => void audio.current?.play().then(() => setError(""))} className="mt-3 underline">Resume audio</button>}
    {authModal}
  </section>;
}
