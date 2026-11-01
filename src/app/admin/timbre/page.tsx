"use client";

import { useCallback, useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { Candidate, SpokenLine } from "@/lib/timbre";

// The Timbre desk: design the house voice from the brief, hear the
// candidates, choose one; then hear it say anything in English, Hindi or a
// campus language. One voice for every wall, never the founder's.

type Desk = {
  key: { ready: boolean; why: string | null };
  voice: { voiceId: string; name: string; pinned: boolean } | null;
  chosenAt: string | null;
  brief: string;
  candidates: Candidate[];
  languages: { code: string; name: string; native: string; sample: string }[];
  lines: SpokenLine[];
};

async function api(body?: Record<string, unknown>) {
  const r = await fetch("/api/admin/timbre", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Something went wrong.");
  return j;
}

export default function TimbreDesk() {
  const staff = useStaff();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("Welcome to Zyvorah. You are standing in front of a wall that tells the story of this campus. Scan again whenever you like, and I will tell you a little more.");
  const [language, setLanguage] = useState("en");
  const [last, setLast] = useState<SpokenLine | null>(null);

  const load = useCallback(async () => { setDesk(await api() as Desk); }, []);

  useEffect(() => {
    if (staff !== "in") return;
    const ac = new AbortController();
    fetch("/api/admin/timbre", { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setDesk(j as Desk); })
      .catch((e) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => ac.abort();
  }, [staff]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label); setError(null);
    try { const j = await api(body); await load(); return j; }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); return null; }
    finally { setBusy(null); }
  }

  if (staff !== "in") return <StaffGate state={staff} title="Timbre" />;
  if (!desk) return <main className="container-x py-8 text-sm text-slate">{error ?? "Opening the desk…"}</main>;

  return (
    <main className="container-x max-w-4xl space-y-6 py-8">
      <div>
        <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Timbre 1.0</p>
        <h1 className="mt-1 font-display text-2xl font-bold">The house voice</h1>
        <p className="mt-1 text-sm text-slate">One designed voice for every wall: a woman in her mid-thirties, Indian English, calm and unhurried, who also speaks Hindi and the campus language. Never a stock voice, never the founder&rsquo;s.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!desk.key.ready && <p className="rounded-[14px] bg-wash px-4 py-3 text-sm text-slate">{desk.key.why} Once the key is on the Worker, Design and Say work here with no other change.</p>}

      <section className="rounded-[18px] border border-edge bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">The voice</p>
            <p className="mt-1 text-sm">
              {desk.voice
                ? <>Chosen{desk.chosenAt ? ` on ${new Date(desk.chosenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}{desk.voice.pinned ? " · pinned by TIMBRE_VOICE_ID" : ""} · <span className="text-slate">{desk.voice.voiceId}</span></>
                : "No voice yet. Design candidates from the brief and choose one."}
            </p>
          </div>
          <button type="button" disabled={busy !== null || !desk.key.ready} onClick={() => { if (!desk.candidates.length || confirm("Design new candidates? The ones on the desk are replaced; a chosen voice stays.")) void act("design", { action: "design" }); }}
            className={desk.voice ? "rounded-full border border-edge px-4 py-2 text-xs" : "btn h-10 px-4 text-[0.78rem]"}>
            {busy === "design" ? "Designing…" : desk.candidates.length ? "Design again" : "Design the voice"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate"><span className="font-semibold text-charcoal">The brief: </span>{desk.brief}</p>
        {busy === "design" && <p className="mt-3 text-sm text-slate">ElevenLabs is designing three or four voices from the brief and reading the sample in each. About a minute.</p>}
        {desk.candidates.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {desk.candidates.map((c, i) => (
              <li key={c.generatedVoiceId} className="rounded-[12px] border border-edge p-3">
                <p className="text-sm font-semibold">Candidate {i + 1}{c.seconds ? <span className="font-normal text-mist"> · {Math.round(c.seconds)} s</span> : null}</p>
                {c.url ? <audio controls preload="none" src={c.url} className="mt-2 w-full" /> : <p className="mt-2 text-xs text-mist">Recording unavailable.</p>}
                <button type="button" disabled={busy !== null} onClick={() => { if (confirm(`Make candidate ${i + 1} the house voice? Every wall will speak in it.`)) void act("choose", { action: "choose", generatedVoiceId: c.generatedVoiceId }); }}
                  className="mt-2 rounded-full border border-charcoal px-3 py-1.5 text-xs font-semibold">
                  {busy === "choose" ? "Saving…" : "This one"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[18px] border border-edge bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">Hear Timbre</p>
        <p className="mt-1 text-sm text-slate">Write the line in English. Choose a language and Timbre writes it in that language first, then speaks it. A line is spoken once and kept.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-3 w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm focus:border-charcoal focus:outline-none" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-full border border-edge bg-surface px-3 py-2 text-xs">
            {desk.languages.map((l) => <option key={l.code} value={l.code}>{l.name} · {l.native}</option>)}
          </select>
          <button type="button" disabled={busy !== null || !desk.voice || !desk.key.ready || !text.trim()} title={desk.voice ? undefined : "Choose a voice first."}
            onClick={async () => { const j = await act("say", { action: "say", text, language }) as { line?: SpokenLine } | null; if (j?.line) setLast(j.line); }}
            className="btn h-10 px-4 text-[0.78rem]">
            {busy === "say" ? "Speaking…" : "Say it"}
          </button>
        </div>
        {last && (
          <div className="mt-4 rounded-[12px] bg-wash p-3">
            <p className="text-xs text-mist">{desk.languages.find((l) => l.code === last.language)?.name}{last.cached ? " · already spoken, played from the shelf" : ""}</p>
            <p className="mt-1 text-sm">{last.text}</p>
            {last.url && <audio controls autoPlay src={last.url} className="mt-2 w-full" />}
            <p className="mt-1 text-[0.7rem] text-mist">Public link for a QR: {last.publicPath}</p>
          </div>
        )}
        {desk.lines.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">Lines spoken</p>
            <ul className="mt-2 space-y-2">
              {desk.lines.map((l) => (
                <li key={l.id} className="text-sm">
                  <p className="text-xs text-mist">{desk.languages.find((x) => x.code === l.language)?.name ?? l.language} · {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                  <p>{l.text}</p>
                  {l.url && <audio controls preload="none" src={l.url} className="mt-1 w-full" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
