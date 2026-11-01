"use client";

import VaultImageUpload, { PictureDetails } from "./vault-image-upload";
import { useCallback, useEffect, useRef, useState } from "react";
import { guessVaultKind, VAULT_KINDS, vaultKindLabel, type VaultKind } from "@/lib/vault-kinds";
import { mmss } from "@/lib/trace";
import type { Pulse, PulseWall, VaultDocument, VaultLink, VaultWalk } from "@/lib/vault";
import type { PresentedProposal } from "@/lib/prism";
import WallMockup from "@/components/WallMockup";
import { feetFromMm, mmFromFeet, num, showFeet } from "@/lib/wall-measure";

// ─── The Vault, as the college sees it ──────────────────────────────────────
//
// One drawer for one campus project: what the college has sent (plans,
// photographs, brand material), what Zyvorah has filed (meeting notes), and
// every walk recorded on a Trace link — each piece playable, each wall's
// still, the words of the walk beneath it.
//
// Reading needs a sign-in. Filling it does not: the Trace link that records a
// walk is issued from here and handed to whoever walks.

type Payload = {
  ok: true;
  blueprint: { id: string; name: string; city: string | null; language: string; status: string };
  imageNotesEnabled?: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canManage: boolean;
  staff: boolean;
  documents: VaultDocument[];
  walks: VaultWalk[];
  links: VaultLink[];
  pulse: Pulse;
  proposal: PresentedProposal | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtBytes = (n: number | null) => n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const LANG: Record<string, string> = { ta: "Tamil", kn: "Kannada", hi: "Hindi", en: "English", te: "Telugu", mr: "Marathi", ml: "Malayalam" };

export default function VaultPanel({ standalone = false, backHref }: { standalone?: boolean; backHref?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/corporate/vault", { cache: "no-store" });
    const j = await r.json().catch(() => ({})) as Partial<Payload> & { error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not open the project.");
    setData(j as Payload);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/corporate/vault", { cache: "no-store" });
        const j = await r.json().catch(() => ({})) as Partial<Payload> & { error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not open the project.");
        if (alive) setData(j as Payload);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not open the project.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const reload = useCallback(async () => {
    try { await load(); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : "Could not reload."); }
  }, [load]);

  if (loading) return <p className="mt-6 text-sm text-slate">Opening the project…</p>;
  if (!data) return <p className="mt-6 text-sm text-red-600">{err ?? "Could not open the project."}</p>;

  const docCount = data.documents.length;
  const wallCount = data.walks.reduce((n, w) => n + w.marks, 0);

  return (
    <div className={standalone ? "" : "mt-6"}>
      {backHref && <a href={backHref} className="text-xs text-slate underline">← Back to the dashboard</a>}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Vault</p>
          <h2 className="font-display text-xl font-bold leading-tight">{data.blueprint.name}</h2>
          <p className="mt-0.5 text-xs text-slate">
            {data.blueprint.city ? `${data.blueprint.city} · ` : ""}
            {LANG[data.blueprint.language] ?? data.blueprint.language}
            {" · "}{docCount} {docCount === 1 ? "document" : "documents"}
            {" · "}{data.walks.length} {data.walks.length === 1 ? "walk" : "walks"}
            {" · "}{wallCount} {wallCount === 1 ? "wall" : "walls"} marked
          </p>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {data.proposal && <Proposal proposal={data.proposal} />}

      <PulseBoard pulse={data.pulse} documents={data.documents} canEdit={data.canEdit} staff={data.staff} onChanged={reload} setErr={setErr} />

      {data.imageNotesEnabled && (
        <section aria-labelledby="vault-guide-heading" className="mt-6 rounded-[18px] border border-edge bg-surface p-4 sm:p-5">
          <h3 id="vault-guide-heading" className="text-base font-semibold">Your upload guide</h3>
          <p className="mt-1 text-sm text-slate">Watch how to label each wall, save your pictures and add audio notes. Pause and replay as you go.</p>
          <video
            aria-label="Zyvorah Vault upload guide"
            src="/api/corporate/vault/guide"
            controls playsInline preload="metadata"
            className="mt-3 aspect-video w-full rounded-[12px] bg-charcoal"
          />
          <p className="mt-2 text-xs text-slate">1 minute 22 seconds · English · Your uploads are below.</p>
        </section>
      )}

      {data.imageNotesEnabled ? (data.canUpload && <VaultImageUpload onChanged={reload} />) : <Uploader canUpload={data.canUpload} onChanged={reload} setErr={setErr} />}

      <Documents docs={data.documents} canManage={data.canManage} you={data.canEdit} onChanged={reload} setErr={setErr} />

      <Walks walks={data.walks} canManage={data.canManage} canEdit={data.canEdit} onChanged={reload} setErr={setErr} />

      {data.canManage && <Links links={data.links} onChanged={reload} setErr={setErr} />}

      <NoteForm canUpload={data.canEdit} staff={data.staff} onChanged={reload} setErr={setErr} />
    </div>
  );
}

/* ───────────────────────────── The proposal ─────────────────────────────── */

// What Prism and the founder present: the story of the campus, then every
// wall with its concept and the design on its own photograph. Shown only once
// a revision is PRESENTED — a draft never reaches here — and above Pulse,
// because once there is a proposal it is the thing the college came to see.
function Proposal({ proposal }: { proposal: PresentedProposal }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="mt-8 border-t border-edge pt-6">
      <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">The proposal · revision {proposal.revision}{proposal.presentedAt ? ` · ${fmtDate(proposal.presentedAt)}` : ""}</p>
      <h3 className="mt-1 font-display text-2xl font-bold leading-tight">{proposal.direction}</h3>
      <p className="mt-2 text-sm leading-relaxed text-charcoal">{proposal.standfirst}</p>
      {proposal.film && (
        <div className="mt-4">
          <video src={proposal.film.url} poster={proposal.film.posterUrl ?? undefined} controls playsInline preload="metadata" className="w-full rounded-[14px] bg-charcoal" />
          <p className="mt-1.5 text-xs text-mist">{proposal.film.title}{proposal.film.durationS ? ` · ${Math.round(proposal.film.durationS / 60)} min` : ""} · narrated by Roheena Nagpal, founder of Zyvorah</p>
        </div>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate">{proposal.theme}</p>

      {proposal.palette.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
          {proposal.palette.map((c) => (
            <div key={c.name} className="flex items-center gap-2 text-xs text-slate">
              <span className="inline-block h-6 w-6 rounded-full border border-edge" style={{ background: c.hex }} aria-hidden />
              <span><span className="text-charcoal">{c.name}</span> · {c.purpose}</span>
            </div>
          ))}
        </div>
      )}

      {proposal.motifs.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {proposal.motifs.map((m) => (
            <li key={m.name} className="text-sm"><span className="font-medium text-charcoal">{m.name}</span> <span className="text-slate">— {m.description}</span></li>
          ))}
        </ul>
      )}

      {proposal.journeys.length > 0 && (
        <div className="mt-5">
          <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Walking the campus</p>
          <ul className="mt-2 space-y-2">
            {proposal.journeys.map((j) => (
              <li key={j.who} className="text-sm">
                <p className="font-medium text-charcoal">{j.who} <span className="font-normal text-mist">· {j.route.join(" → ")}</span></p>
                <p className="text-slate">{j.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Wall by wall · {proposal.walls.length}</p>
        <ul className="mt-2 grid gap-4 sm:grid-cols-2">
          {proposal.walls.map((w) => {
            const picture = w.renderUrl
              ? <img src={w.renderUrl} alt={`${w.name}: ${w.title}`} className="aspect-[4/3] w-full rounded object-cover" />
              : w.photoUrl && w.design?.artUrl && w.quad
                ? <WallMockup photoUrl={w.photoUrl} artUrl={w.design.artUrl} quad={w.quad} alt={`${w.name}: ${w.title}`} className="aspect-[4/3] w-full rounded object-cover" />
                : w.photoUrl
                  ? <img src={w.photoUrl} alt={w.name} className="aspect-[4/3] w-full rounded object-cover" />
                  : <div className="flex aspect-[4/3] w-full items-center justify-center rounded bg-wash/60 text-xs text-mist">No photograph yet</div>;
            const expanded = open === w.wallId;
            return (
              <li key={w.wallId} className="rounded border border-edge p-3">
                {picture}
                <p className="mt-2 text-xs text-mist">{w.seq}. {w.name}{w.location ? ` · ${w.location}` : ""}{w.widthMm && w.heightMm ? ` · ${showFeet(w.widthMm)} × ${showFeet(w.heightMm)}` : ""}</p>
                <p className="mt-0.5 font-medium text-charcoal">{w.title}</p>
                <p className="mt-1 text-sm text-slate">{w.concept}</p>
                {w.design && <p className="mt-1 text-xs text-slate">Design: <span className="text-charcoal">{w.design.title}</span></p>}
                {w.commissioned && <p className="mt-1 text-xs text-slate">A piece made for this wall{w.commissionNote ? ` — ${w.commissionNote}` : "."}</p>}
                <button type="button" onClick={() => setOpen(expanded ? null : w.wallId)} className="mt-2 text-xs text-slate underline">
                  {expanded ? "Less" : "Why this wall"}
                </button>
                {expanded && <p className="mt-1 text-sm text-slate">{w.rationale}{w.mood ? ` The mood: ${w.mood}` : ""}</p>}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-charcoal">{proposal.summary}</p>
    </section>
  );
}

/* ─────────────────────────────── Upload ─────────────────────────────────── */

type Job = { name: string; state: "waiting" | "sending" | "done" | "failed"; error?: string };

function Uploader({ canUpload, onChanged, setErr }: { canUpload: boolean; onChanged: () => Promise<void>; setErr: (e: string | null) => void }) {
  const [kind, setKind] = useState<VaultKind | "auto">("auto");
  const [jobs, setJobs] = useState<Job[]>([]);
  const input = useRef<HTMLInputElement>(null);
  if (!canUpload) return null;

  async function send(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const list = Array.from(files);
    setJobs(list.map((f) => ({ name: f.name, state: "waiting" })));
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setJobs((j) => j.map((x, k) => k === i ? { ...x, state: "sending" } : x));
      try {
        const r = await fetch("/api/corporate/vault", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sign", fileName: f.name, contentType: f.type, bytes: f.size, kind: kind === "auto" ? guessVaultKind(f.type, f.name) : kind }),
        });
        const j = await r.json() as { ok?: boolean; error?: string; id?: string; signedUrl?: string; contentType?: string };
        if (!r.ok || !j.ok || !j.signedUrl) throw new Error(j.error ?? "Could not prepare the upload.");
        const put = await fetch(j.signedUrl, { method: "PUT", headers: { "Content-Type": j.contentType ?? f.type ?? "application/octet-stream" }, body: f });
        if (!put.ok) throw new Error("The upload didn't land. Try again.");
        const c = await fetch("/api/corporate/vault", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit", id: j.id }),
        });
        const cj = await c.json() as { ok?: boolean; error?: string };
        if (!c.ok || !cj.ok) throw new Error(cj.error ?? "Could not save the file.");
        setJobs((js) => js.map((x, k) => k === i ? { ...x, state: "done" } : x));
      } catch (e) {
        setJobs((js) => js.map((x, k) => k === i ? { ...x, state: "failed", error: e instanceof Error ? e.message : "Failed" } : x));
      }
    }
    if (input.current) input.current.value = "";
    await onChanged();
  }

  return (
    <div className="mt-6 rounded-[18px] border border-edge bg-surface p-4">
      <h3 className="font-display text-base font-bold">Add documents</h3>
      <p className="mt-1 text-sm text-slate">Master plan, block and floor plans, photographs of walls, anything about the institution. As many files as you have — PDF, images, DWG, DXF, Word, PowerPoint.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={kind} onChange={(e) => setKind(e.target.value as VaultKind | "auto")}
          className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none">
          <option value="auto">File in… (decide for me)</option>
          {VAULT_KINDS.filter((k) => k.id !== "transcript").map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <label className="btn h-11 cursor-pointer px-5 text-[0.8rem]">
          Choose files
          <input ref={input} type="file" multiple className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.svg,.dwg,.dxf,.docx,.pptx,.xlsx,.doc,.ppt,.txt,.zip,application/pdf,image/*"
            onChange={(e) => void send(e.target.files)} />
        </label>
      </div>
      {jobs.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {jobs.map((j, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{j.name}</span>
              <span className={j.state === "failed" ? "text-red-600" : "text-slate"}>
                {j.state === "waiting" ? "waiting" : j.state === "sending" ? "sending…" : j.state === "done" ? "saved" : j.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────── Documents ────────────────────────────────── */

function Documents({ docs, canManage, you, onChanged, setErr }: {
  docs: VaultDocument[]; canManage: boolean; you: boolean; onChanged: () => Promise<void>; setErr: (e: string | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = VAULT_KINDS.map((k) => ({ ...k, docs: docs.filter((d) => d.kind === k.id && !d.parentDocumentId) })).filter((g) => g.docs.length);

  async function remove(id: string) {
    if (!confirm("Remove this document from the project?")) return;
    const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    const j = await r.json() as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) { setErr(j.error ?? "Could not remove that."); return; }
    await onChanged();
  }

  if (!docs.length) {
    return (
      <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-8 text-center">
        <p className="font-display text-base font-bold">Nothing filed yet</p>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-slate">The plans and pictures you add here, and the walks recorded on your link, are what the design is made from.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {groups.map((g) => (
        <section key={g.id}>
          <h3 className="font-display text-base font-bold">{g.label}</h3>
          <ul className="mt-2 divide-y divide-edge rounded-[18px] border border-edge bg-surface">
            {g.docs.map((d) => (
              <li key={d.id} className="p-3">
                <div className="flex items-start gap-3">
                  {d.isImage && d.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.url} alt="" className="h-14 w-14 flex-none rounded-[8px] object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[8px] bg-wash text-[0.6rem] font-semibold uppercase text-slate">
                      {d.body ? "text" : (d.contentType?.split("/")[1] ?? "file").slice(0, 4)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.title}</p>
                    <p className="text-xs text-slate">
                      {d.observedOn ? `${fmtDate(d.observedOn)} · ` : ""}
                      {fmtBytes(d.bytes)}{d.bytes ? " · " : ""}
                      {d.uploadedBy ? `${d.uploadedBy} · ` : ""}{fmtDate(d.createdAt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="underline">Open</a>}
                      {d.body && <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="underline">{open === d.id ? "Hide" : "Read"}</button>}
                      {(canManage || you) && <button type="button" onClick={() => void remove(d.id)} className="text-slate underline">Remove</button>}
                    </div>
                  </div>
                </div>
                <PictureDetails doc={d} audio={docs.filter(a => a.parentDocumentId === d.id)} onChanged={onChanged} />
                {open === d.id && d.body && (
                  <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-[12px] bg-wash p-3 font-sans text-sm text-slate">{d.body}</pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Walks ──────────────────────────────────── */

function Walks({ walks, canManage, canEdit, onChanged, setErr }: { walks: VaultWalk[]; canManage: boolean; canEdit: boolean; onChanged: () => Promise<void>; setErr: (e: string | null) => void }) {
  const [open, setOpen] = useState<string | null>(walks[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!walks.length) return null;

  async function transcribe(walkId: string, seq: number) {
    setBusy(`${walkId}:${seq}`);
    try {
      const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transcribe", walkId, seq }) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not transcribe that piece.");
      await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not transcribe that piece."); }
    finally { setBusy(null); }
  }

  async function remove(walkId: string) {
    if (!window.confirm("Remove this walk? Its recording, the walls it marked and anything drafted from it on the board go with it.")) return;
    setBusy(`${walkId}:remove`);
    try {
      const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "walk-remove", walkId }) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not remove that walk.");
      await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not remove that walk."); }
    finally { setBusy(null); }
  }

  return (
    <section className="mt-8">
      <h3 className="font-display text-base font-bold">Walks</h3>
      <p className="mt-1 text-sm text-slate">Each walk is the campus as someone showed it: the recording, every wall they marked, and their words.</p>
      <div className="mt-3 space-y-3">
        {walks.map((w) => (
          <div key={w.id} className="rounded-[18px] border border-edge bg-surface">
            <button type="button" onClick={() => setOpen(open === w.id ? null : w.id)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{w.where ?? "A walk"}{w.walker ? ` · ${w.walker}` : ""}</p>
                <p className="text-xs text-slate">{fmtDate(w.startedAt)} · {w.summary}{w.status === "recording" ? " · still recording" : ""}</p>
                {w.transcript.total > 0 && !w.transcript.complete && (
                  <p className="text-xs text-[color:var(--color-alert)]">Words transcribed for {w.transcript.done} of {w.transcript.total} pieces</p>
                )}
              </div>
              <span className="text-xs text-slate">{open === w.id ? "Hide" : "Open"}</span>
            </button>
            {open === w.id && (
              <div className="border-t border-edge p-4">
                {w.walls.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-mist">Walls marked</p>
                    <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {w.walls.map((m) => (
                        <li key={m.seq} className="text-xs">
                          {m.stillUrl ? (
                            <a href={m.stillUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.stillUrl} alt={`Wall ${m.seq}`} className="aspect-[4/3] w-full rounded-[8px] object-cover" />
                            </a>
                          ) : <div className="aspect-[4/3] w-full rounded-[8px] bg-wash" />}
                          <p className="mt-1 text-slate">Wall {m.seq} · {mmss(m.walkSeconds)}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-mist">The walk, piece by piece</p>
                <div className="mt-2 space-y-4">
                  {w.pieces.map((p) => (
                    <div key={p.seq}>
                      <p className="text-xs text-slate">Piece {p.seq}{p.seconds ? ` · ${mmss(p.seconds)}` : ""}</p>
                      {p.videoUrl ? (
                        <video src={p.videoUrl} controls playsInline preload="metadata" className="mt-1 w-full rounded-[12px] bg-charcoal sm:max-w-sm" />
                      ) : <p className="mt-1 text-xs text-mist">No video for this piece.</p>}
                      {p.transcript ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{p.transcript}</p>
                      ) : (
                        <p className="mt-2 text-xs text-mist">
                          {p.transcriptError ? `Not transcribed yet (${p.transcriptError}). ` : "Not transcribed yet. "}
                          {canManage && canEdit && (
                            <button type="button" disabled={busy === `${w.id}:${p.seq}`} onClick={() => void transcribe(w.id, p.seq)} className="underline">
                              {busy === `${w.id}:${p.seq}` ? "Transcribing…" : "Transcribe now"}
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {canManage && w.status !== "recording" && (
                  <p className="mt-4 text-xs text-mist">
                    Recorded by mistake?{" "}
                    <button type="button" disabled={busy === `${w.id}:remove`} onClick={() => void remove(w.id)} className="underline">
                      {busy === `${w.id}:remove` ? "Removing…" : "Remove this walk"}
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────── Links ──────────────────────────────────── */

function Links({ links, onChanged, setErr }: { links: VaultLink[]; onChanged: () => Promise<void>; setErr: (e: string | null) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brief, setBrief] = useState("");
  const [minted, setMinted] = useState<{ ref: string; url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Read once: "expired" is judged against the moment the list was drawn. */
  const [now] = useState(() => Date.now());

  async function mint() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mint-trace", recipientName: name, recipientEmail: email, brief }) });
      const j = await r.json() as { ok?: boolean; error?: string; ref?: string; url?: string; expiresAt?: string };
      if (!r.ok || !j.ok || !j.url) throw new Error(j.error ?? "Could not issue a link.");
      setMinted({ ref: j.ref!, url: j.url, expiresAt: j.expiresAt! });
      setName(""); setEmail(""); setBrief("");
      await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not issue a link."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!confirm("Switch this link off? Anyone holding it will no longer be able to record.")) return;
    const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke-trace", id }) });
    const j = await r.json() as { ok?: boolean };
    if (!j.ok) { setErr("Could not switch that link off."); return; }
    await onChanged();
  }

  return (
    <section className="mt-8">
      <h3 className="font-display text-base font-bold">Walk links</h3>
      <p className="mt-1 text-sm text-slate">A walk link needs no sign-in. Hand it to whoever will walk the campus with their phone; it records straight into this project.</p>

      {minted && (
        <div className="mt-3 rounded-[18px] border border-charcoal bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">New link · {minted.ref}</p>
          <p className="mt-1 break-all text-sm">{minted.url}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button type="button" className="btn h-9 px-4 text-[0.75rem]" onClick={() => { void navigator.clipboard?.writeText(minted.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <span className="text-slate">Valid until {fmtDate(minted.expiresAt)}. Shown once — copy it now.</span>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-3 divide-y divide-edge rounded-[18px] border border-edge bg-surface">
          {links.map((l) => {
            const dead = Boolean(l.revokedAt) || new Date(l.expiresAt).getTime() < now;
            return (
              <li key={l.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{l.ref}{l.recipient ? ` · ${l.recipient}` : ""}</p>
                  <p className="text-xs text-slate">
                    {dead ? (l.revokedAt ? "switched off" : "expired") : `valid until ${fmtDate(l.expiresAt)}`}
                    {" · "}{l.openedAt ? `opened ${fmtDate(l.openedAt)}` : "not opened yet"}
                    {" · "}{l.walks} {l.walks === 1 ? "walk" : "walks"}
                  </p>
                </div>
                {!dead && <button type="button" onClick={() => void revoke(l.id)} className="text-xs text-slate underline">Switch off</button>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 rounded-[18px] border border-edge bg-surface p-4">
        <p className="text-sm font-semibold">Issue a walk link</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who will walk (name)"
            className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email (optional)" type="email"
            className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none" />
        </div>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="A line for them: which blocks or walls to show (optional)"
          className="mt-2 w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm focus:border-charcoal focus:outline-none" />
        <button type="button" onClick={() => void mint()} disabled={busy} className="btn mt-3 h-11 px-5 text-[0.8rem]">
          {busy ? "Issuing…" : "Issue link"}
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Notes ──────────────────────────────────── */

function NoteForm({ canUpload, staff, onChanged, setErr }: { canUpload: boolean; staff: boolean; onChanged: () => Promise<void>; setErr: (e: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<VaultKind>(staff ? "transcript" : "note");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canUpload) return null;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", kind, title, body, observedOn: date || undefined }) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not save that.");
      setTitle(""); setBody(""); setDate(""); setOpen(false);
      await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save that."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm underline">Write a note{staff ? " or file meeting notes" : ""}</button>
      ) : (
        <div className="rounded-[18px] border border-edge bg-surface p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={kind} onChange={(e) => setKind(e.target.value as VaultKind)} className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm">
              <option value="note">{vaultKindLabel("note")}</option>
              <option value="transcript">{vaultKindLabel("transcript")}</option>
              <option value="brand">{vaultKindLabel("brand")}</option>
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm" />
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm" />
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Paste or write here" className="mt-2 w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm" />
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => void save()} disabled={busy} className="btn h-11 px-5 text-[0.8rem]">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate underline">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────── Pulse ──────────────────────────────────── */
//
// The readiness board. Four facts per wall — photographed, measured, drawn,
// briefed — derived on the server from the row (lib/pulse.ts), never typed
// here. The college fills what is missing from this very list; a wall is
// never "nearly ready" in words, only in ticks.

type Tick = { label: string; on: boolean };

function Ticks({ wall }: { wall: PulseWall }) {
  const ticks: Tick[] = [
    { label: "Photo", on: wall.readiness.photographed },
    { label: "Size", on: wall.readiness.measured },
    { label: "Plan", on: wall.readiness.drawn },
    { label: "Brief", on: wall.readiness.briefed },
  ];
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {ticks.map((t) => (
        <li key={t.label} className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${t.on ? "bg-charcoal text-surface" : "border border-edge text-slate"}`}>
          {t.on ? "✓ " : ""}{t.label}
        </li>
      ))}
    </ul>
  );
}

function PulseBoard({ pulse, documents, canEdit, staff, onChanged, setErr }: {
  pulse: Pulse; documents: VaultDocument[]; canEdit: boolean; staff: boolean;
  onChanged: () => Promise<void>; setErr: (e: string | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWhere, setNewWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const live = pulse.walls.filter((w) => !w.dropped);
  const dropped = pulse.walls.filter((w) => w.dropped);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/corporate/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not save that.");
      await onChanged();
      return true;
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save that."); return false; }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-6 rounded-[18px] border border-edge bg-surface p-4">
      <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Pulse</p>
      <h3 className="mt-1 font-display text-base font-bold">{pulse.readiness.headline}</h3>
      {pulse.readiness.ask && <p className="mt-1 text-sm text-slate">{pulse.readiness.ask}</p>}
      {pulse.readiness.total > 0 && !pulse.readiness.canStart && (
        <p className="mt-1 text-xs text-mist">A wall is ready when it is photographed, measured, pinned to a plan and briefed. Tap a wall to fill in what is missing.</p>
      )}

      {live.length > 0 && (
        <ul className="mt-4 divide-y divide-edge">
          {live.map((w) => (
            <li key={w.id} className="py-3">
              <button type="button" onClick={() => setOpen(open === w.id ? null : w.id)} className="flex w-full items-start gap-3 text-left">
                {w.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.photoUrl} alt="" className="h-14 w-[4.5rem] flex-none rounded-[8px] object-cover" />
                ) : <div className="flex h-14 w-[4.5rem] flex-none items-center justify-center rounded-[8px] bg-wash text-[0.6rem] text-slate">no photo</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{w.seq}. {w.name}</p>
                  <p className="truncate text-xs text-slate">
                    {w.location ?? "—"}
                    {w.widthMm && w.heightMm ? ` · ${showFeet(w.widthMm)} × ${showFeet(w.heightMm)}${w.sizeSource === "spoken" ? " (as spoken, to confirm)" : ""}` : ""}
                  </p>
                  <Ticks wall={w} />
                </div>
                <span className="text-xs text-slate">{open === w.id ? "Close" : canEdit ? "Edit" : "View"}</span>
              </button>
              {open === w.id && (
                <WallForm wall={w} documents={documents} canEdit={canEdit} busy={busy}
                  onSave={(body) => post({ action: "wall-update", id: w.id, ...body })}
                  onDrop={() => post({ action: "wall-drop", id: w.id })} />
              )}
            </li>
          ))}
        </ul>
      )}

      {dropped.length > 0 && (
        <p className="mt-3 text-xs text-mist">
          {dropped.length} {dropped.length === 1 ? "wall" : "walls"} set aside
          {canEdit && dropped.map((w) => (
            <button key={w.id} type="button" onClick={() => void post({ action: "wall-restore", id: w.id })} className="ml-2 underline">bring back {w.name}</button>
          ))}
        </p>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="underline">Add a wall by hand</button>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Wall name, e.g. Library entrance"
                className="h-11 flex-1 rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none" />
              <input value={newWhere} onChange={(e) => setNewWhere(e.target.value)} placeholder="Block / floor"
                className="h-11 flex-1 rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none" />
              <button type="button" disabled={busy || !newName.trim()} className="btn h-11 px-5 text-[0.8rem]"
                onClick={async () => { if (await post({ action: "wall-add", name: newName, location: newWhere })) { setNewName(""); setNewWhere(""); setAdding(false); } }}>
                Add
              </button>
            </div>
          )}
          {staff && <button type="button" disabled={busy} onClick={() => void post({ action: "pulse-draft" })} className="underline">Draft walls from the walks</button>}
        </div>
      )}
    </section>
  );
}

function WallForm({ wall, documents, canEdit, busy, onSave, onDrop }: {
  wall: PulseWall; documents: VaultDocument[]; canEdit: boolean; busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>; onDrop: () => Promise<boolean>;
}) {
  const ft0 = wall.widthMm ? feetFromMm(wall.widthMm) : null;
  const ft1 = wall.heightMm ? feetFromMm(wall.heightMm) : null;
  const [name, setName] = useState(wall.name);
  const [location, setLocation] = useState(wall.location ?? "");
  const [wFt, setWFt] = useState(ft0 ? String(ft0.ft) : "");
  const [wIn, setWIn] = useState(ft0 ? String(ft0.inch) : "");
  const [hFt, setHFt] = useState(ft1 ? String(ft1.ft) : "");
  const [hIn, setHIn] = useState(ft1 ? String(ft1.inch) : "");
  const [sizeSource, setSizeSource] = useState<"measured" | "plan">(wall.sizeSource === "plan" ? "plan" : "measured");
  const [brief, setBrief] = useState(wall.brief ?? "");
  const [plan, setPlan] = useState(wall.planDocumentId ?? "");
  const [photo, setPhoto] = useState(wall.photoDocumentId ?? "");
  const plans = documents.filter((d) => d.kind === "plan");
  const photos = documents.filter((d) => d.kind === "photo");
  const widthMm = wFt || wIn ? mmFromFeet(num(wFt), num(wIn)) : null;
  const heightMm = hFt || hIn ? mmFromFeet(num(hFt), num(hIn)) : null;
  const field = "h-11 w-full rounded-[12px] border border-edge bg-wash px-3 text-sm focus:border-charcoal focus:outline-none";

  if (!canEdit) {
    return <p className="mt-2 text-sm text-slate">{wall.brief ?? "No brief yet."}</p>;
  }

  return (
    <div className="mt-3 space-y-3 rounded-[14px] bg-wash/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs"><span className="font-semibold">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${field}`} /></label>
        <label className="text-xs"><span className="font-semibold">Block / floor</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={`mt-1 ${field}`} /></label>
      </div>
      <div>
        <p className="text-xs font-semibold">Size{wall.sizeSource === "spoken" ? " (heard on the walk; confirm it)" : ""}</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1 text-xs">
            <input value={wFt} onChange={(e) => setWFt(e.target.value)} inputMode="decimal" placeholder="ft" className={field} aria-label="Width feet" /><span>′</span>
            <input value={wIn} onChange={(e) => setWIn(e.target.value)} inputMode="decimal" placeholder="in" className={field} aria-label="Width inches" /><span>″ wide</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <input value={hFt} onChange={(e) => setHFt(e.target.value)} inputMode="decimal" placeholder="ft" className={field} aria-label="Height feet" /><span>′</span>
            <input value={hIn} onChange={(e) => setHIn(e.target.value)} inputMode="decimal" placeholder="in" className={field} aria-label="Height inches" /><span>″ high</span>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate">
          {widthMm && heightMm ? <span>{widthMm} × {heightMm} mm</span> : <span>Leave blank if not measured yet.</span>}
          <label className="flex items-center gap-1"><input type="radio" checked={sizeSource === "measured"} onChange={() => setSizeSource("measured")} /> measured with a tape</label>
          <label className="flex items-center gap-1"><input type="radio" checked={sizeSource === "plan"} onChange={() => setSizeSource("plan")} /> read off the plan</label>
        </div>
      </div>
      <label className="block text-xs"><span className="font-semibold">Which plan is this wall on?</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`mt-1 ${field}`}>
          <option value="">{plans.length ? "Choose a plan" : "No plans uploaded yet"}</option>
          {plans.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </label>
      {(photos.length > 0 || !wall.photoUrl) && (
        <label className="block text-xs"><span className="font-semibold">Photograph</span>
          <select value={photo} onChange={(e) => setPhoto(e.target.value)} className={`mt-1 ${field}`}>
            <option value="">{wall.photoUrl ? "Keep the one from the walk" : photos.length ? "Choose a photograph" : "Upload a photograph below first"}</option>
            {photos.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
      )}
      <label className="block text-xs"><span className="font-semibold">What should this wall do?</span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="Who passes it, what it should say, the feeling it should give"
          className="mt-1 w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm focus:border-charcoal focus:outline-none" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} className="btn h-11 px-5 text-[0.8rem]" onClick={() => void onSave({
          name, location, body: brief, planDocumentId: plan || null, photoDocumentId: photo || null,
          widthMm, heightMm, sizeSource,
        })}>{busy ? "Saving…" : "Save wall"}</button>
        <button type="button" disabled={busy} onClick={() => { if (confirm("Set this wall aside? It can be brought back.")) void onDrop(); }} className="text-xs text-slate underline">Set aside</button>
      </div>
    </div>
  );
}
