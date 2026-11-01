"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import WallMockup from "@/components/WallMockup";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { PrismDesk } from "@/lib/prism";
import type { LumenView } from "@/lib/lumen";
import type { SonarView } from "@/lib/sonar";
import { SonarWallCard } from "@/components/admin/SonarWallCard";
import { runningTime } from "@/lib/lumen-rules";
import type { Candidate, WallConcept } from "@/lib/prism-rules";
import { showFeet } from "@/lib/wall-measure";

// The Prism desk for one campus: the direction on the table, every wall's
// concept with the catalogue designs Prism found and a mockup of the chosen
// one on the wall's photograph, the conversation that revises it, and the
// gate to the college.

async function api(url: string, body?: Record<string, unknown>) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Something went wrong.");
  return j;
}

export default function PrismDeskView({ blueprintId }: { blueprintId: string }) {
  const staff = useStaff();
  const [desk, setDesk] = useState<PrismDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [say, setSay] = useState("");

  const load = useCallback(async () => {
    try { setDesk(await api(`/api/admin/prism/${blueprintId}`) as PrismDesk); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load."); }
  }, [blueprintId]);

  useEffect(() => {
    if (staff !== "in") return;
    const ac = new AbortController();
    fetch(`/api/admin/prism/${blueprintId}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setDesk(j as PrismDesk); })
      .catch((e) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => ac.abort();
  }, [staff, blueprintId]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label); setError(null);
    try { await api(`/api/admin/prism/${blueprintId}`, body); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); return false; }
    finally { setBusy(null); }
  }

  if (staff !== "in") return <StaffGate state={staff} title="Prism" />;
  if (!desk) return <main className="container-x py-8 text-sm text-slate">{error ?? "Opening the desk…"}</main>;

  const p = desk.proposal;
  const n = p?.narrative ?? null;

  return (
    <main className="container-x max-w-5xl py-8">
      <Link href="/admin/prism" className="text-xs text-slate underline">← All campus projects</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Prism 1.0 · {desk.blueprint.accountName}</p>
          <h1 className="font-display text-2xl font-bold leading-tight">{desk.blueprint.name}</h1>
          <p className="mt-1 text-sm text-slate">{desk.readiness.headline}{desk.readiness.ask ? ` ${desk.readiness.ask}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/partners/${desk.blueprint.accountSlug}/vault`} className="rounded-full border border-edge px-4 py-2 text-xs">Open the Vault</a>
          <button type="button" disabled={busy !== null} onClick={() => void act("compose", { action: "compose" })} className="btn h-10 px-4 text-[0.78rem]">
            {busy === "compose" ? "Prism is thinking…" : p ? "Compose a different direction" : "Compose the first direction"}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {busy === "compose" || busy === "say" ? (
        <p className="mt-3 rounded-[14px] bg-wash px-4 py-3 text-sm text-slate">Prism is reading the Vault, looking at every wall and searching the catalogue. This takes a minute or two. Keep this page open.</p>
      ) : null}

      {!p ? (
        <div className="mt-8 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-10 text-center">
          <p className="font-display text-base font-bold">No direction yet</p>
          <p className="mx-auto mt-1.5 max-w-[50ch] text-sm text-slate">Prism writes a story for the whole campus from the Vault and the board, then finds designs in the catalogue for every wall. Compose one, then tell it what to change.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="rounded-[18px] border border-edge bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate">{p.headline} · {p.status}{p.presented_at ? ` on ${new Date(p.presented_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</p>
                  <h2 className="mt-1 font-display text-xl font-bold">{n!.direction}</h2>
                  <p className="mt-1 text-sm">{n!.standfirst}</p>
                </div>
                {p.status !== "presented" && (
                  <button type="button" disabled={busy !== null} onClick={() => { if (confirm("Present this revision to the college? It will appear in their Vault.")) void act("present", { action: "present" }); }}
                    className="rounded-full border border-charcoal px-4 py-2 text-xs font-semibold">
                    Present to the college
                  </button>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate">{n!.theme}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-mist">Palette</p>
                  <ul className="mt-2 space-y-1.5">
                    {n!.palette.map((c) => (
                      <li key={c.name} className="flex items-center gap-2 text-sm">
                        <span className="inline-block h-5 w-5 flex-none rounded-full border border-edge" style={{ background: c.hex }} />
                        <span><span className="font-semibold">{c.name}</span> <span className="text-slate">· {c.purpose}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-mist">Motifs</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {n!.motifs.map((m) => <li key={m.name}><span className="font-semibold">{m.name}</span> <span className="text-slate">· {m.description}</span></li>)}
                  </ul>
                </div>
              </div>
              {n!.journeys.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-mist">Journeys</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {n!.journeys.map((j) => <li key={j.who}><span className="font-semibold">{j.who}</span> <span className="text-slate">· {j.route.join(" → ")}</span><p className="text-slate">{j.body}</p></li>)}
                  </ul>
                </div>
              )}
              <p className="mt-4 rounded-[12px] bg-wash px-3 py-2.5 text-sm text-slate"><span className="font-semibold text-charcoal">Prism says: </span>{n!.summary}</p>
            </section>

            <section className="space-y-4">
              {n!.walls.map((w) => {
                const wall = desk.walls.find((x) => x.seq === w.seq);
                const cands = n!.candidates?.[String(w.seq)] ?? [];
                const preview = wall ? p.previews.find((pv) => pv.wall_id === wall.id && pv.chosen) : undefined;
                return (
                  <WallCard key={w.seq} blueprintId={blueprintId} concept={w} wall={wall ?? null} candidates={cands} preview={preview ?? null} busy={busy !== null}
                    onChoose={(handle) => act("choose", { action: "choose", wallId: wall?.id, handle })}
                    onCommission={(commissioned, note) => act("commission", { action: "commission", wallId: wall?.id, commissioned, note })} />
                );
              })}
            </section>

            <LumenSection blueprintId={blueprintId} proposalPresented={p.status === "presented"} proposalId={p.id} />

            <SonarSection blueprintId={blueprintId} proposalId={p.id} />
          </div>

          <aside className="space-y-4">
            <section className="rounded-[18px] border border-edge bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">Talk to Prism</p>
              <ul className="mt-2 max-h-[22rem] space-y-2 overflow-y-auto text-sm">
                {desk.messages.map((m) => (
                  <li key={m.id} className={m.role === "founder" ? "rounded-[12px] bg-charcoal px-3 py-2 text-surface" : "rounded-[12px] bg-wash px-3 py-2 text-slate"}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
              <textarea value={say} onChange={(e) => setSay(e.target.value)} rows={4} placeholder="Make the entrance quieter. Use the river motif through the corridors. The library should be nearly monochrome."
                className="mt-3 w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm focus:border-charcoal focus:outline-none" />
              <button type="button" disabled={busy !== null || !say.trim()} className="btn mt-2 h-10 w-full text-[0.78rem]"
                onClick={async () => { const text = say; if (await act("say", { action: "say", body: text })) setSay(""); }}>
                {busy === "say" ? "Revising…" : "Send"}
              </button>
            </section>
            {desk.revisions.length > 1 && (
              <section className="rounded-[18px] border border-edge bg-surface p-4 text-xs">
                <p className="font-semibold uppercase tracking-wide text-mist">Revisions</p>
                <ul className="mt-2 space-y-1">
                  {desk.revisions.map((r) => <li key={r.id} className="text-slate">Rev. {r.revision} · {r.direction} · {r.status}</li>)}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function WallCard({ blueprintId, concept, wall, candidates, preview, busy, onChoose, onCommission }: {
  blueprintId: string; concept: WallConcept; wall: PrismDesk["walls"][number] | null; candidates: Candidate[];
  preview: NonNullable<PrismDesk["proposal"]>["previews"][number] | null; busy: boolean;
  onChoose: (handle: string) => Promise<boolean>; onCommission: (commissioned: boolean, note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(concept.commissionNote ?? "");
  const exported = useRef<string | null>(null);
  const chosen = candidates.find((c) => c.handle === preview?.product_handle) ?? null;

  // The render is exported once per preview and kept, so Lumen and the
  // college's Vault can show it without a canvas.
  const exportCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (!preview || preview.renderUrl || exported.current === preview.id) return;
    exported.current = preview.id;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const s = await api(`/api/admin/prism/${blueprintId}/render`, { action: "sign", previewId: preview.id, bytes: blob.size }) as { signedUrl: string };
        const put = await fetch(s.signedUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
        if (put.ok) await api(`/api/admin/prism/${blueprintId}/render`, { action: "commit", previewId: preview.id });
      } catch { /* a missing render costs the picture, never the desk */ }
    }, "image/jpeg", 0.86);
  }, [blueprintId, preview]);

  return (
    <article className="rounded-[18px] border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">{concept.seq}. {concept.title}</h3>
        <p className="text-xs text-slate">{wall?.name}{wall?.location ? ` · ${wall.location}` : ""}{wall?.widthMm && wall?.heightMm ? ` · ${showFeet(wall.widthMm)} × ${showFeet(wall.heightMm)}` : ""} · {concept.scale}</p>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          {wall?.photoUrl && preview && chosen?.flat && preview.quad_json ? (
            <WallMockup photoUrl={wall.photoUrl} artUrl={preview.artUrl ?? ""} quad={preview.quad_json} alt={`${chosen.title} on ${wall.name}`} className="w-full rounded-[12px]" onReady={exportCanvas} />
          ) : wall?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wall.photoUrl} alt={wall.name} className="w-full rounded-[12px] object-cover" />
          ) : <div className="aspect-[4/3] w-full rounded-[12px] bg-wash" />}
          {wall?.photoUrl && preview && !preview.quad_json && <p className="mt-1 text-xs text-mist">The wall plane could not be found in this photograph, so the design is shown beside it.</p>}
          {chosen && <p className="mt-1 text-xs text-slate">Showing <span className="font-semibold text-charcoal">{chosen.title}</span>{concept.commissioned ? " · marked for commission" : ""}</p>}
        </div>
        <div className="text-sm">
          <p className="text-slate">{concept.rationale}</p>
          <p className="mt-2 whitespace-pre-wrap">{concept.concept}</p>
          <p className="mt-2 text-xs text-slate">Mood: {concept.mood}</p>
          {concept.voiceLine && <p className="mt-2 rounded-[10px] bg-wash px-3 py-2 text-xs italic text-slate">“{concept.voiceLine}”</p>}
        </div>
      </div>
      {candidates.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">From the catalogue</p>
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {candidates.map((c) => (
              <li key={c.handle} className="w-28 flex-none">
                <button type="button" disabled={busy} onClick={() => void onChoose(c.handle)}
                  className={`block w-full overflow-hidden rounded-[10px] border ${c.handle === preview?.product_handle ? "border-charcoal" : "border-edge"}`}>
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.title} className="aspect-[4/3] w-full object-cover" />
                  ) : <div className="aspect-[4/3] w-full bg-wash" />}
                  <span className="block truncate px-1.5 py-1 text-left text-[0.68rem]">{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={concept.commissioned} disabled={busy} onChange={(e) => void onCommission(e.target.checked, note)} />
          Commission an artist for this wall
        </label>
        {concept.commissioned && (
          <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void onCommission(true, note)} placeholder="What to commission"
            className="h-9 flex-1 rounded-[10px] border border-edge bg-wash px-3 text-xs focus:border-charcoal focus:outline-none" />
        )}
      </div>
    </article>
  );
}


/* ───────────────────────── Lumen · the film ───────────────────────── */

// The presentation film of the proposal on the table, in three presses:
// Write (Lumen drafts what the founder says over each scene; she edits any
// line here), Record (her cloned voice on ElevenLabs), Cut (the container
// lays each wall's mockup under its narration). Present puts it in the
// college's Vault beside the presented proposal.
function LumenSection({ blueprintId, proposalId, proposalPresented }: { blueprintId: string; proposalId: string; proposalPresented: boolean }) {
  const [film, setFilm] = useState<LumenView | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [title, setTitle] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await api(`/api/admin/prism/${blueprintId}/lumen`) as { film: LumenView | null };
    setFilm(j.film);
    setDraft({});
    setTitle(null);
  }, [blueprintId]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/prism/${blueprintId}/lumen`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setFilm((j as { film: LumenView | null }).film); })
      .catch((e) => { if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : "Could not load the film."); });
    return () => ac.abort();
  }, [blueprintId, proposalId]);

  // A cut is minutes in the container; the row says when it is done.
  useEffect(() => {
    if (film?.status !== "cutting") return;
    const t = setInterval(() => { void load().catch(() => undefined); }, 6000);
    return () => clearInterval(t);
  }, [film?.status, load]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label); setErr(null);
    try { await api(`/api/admin/prism/${blueprintId}/lumen`, body); await load(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); return false; }
    finally { setBusy(null); }
  }

  const dirty = Object.keys(draft).length > 0 || title !== null;
  const scenes = film?.script.scenes ?? [];
  const recorded = new Set(film?.recorded ?? []);
  const allRecorded = scenes.length > 0 && scenes.every((s) => !s.narration.trim() || recorded.has(s.key));

  return (
    <section className="rounded-[18px] border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">Lumen 1.0 · the film</p>
          <h2 className="mt-1 font-display text-lg font-bold">{film ? (title ?? film.script.title) : "The proposal, told in your voice"}</h2>
          <p className="mt-1 text-sm text-slate">
            {film === undefined ? "Opening…" :
              !film ? "Lumen writes what you say over each wall. You change any line, record it in your voice, and cut the film." :
              film.status === "cutting" ? "Cutting the film in the media container. This takes a few minutes; this page checks on its own." :
              film.status === "cut" ? `Cut${film.durationS ? ` · ${runningTime([film.durationS])}` : ""}${film.presentedAt ? " · in the college's Vault" : ""}` :
              film.status === "failed" ? "The cut failed." :
              allRecorded ? "Recorded. Cut the film when the walls' mockups are drawn." :
              "Read the words, change what you would say differently, then record."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!film || film.status === "cut" || film.status === "failed" ? (
            <button type="button" disabled={busy !== null} onClick={() => { if (!film || confirm("Write a fresh script? The current film and recordings stay until a new one is cut.")) void act("write", { action: "write" }); }}
              className={film ? "rounded-full border border-edge px-4 py-2 text-xs" : "btn h-10 px-4 text-[0.78rem]"}>
              {busy === "write" ? "Lumen is writing…" : film ? "Write again" : "Write the script"}
            </button>
          ) : null}
          {film && film.status !== "cutting" && film.status !== "cut" && (
            <>
              {dirty && (
                <button type="button" disabled={busy !== null} onClick={() => void act("save", { action: "save", title: title ?? undefined, scenes: Object.entries(draft).map(([key, narration]) => ({ key, narration })) })}
                  className="rounded-full border border-charcoal px-4 py-2 text-xs font-semibold">
                  {busy === "save" ? "Saving…" : "Save the words"}
                </button>
              )}
              {!dirty && !allRecorded && (
                <button type="button" disabled={busy !== null || !film.voice.ready} title={film.voice.why ?? undefined} onClick={() => void act("record", { action: "record" })}
                  className="btn h-10 px-4 text-[0.78rem]">
                  {busy === "record" ? "Recording in your voice…" : "Record in my voice"}
                </button>
              )}
              {!dirty && allRecorded && (
                <button type="button" disabled={busy !== null} onClick={() => void act("cut", { action: "cut" })} className="btn h-10 px-4 text-[0.78rem]">
                  {busy === "cut" ? "Starting the cut…" : "Cut the film"}
                </button>
              )}
            </>
          )}
          {film?.status === "cut" && !film.presentedAt && (
            <button type="button" disabled={busy !== null || !proposalPresented} title={proposalPresented ? undefined : "Present the proposal first; the film goes with it."}
              onClick={() => { if (confirm("Show this film to the college in their Vault?")) void act("present", { action: "present" }); }}
              className="rounded-full border border-charcoal px-4 py-2 text-xs font-semibold">
              Present the film
            </button>
          )}
          {film?.status === "failed" && (
            <button type="button" disabled={busy !== null} onClick={() => void act("cut", { action: "cut" })} className="btn h-10 px-4 text-[0.78rem]">Cut again</button>
          )}
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {film?.error && !err && <p className="mt-3 text-sm text-red-600">{film.error}</p>}
      {film && !film.voice.ready && film.status !== "cut" && (
        <p className="mt-3 rounded-[12px] bg-wash px-3 py-2.5 text-sm text-slate">{film.voice.why} Once your voice is cloned on ElevenLabs and both settings are on the Worker, Record works here with no other change.</p>
      )}

      {film?.status === "cut" && film.filmUrl && (
        <div className="mt-4">
          <video src={film.filmUrl} poster={film.posterUrl ?? undefined} controls playsInline preload="metadata" className="w-full rounded-[14px] bg-charcoal" />
        </div>
      )}

      {film && film.status !== "cut" && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate">
            Title
            <input value={title ?? film.script.title} onChange={(e) => setTitle(e.target.value)} disabled={film.status === "cutting"}
              className="mt-1 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm text-charcoal focus:border-charcoal focus:outline-none" />
          </label>
          {scenes.map((s) => (
            <div key={s.key} className="rounded-[12px] border border-edge p-3">
              <p className="text-xs text-mist">{s.caption}{recorded.has(s.key) ? " · recorded" : ""}</p>
              <p className="text-sm font-semibold">{s.heading}</p>
              <textarea value={draft[s.key] ?? s.narration} rows={3} disabled={film.status === "cutting"}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                className="mt-2 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm focus:border-charcoal focus:outline-none" />
              <p className="mt-1 text-[0.7rem] text-mist">{(draft[s.key] ?? s.narration).trim().split(/\s+/).filter(Boolean).length} words{recorded.has(s.key) && draft[s.key] !== undefined && draft[s.key] !== s.narration ? " · changing the words will record this scene again" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


/* ───────────────────────── Sonar · the talking walls ───────────────────── */

// Every wall of the proposal gets its voice here: the piece it says is
// written from Prism's concept, spoken by Timbre in English, the campus
// language and Hindi, and printed as a QR. A wall keeps its code for ever.
function SonarSection({ blueprintId, proposalId }: { blueprintId: string; proposalId: string }) {
  const [walls, setWalls] = useState<SonarView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const load = useCallback(async () => {
    const j = await api(`/api/admin/sonar?blueprintId=${encodeURIComponent(blueprintId)}`) as { walls: SonarView[] };
    setWalls(j.walls);
  }, [blueprintId]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/sonar?blueprintId=${encodeURIComponent(blueprintId)}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setWalls((j as { walls: SonarView[] }).walls); })
      .catch((e) => { if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : "Could not load the walls."); });
    return () => ac.abort();
  }, [blueprintId, proposalId]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label); setErr(null);
    try {
      const j = await api("/api/admin/sonar", body) as { errors?: string[]; made?: number; spoken?: number };
      setNotes(j.errors ?? []);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  const spokenAll = (walls ?? []).length > 0 && (walls ?? []).every((w) => w.languages.every((l) => l.spoken));
  return (
    <section className="rounded-[18px] border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">Sonar 1.0 · the talking walls</p>
          <h2 className="mt-1 font-display text-lg font-bold">{walls?.length ? `${walls.length} ${walls.length === 1 ? "wall speaks" : "walls speak"}` : "Give the walls their voice"}</h2>
          <p className="mt-1 text-sm text-slate">
            {walls === null ? "Opening…" : walls.length === 0
              ? "Each wall gets a piece written from its concept, spoken by Timbre in English, the campus language and Hindi, and a QR to print."
              : spokenAll ? "Every wall is spoken in every language. Download the QRs from the cards." : "Some languages are still owed; press again to speak them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void act("walls", { action: "walls", blueprintId })} className="btn h-10 px-4 text-[0.78rem]">
            {busy === "walls" ? "Writing and speaking…" : walls?.length ? "Speak what is missing" : "Make the walls talk"}
          </button>
          {walls && walls.length > 0 && (
            <button type="button" disabled={busy !== null} onClick={() => { if (confirm("Write every wall's piece again from the current concepts and speak them afresh? The QR codes stay the same.")) void act("walls", { action: "walls", blueprintId, rewrite: true }); }}
              className="rounded-full border border-edge px-4 py-2 text-xs">
              Write again
            </button>
          )}
        </div>
      </div>
      {busy === "walls" && <p className="mt-3 rounded-[14px] bg-wash px-4 py-3 text-sm text-slate">Sonar writes a piece for each wall, then Timbre writes and speaks it in every language. A minute or two for a campus; keep this page open.</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {notes.length > 0 && <ul className="mt-3 space-y-1 text-sm text-red-600">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {walls && walls.length > 0 && (
        <ul className="mt-4 space-y-3">
          {walls.map((w) => <SonarWallCard key={w.id} w={w} busy={busy !== null} onStatus={(id, status) => void act("status", { action: "status", id, status })} />)}
        </ul>
      )}
    </section>
  );
}
