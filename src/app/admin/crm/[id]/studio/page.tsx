"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
// The studio previews the palette with the very component the client-facing
// surfaces render — the deck, and the case-study book — so the three cannot
// drift apart, and so what she approves here is literally what goes out.
import { type PaletteSwatch } from "@/lib/curated-doc";
import { PaletteStrip } from "@/components/PaletteStrip";
import { VideoFirst } from "./video-first";
import { PrivateImport } from "./private-import";
import { WallMaskEditor } from "../wall-mask";
import { Presentations } from "../presentations";
import { StaffGate, useStaff } from "@/lib/use-staff";

// The Proposal Studio, in two modes.
//
// STUDIO MODE — one human input, the briefing, written the way Roheena would
// brief a design head, then three agents in sequence:
//   The creative (OpenAI):  vibe, palette, mood, a wallpaper concept per space,
//                           concept art on demand.
//   The presenter (Claude): the proposal page itself, in the house system.
//   The reviewer (Claude):  simple words, extremely thoughtful, nothing
//                           invented beyond the briefing.
//
// CURATED MODE — she has already written the direction and finished the
// artwork, and the client is being asked to choose between several competing
// directions. Nothing is invented here: her document is pasted in whole, split
// into options, and her own concept boards are attached to each. The presenter
// formats; the reviewer barely touches it.
//
// Either way she reads, re-runs any stage, then approves — approval turns the
// deck into a portal presentation ready to invite.

type SpaceAnalysis = { space: string; read: string; light: string; constraints: string };
type Img = {
  id: string; label: string | null; analysis: SpaceAnalysis | null; url: string | null;
  // A photograph is "prepared" once its 3:2 base and its wall mask exist. Both
  // are made on a canvas in this page: the deployed runtime is Workers, where
  // sharp cannot run, so pixels are the browser's job.
  hasMask?: boolean; baseUrl?: string | null; maskUrl?: string | null;
};
type Creative = {
  vibe: string[]; narrative: string;
  palette: { name: string; hex: string; role: string }[];
  moodboard: string;
  spaces: { label: string; concept_title: string; concept: string; palette_refs: string[]; image_prompt: string; image_path?: string }[];
};
type Review = { verdict: string; notes: string[]; flags: string[] };
type Research = { summary: string; sources: string[] };
type Swatch = PaletteSwatch;
type OptionImg = { id: string; caption: string | null; sort: number; url: string | null };
/** One of the client's walls, wearing this direction. */
type SituRender = {
  id: string; image_id: string;
  source: "ai" | "upload"; status: "draft" | "approved";
  url: string | null;
};
type Option = {
  id: string; position: number; title: string; tagline: string;
  body_md: string; palette: Swatch[]; images: OptionImg[]; renders: SituRender[];
};
type Proposal = {
  id: string; title: string; briefing: string; status: string;
  mode?: string; curated_md?: string | null;
  research_brief: string; research_json: Research | null;
  creative_json: Creative | null; review_json: Review | null;
  deck_path: string | null; reviewed_deck_path: string | null;
  presentation_id: string | null; images: Img[]; options?: Option[];
};

const STAGE_ORDER = ["draft", "creative", "composed", "reviewed", "approved"];
// Curated skips the creative entirely — there is nothing for it to invent.
const CURATED_STAGES = ["draft", "composed", "reviewed", "approved"];

export default function StudioPage() {
  const { id: companyId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const staff = useStaff();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [list, setList] = useState<{ id: string; title: string; status: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const api = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/crm/studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail || body?.error || "failed");
    return body;
  }, []);

  const load = useCallback(async (proposalId: string) => {
    const res = await fetch(`/api/admin/crm/studio?proposal_id=${proposalId}`);
    if (res.ok) setProposal(await res.json());
  }, []);

  // The repair is invisible by design — same file, same links, same words — so
  // the button has to say what it did. A control that reports nothing is
  // indistinguishable from a broken one.
  const [repairNote, setRepairNote] = useState<string | null>(null);
  const repair = useCallback(async () => {
    if (!proposal) return;
    setBusy("restyle"); setErr(null); setRepairNote(null);
    try {
      const b = await api({ action: "restyle", proposal_id: proposal.id }) as
        { changed?: boolean; repaired?: number };
      const pairs = b.repaired ?? 0;
      setRepairNote(
        !b.changed
          ? "Already up to date — nothing needed changing."
          : pairs > 0
            ? `Done. Pictures un-cropped, and ${pairs} before-and-after repointed at the photograph.`
            : "Done. Pictures un-cropped.",
      );
      await load(proposal.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }, [api, proposal, load]);


  const loadList = useCallback(async () => {
    const res = await fetch(`/api/admin/crm/studio?company_id=${companyId}`);
    if (res.ok) setList((await res.json()).proposals);
  }, [companyId]);

  useEffect(() => {
    if (staff !== "in") return;
    const pid = search.get("p");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pid) void load(pid); else void loadList();
  }, [staff, search, load, loadList]);

  const run = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!proposal) return;
    setBusy(action); setErr(null);
    try {
      await api({ action, proposal_id: proposal.id, ...extra });
      await load(proposal.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }, [api, proposal, load]);

  if (staff !== "in") return <StaffGate state={staff} title="Proposal Studio" />;

  /* ---------------- proposal picker ---------------- */
  if (!proposal) {
    return (
      <div className="container-x py-8">
        <Link href={`/admin/crm/${companyId}`} className="text-xs text-slate underline">← Back to the deal in the OS</Link>
        <h1 className="mt-3 font-display text-2xl font-bold">Proposal Studio</h1>
        <VideoFirst companyId={companyId} />
        <PrivateImport companyId={companyId} />
        <NewProposal
          onCreate={async (mode, title, text) => {
            const p = await api({
              action: "create", company_id: companyId, title, mode,
              ...(mode === "curated" ? { curated_md: text } : { briefing: text }),
            });
            await load(p.id);
          }}
        />
        {list && list.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-slate">Earlier proposals</p>
            <ul className="mt-2 space-y-1.5">
              {list.map((p) => (
                <li key={p.id}>
                  <button onClick={() => load(p.id)} className="text-sm underline">{p.title}</button>
                  <span className="ml-2 text-xs text-slate">{p.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- the studio ---------------- */
  const curated = proposal.mode === "curated";
  const stages = curated ? CURATED_STAGES : STAGE_ORDER;
  const stage = stages.indexOf(proposal.status);
  // Deck (here) and palette (below) are plain link / new-tab navigations that
  // stream a PDF. A navigation cannot carry a header, but it does carry the
  // staff session cookie, which is what those routes now authorise on.
  const deckUrl = (which: string) =>
    `/api/admin/crm/studio/deck?proposal_id=${proposal.id}&which=${which}`;

  // Curated prerequisites, in place of studio's `creative_json`: her document
  // saved, and at least one direction carrying at least one board.
  const options = proposal.options ?? [];
  const curatedReady =
    Boolean(proposal.curated_md?.trim()) && options.some((o) => o.images.length > 0);
  const canCompose = curated ? curatedReady : Boolean(proposal.creative_json);

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href={`/admin/crm/${companyId}`} className="text-xs text-slate underline">← Back to the deal in the OS</Link>
          <h1 className="mt-2 font-display text-2xl font-bold">{proposal.title}</h1>
          <p className="mt-0.5 text-xs text-slate">
            {curated ? "Curated — your content, formatted and presented." : "Studio — created here, briefing first."}
          </p>
        </div>
        <div className="flex gap-1 text-[0.65rem] uppercase tracking-wide">
          {stages.map((s, i) => (
            <span key={s} className={`rounded-full px-2.5 py-1 ${i <= stage ? "bg-sage/60 text-charcoal" : "bg-wash text-slate"}`}>
              {s}
            </span>
          ))}
        </div>
      </div>
      {err && <p className="mt-3 text-xs text-charcoal/80">{err}</p>}

      {curated ? (
        <>
          {/* 1 — her document */}
          <CuratedDoc proposal={proposal} busy={busy}
            onSave={(title, curated_md) => run("curated_doc", { title, curated_md })}
            onParse={() => run("parse_curated")} />

          {/* 2 — the directions */}
          <section className="mt-10">
            <StepHeader n="2" title="The directions"
              sub="One per alternative the client chooses between. Titles, taglines and palette rows are prefilled from your document — the colour names are yours to settle, and whatever you save here is exactly what the presenter receives." />
            {options.length > 0 && (
              <p className="mt-2 text-[0.7rem] text-slate">
                The deck shows each swatch and your name for it — never the values, shares or roles. Those stay here, and{" "}
                <a href={`/api/admin/crm/studio/palette?proposal_id=${proposal.id}`}
                  className="underline">download as a palette sheet</a>{" "}
                if a client asks for the colours to use elsewhere.
              </p>
            )}
            <div className="mt-4 space-y-4">
              {options.map((o) => (
                <OptionCard key={o.id} option={o} sitePhotos={proposal.images} proposalId={proposal.id} busy={busy}
                  onSave={(fields) => run("option_upsert", { option_id: o.id, ...fields })}
                  onRemove={() => run("option_remove", { option_id: o.id })}
                  onImage={(action, extra) => run(action, extra)}
                  onChange={() => load(proposal.id)} />
              ))}
            </div>
            {options.length === 0 && (
              <p className="mt-3 text-xs text-slate">
                None yet — save your document above and parse it, or add one by hand.
              </p>
            )}
            <button onClick={() => run("option_upsert", { title: "", tagline: "", body_md: "", palette: [] })}
              disabled={busy !== null}
              className="mt-4 rounded-[8px] border border-edge px-3 py-1.5 text-[0.7rem] disabled:opacity-40">
              Add a direction by hand
            </button>
          </section>
        </>
      ) : (
        <>
          {/* 1 — the briefing */}
          <Briefing
            proposal={proposal}
            busy={busy}
            onSave={(title, briefing) => run("brief", { title, briefing })}
          />

          {/* 2 — the research desk */}
          <ResearchDesk proposal={proposal} busy={busy} onRun={(directions) => run("research", { directions })} />
        </>
      )}

      {/* 3 — the photographs */}
      <Photos proposal={proposal} onChange={() => load(proposal.id)} onRun={run} />

      {/* 4 — the creative */}
      {!curated && (
        <section className="mt-10">
          <StepHeader n="4" title="The creative (OpenAI)" sub="Sees the site photographs and the research, then sets vibe, palette, mood, and a wallpaper concept per space." />
          <button onClick={() => run("creative")} disabled={busy !== null || !proposal.briefing.trim()}
            className="btn mt-3 h-9 px-4 text-[0.8rem] disabled:opacity-40">
            {busy === "creative" ? "Directing…" : proposal.creative_json ? "Re-run the creative" : "Run the creative"}
          </button>
          {proposal.creative_json && <CreativeView c={proposal.creative_json} busy={busy} onConcept={(i) => run("concept", { space_index: i })} />}
        </section>
      )}

      {/* 5 — the presenter */}
      <section className="mt-10">
        <StepHeader n={curated ? "4" : "5"} title="The presenter (Claude)"
          sub={curated
            ? "Sets your document in the house design system — one chapter per direction, your boards, your colour names, and a closing ask for the client to name a number. It formats; it does not rewrite you."
            : "Writes the proposal page in the house design system."} />
        <button onClick={() => run("compose")} disabled={busy !== null || !canCompose}
          className="btn mt-3 h-9 px-4 text-[0.8rem] disabled:opacity-40">
          {busy === "compose" ? "Writing… (a minute or two)" : proposal.deck_path ? "Rewrite the deck" : "Write the deck"}
        </button>
        {curated && !curatedReady && (
          <p className="mt-2 text-xs text-slate">
            Save your document and give at least one direction a concept board first.
          </p>
        )}
        {proposal.deck_path && (
          <iframe src={deckUrl("composed")} sandbox="allow-scripts allow-popups" title="Composed deck"
            className="mt-4 h-[70vh] w-full rounded-[14px] border border-edge bg-surface" />
        )}
      </section>

      {/* 6 — the reviewer */}
      <section className="mt-10">
        <StepHeader n={curated ? "5" : "6"} title="The reviewer (Claude)"
          sub={curated
            ? "Reads it as an outside editor, but leaves your words and your colour names alone — it may only tidy the copy written around them, and flags the rest for you."
            : "Simple words, extremely thoughtful. Flags anything only you can settle."} />
        <button onClick={() => run("review")} disabled={busy !== null || !proposal.deck_path}
          className="btn mt-3 h-9 px-4 text-[0.8rem] disabled:opacity-40">
          {busy === "review" ? "Reviewing…" : proposal.review_json ? "Review again" : "Review the deck"}
        </button>
        {proposal.review_json && (
          <div className="mt-4 rounded-[18px] bg-wash p-4">
            <p className="text-xs font-semibold">
              {proposal.review_json.verdict === "ready" ? "Read clean — no changes needed." : "Revised. What changed:"}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate">
              {proposal.review_json.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            {proposal.review_json.flags.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold text-charcoal">Only you can settle:</p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
                  {proposal.review_json.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        {proposal.reviewed_deck_path && (
          <iframe src={deckUrl("reviewed")} sandbox="allow-scripts allow-popups" title="Reviewed deck"
            className="mt-4 h-[70vh] w-full rounded-[14px] border border-edge bg-surface" />
        )}
      </section>

      {/* preview & internal review — before it is ever a client send */}
      {(proposal.reviewed_deck_path || proposal.deck_path) && (
        <section className="mb-12 mt-10">
          <StepHeader
            n={curated ? "5·5" : "6·5"}
            title="Preview & internal review"
            sub="See it in the client's own reader, or hand it to someone inside the studio for a critical read — without approving it or touching the client's timeline."
          />
          <InternalReview proposalId={proposal.id} />
          {/* A layout fix can reach a deck that is already out. The stylesheet
              is code; the prose is hers. This updates only the first. */}
          <button onClick={() => void repair()} disabled={busy !== null}
            className="mt-4 h-9 rounded-[12px] border border-edge px-4 text-[0.8rem] disabled:opacity-40">
            {busy === "restyle" ? "Repairing…" : "Repair this deck"}
          </button>
          {repairNote && <p className="mt-2 text-[0.72rem] font-medium">{repairNote}</p>}
          <p className="mt-1 text-[0.7rem] text-slate">
            Brings a deck that is already composed up to the current layout — how pictures are framed, and
            which photograph each before-and-after is compared against — without putting a word of it back
            through the presenter. The file stays where it is, so every link already sent keeps working.
          </p>
        </section>
      )}

      {/* 7 — approval */}
      <section className="mb-16 mt-10">
        <StepHeader n={curated ? "6" : "7"} title="Your approval" sub="Approval turns the reviewed deck into a portal presentation — then invite the client here." />
        {proposal.presentation_id ? (
          <p className="mt-3 text-sm">
            Approved. Invite the client below.
          </p>
        ) : null}
        {proposal.presentation_id ? (
          <Presentations companyId={companyId} deals={[]} />
        ) : (
          <button onClick={() => run("approve")} disabled={busy !== null || !(proposal.reviewed_deck_path || proposal.deck_path)}
            className="btn mt-3 h-10 px-5 text-[0.8rem] disabled:opacity-40">
            {busy === "approve" ? "Approving…" : "Approve — send it to the portal"}
          </button>
        )}
        <p className="mt-2 text-xs text-slate">
          Not right yet? Edit {curated ? "your document or the directions" : "the briefing"} above and re-run any stage — each button re-runs from there down.
        </p>
      </section>
    </div>
  );
}

// The reviewed deck, before approval, in two directions at once: opened in the
// recipient's own /p chrome so Roheena sees exactly what the client will, and
// shareable to an internal reader (Samir) for a critical pass whose comments
// come back here rather than onto the client's timeline. Both are the same
// portal the approve step uses, flagged internal so they never reach the client
// Presentations list. See the internal_share action in the studio route.
type InternalComment = { id: string; body: string; anchor: string | null; kind: string; created_at: string; from: string | null };

function InternalReview({ proposalId }: { proposalId: string }) {
  const [comments, setComments] = useState<InternalComment[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/crm/studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, action: "internal_share", ...payload }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail || body?.error || "failed");
      return body as { link?: string; emailed?: boolean; comments?: InternalComment[] };
    },
    [proposalId],
  );

  // Load any critique already left, without creating a share.
  useEffect(() => {
    let live = true;
    void call({ mode: "list" })
      .then((b) => { if (live) setComments(b.comments ?? []); })
      .catch(() => {});
    return () => { live = false; };
  }, [call]);

  const preview = async () => {
    setBusy("preview"); setErr(null); setNote(null);
    try {
      const b = await call({ mode: "preview" });
      setLink(b.link ?? null);
      if (b.link) window.open(b.link, "_blank", "noopener");
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  };

  const invite = async () => {
    if (!email.trim()) return;
    setBusy("invite"); setErr(null); setNote(null);
    try {
      const b = await call({ email: email.trim(), name: name.trim(), notify: true });
      setLink(b.link ?? null);
      setComments(b.comments ?? comments);
      setNote(b.emailed ? `Emailed ${email.trim()}.` : "Not emailed — copy the link below and send it yourself.");
      setEmail(""); setName("");
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  };

  const refresh = async () => {
    setBusy("refresh");
    try { const b = await call({ mode: "list" }); setComments(b.comments ?? []); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-3 rounded-[18px] bg-wash p-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={preview} disabled={busy !== null}
          className="btn h-9 px-4 text-[0.8rem] disabled:opacity-40">
          {busy === "preview" ? "Opening…" : "Open as the client will see it"}
        </button>
        {link && (
          <button onClick={() => navigator.clipboard?.writeText(link)}
            className="h-9 rounded-[12px] border border-edge px-4 text-[0.8rem]">
            Copy link
          </button>
        )}
      </div>

      <div className="mt-4 border-t border-edge pt-3">
        <p className="text-xs font-semibold">Send it to someone inside the studio</p>
        <p className="mt-0.5 text-[0.68rem] text-slate">
          A private link for a critical read — Samir, say. Their comments come back here, not to the client.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — e.g. Samir"
            className="h-9 w-32 rounded-[10px] border border-edge bg-surface px-2.5 text-xs" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com"
            className="h-9 w-52 rounded-[10px] border border-edge bg-surface px-2.5 text-xs" />
          <button onClick={invite} disabled={busy !== null || !email.trim()}
            className="btn h-9 px-4 text-[0.8rem] disabled:opacity-40">
            {busy === "invite" ? "Sending…" : "Send for a critical read"}
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-charcoal/80">{note}</p>}
        {err && <p className="mt-2 text-xs text-charcoal/80">{err}</p>}
      </div>

      <div className="mt-4 border-t border-edge pt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold">Internal comments</p>
          <button onClick={refresh} disabled={busy !== null} className="text-[0.65rem] underline disabled:opacity-40">
            {busy === "refresh" ? "refreshing…" : "refresh"}
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="mt-1 text-[0.68rem] text-slate">No internal comments yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-[12px] bg-surface px-3 py-2">
                <p className="text-[0.68rem] text-slate">
                  {c.from ?? "Someone"}{c.anchor ? ` · on “${c.anchor}”` : ""}
                  {c.kind === "call" ? " · asked for a call" : ""}
                </p>
                <p className="mt-0.5 text-xs">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StepHeader({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-display text-sm font-bold">{n} · {title}</h2>
      <p className="mt-0.5 text-xs text-slate">{sub}</p>
    </div>
  );
}

function ResearchDesk({ proposal, busy, onRun }: {
  proposal: Proposal; busy: string | null; onRun: (directions: string) => void;
}) {
  const [directions, setDirections] = useState(proposal.research_brief ?? "");
  const r = proposal.research_json;
  return (
    <section className="mt-10">
      <StepHeader n="2" title="The research desk (OpenAI, optional)"
        sub="Point it at the world before it designs — it searches the web and reports only what it finds, with sources. Findings feed the creative and the presenter as background, never as client-facing claims." />
      <textarea
        value={directions}
        onChange={(e) => setDirections(e.target.value)}
        rows={3}
        placeholder="e.g. Study LTIMindtree's Outcreate brand language and recent press about their Kolkata campus. What do their current offices look like? What tone do their public materials use?"
        className="mt-3 w-full max-w-3xl rounded-[12px] border border-edge bg-surface p-3 text-sm outline-none focus:border-charcoal"
      />
      <button onClick={() => onRun(directions)} disabled={busy !== null || directions.trim().length < 10}
        className="btn mt-2 h-9 px-4 text-[0.8rem] disabled:opacity-40">
        {busy === "research" ? "Researching…" : r ? "Research again" : "Run the research"}
      </button>
      {r && (
        <div className="mt-4 max-w-3xl rounded-[18px] bg-wash p-4">
          <p className="whitespace-pre-wrap text-sm">{r.summary}</p>
          {r.sources.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-[0.68rem] text-slate">
              {r.sources.map((s, i) => (
                <li key={i} className="truncate">
                  <a href={s} target="_blank" rel="noreferrer" className="underline">{s}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function NewProposal({ onCreate }: {
  onCreate: (mode: "studio" | "curated", title: string, text: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"studio" | "curated">("studio");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const curated = mode === "curated";
  return (
    <div className="mt-5 max-w-2xl rounded-[18px] bg-wash p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <ModeCard active={!curated} onClick={() => setMode("studio")}
          title="Create it in the studio"
          sub="You brief; the creative invents the direction, the presenter writes it." />
        <ModeCard active={curated} onClick={() => setMode("curated")}
          title="I've created the content"
          sub="Paste your document and attach your own artwork. Nothing is invented — it's formatted and presented." />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={curated
          ? "Title — e.g. LTM Kolkata, Five Aesthetic Schools of Thought"
          : "Title — e.g. Outcreate Kolkata, the Welcome Centre"}
        className="mt-3 h-11 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder={curated
          ? "Paste the whole document, exactly as you wrote it. Keep your headings — each top-level heading that is a direction becomes an option the client chooses between."
          : "The briefing — everything you'd tell your design head. The client, the spaces, what they said, what you want them to feel, what to avoid, budget signals, deadlines…"}
        className="mt-2 w-full rounded-[12px] border border-edge bg-surface p-3 text-sm outline-none focus:border-charcoal" />
      <button
        onClick={async () => { setBusy(true); try { await onCreate(mode, title.trim() || "Untitled proposal", text); } finally { setBusy(false); } }}
        disabled={busy || text.trim().length < 40}
        className="btn mt-3 h-10 px-5 text-[0.8rem] disabled:opacity-40">
        {busy ? "Creating…" : curated ? "Bring it in" : "Start the studio"}
      </button>
      <p className="mt-2 text-xs text-slate">
        {curated
          ? "Your document is the contract and the copy — it gets set, never rewritten."
          : "The briefing is the contract — every agent works only from it and the photographs."}
      </p>
    </div>
  );
}

function ModeCard({ active, onClick, title, sub }: {
  active: boolean; onClick: () => void; title: string; sub: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-[14px] border p-3 text-left transition ${
        active ? "border-charcoal bg-surface" : "border-edge bg-surface/50 hover:border-charcoal/40"
      }`}>
      <p className="text-[0.8rem] font-semibold">{title}</p>
      <p className="mt-0.5 text-[0.68rem] leading-snug text-slate">{sub}</p>
    </button>
  );
}

function CuratedDoc({ proposal, busy, onSave, onParse }: {
  proposal: Proposal; busy: string | null;
  onSave: (title: string, doc: string) => void; onParse: () => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [doc, setDoc] = useState(proposal.curated_md ?? "");
  const [confirming, setConfirming] = useState(false);
  const dirty = title !== proposal.title || doc !== (proposal.curated_md ?? "");
  const hasOptions = (proposal.options ?? []).length > 0;
  return (
    <section className="mt-8">
      <StepHeader n="1" title="Your document"
        sub="The contract and the copy. It is set into the design system, never rewritten — no claim, sentence or colour name of yours is touched. Editing it resets the stages below." />
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        className="mt-3 h-10 w-full max-w-2xl rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal" />
      <textarea value={doc} onChange={(e) => setDoc(e.target.value)} rows={10}
        className="mt-2 w-full rounded-[12px] border border-edge bg-surface p-3 font-mono text-xs outline-none focus:border-charcoal" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {dirty && (
          <button onClick={() => onSave(title, doc)} disabled={busy !== null}
            className="btn h-9 px-4 text-[0.8rem] disabled:opacity-40">
            {busy === "curated_doc" ? "Saving…" : "Save document (resets stages below)"}
          </button>
        )}
        {!confirming ? (
          <button onClick={() => (hasOptions ? setConfirming(true) : onParse())}
            disabled={busy !== null || dirty || !doc.trim()}
            className="rounded-[8px] border border-edge px-3 py-1.5 text-[0.7rem] disabled:opacity-40">
            {busy === "parse_curated" ? "Reading…" : hasOptions ? "Parse again" : "Parse into directions"}
          </button>
        ) : (
          <span className="flex items-center gap-2 text-[0.7rem]">
            {/* The one destructive button in curated mode: a re-parse overwrites
                the titles, taglines and palettes she has settled. */}
            Re-parsing overwrites your titles, taglines and colour names. Your uploaded boards stay.
            <button onClick={() => { setConfirming(false); onParse(); }}
              className="rounded-[8px] border border-charcoal px-3 py-1.5">Overwrite</button>
            <button onClick={() => setConfirming(false)} className="underline">Cancel</button>
          </span>
        )}
        {dirty && <span className="text-[0.7rem] text-slate">Save before parsing.</span>}
      </div>
    </section>
  );
}

function Briefing({ proposal, busy, onSave }: {
  proposal: Proposal; busy: string | null;
  onSave: (title: string, briefing: string) => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [briefing, setBriefing] = useState(proposal.briefing);
  const dirty = title !== proposal.title || briefing !== proposal.briefing;
  return (
    <section className="mt-8">
      <StepHeader n="1" title="Your briefing" sub="The only human input. Editing it resets the stages below — they were built on the old brief." />
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        className="mt-3 h-10 w-full max-w-2xl rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal" />
      <textarea value={briefing} onChange={(e) => setBriefing(e.target.value)} rows={7}
        className="mt-2 w-full rounded-[12px] border border-edge bg-surface p-3 text-sm outline-none focus:border-charcoal" />
      {dirty && (
        <button onClick={() => onSave(title, briefing)} disabled={busy !== null}
          className="btn mt-2 h-9 px-4 text-[0.8rem] disabled:opacity-40">
          {busy === "brief" ? "Saving…" : "Save briefing (resets stages below)"}
        </button>
      )}
    </section>
  );
}

function Photos({ proposal, onChange, onRun }: {
  proposal: Proposal;
  onChange: () => void; onRun: (action: string, extra?: Record<string, unknown>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  // Which photograph's wall is being chosen, if any.
  const [preparing, setPreparing] = useState<Img | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.set("proposal_id", proposal.id);
      fd.set("file", f);
      await fetch("/api/admin/crm/studio", { method: "POST", body: fd });
    }
    setUploading(false);
    onChange();
  };

  return (
    <section className="mt-10">
      <StepHeader n="3" title="The site photographs"
        sub="What the client sent AND your own shots of the actual site — the creative sees every one of these as an image, so this is how you show it 'this is how it's going to be'. Each is identified on upload; edit the label to how you'd name the space." />
      <label className="btn mt-3 inline-block h-9 cursor-pointer px-4 text-[0.8rem] leading-9">
        {uploading ? "Uploading…" : "Add photographs"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
          onChange={(e) => upload(e.target.files)} />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {proposal.images.map((im) => (
          <PhotoCard key={im.id} im={im}
            onLabel={(label) => onRun("label", { image_id: im.id, label })}
            onRemove={() => onRun("remove_image", { image_id: im.id })}
            onPrepare={() => setPreparing(im)} />
        ))}
      </div>
      {preparing && (
        <WallMaskEditor
          photo={preparing}
          proposalId={proposal.id}
          onDone={onChange}
          onClose={() => setPreparing(null)}
        />
      )}
      {proposal.images.length === 0 && (
        <p className="mt-3 text-xs text-slate">
          None yet — the creative can also work from the briefing alone and propose the spaces it implies.
        </p>
      )}
    </section>
  );
}

function PhotoCard({ im, onLabel, onRemove, onPrepare }: {
  im: Img; onLabel: (l: string) => void; onRemove: () => void; onPrepare: () => void;
}) {
  const [label, setLabel] = useState(im.label ?? "");
  return (
    <div className="rounded-[14px] bg-wash p-2.5">
      {im.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={im.url} alt={im.label ?? "client photograph"} className="aspect-[4/3] w-full rounded-[10px] object-cover" />
      ) : (
        <div className="aspect-[4/3] w-full rounded-[10px] bg-surface" />
      )}
      <div className="mt-2 flex gap-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== (im.label ?? "") && onLabel(label)}
          placeholder="Label this wall…"
          className="h-8 flex-1 rounded-[8px] border border-edge bg-surface px-2 text-xs outline-none focus:border-charcoal" />
        <button onClick={onRemove} className="text-xs text-slate" aria-label="Remove photograph">×</button>
      </div>
      {/* Preparing the wall is done once per photograph and reused by every
          direction — the wall does not change because the artwork does. */}
      <div className="mt-1.5 flex items-center justify-between text-[0.66rem]">
        <span className={im.hasMask ? "text-charcoal" : "text-slate"}>
          {im.hasMask ? "Wall chosen" : "Wall not chosen yet"}
        </span>
        <button onClick={onPrepare} className="rounded-[6px] border border-edge px-2 py-0.5">
          {im.hasMask ? "Edit the wall" : "Choose the wall"}
        </button>
      </div>
      {im.analysis && (
        <p className="mt-1.5 text-[0.68rem] leading-snug text-slate">
          <span className="font-semibold capitalize text-charcoal">{im.analysis.space}</span> · {im.analysis.read}
        </p>
      )}
    </div>
  );
}

/**
 * The client's own walls, wearing one direction.
 *
 * A flat board asks the client to imagine; this shows them. Each of their
 * photographs gets a cell: render it, look at it, approve it or replace it with
 * one she made herself. Only what she approves is composed into the deck.
 *
 * Renders run ONE AT A TIME even behind "Render every wall". Each is a slow
 * image call, and a browser firing eight at once collects eight timeouts.
 */
function InTheirSpace({ option, sitePhotos, proposalId, onChange }: {
  option: Option;
  sitePhotos: Img[];
  proposalId: string;
  onChange: () => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/crm/studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal_id: proposalId, ...payload }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail || body?.error || "failed");
    return body;
  };

  /** The model answers with a ~2.7 MB PNG. Forty of those is a deck nobody can
   *  open, and the server cannot shrink them — sharp does not run on Workers —
   *  so the browser makes the rendition and sends it straight back. */
  const shrinkAndStore = async (imageId: string, url: string) => {
    try {
      const bmp = await createImageBitmap(await fetch(url).then((r) => r.blob()));
      const c = document.createElement("canvas");
      c.width = Math.min(1600, bmp.width);
      c.height = Math.round((bmp.height * c.width) / bmp.width);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
      if (!blob) return;
      const fd = new FormData();
      fd.set("proposal_id", proposalId);
      fd.set("option_id", option.id);
      fd.set("rendition_for_image_id", imageId);
      fd.set("file", new File([blob], "render.jpg", { type: "image/jpeg" }));
      await fetch("/api/admin/crm/studio", { method: "POST", body: fd });
    } catch (e) {
      // A missing rendition costs weight, not correctness: the deck falls back
      // to the original.
      console.error("[studio] rendition failed:", e);
    }
  };

  const renderOne = async (imageId: string) => {
    setErr(null);
    setRunning(imageId);
    try {
      const r = await post({ action: "render_situ", option_id: option.id, image_id: imageId });
      if (r?.url) await shrinkAndStore(imageId, r.url);
      onChange();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setRunning(null);
    }
  };

  const renderAll = async () => {
    setErr(null);
    const todo = sitePhotos.filter((p) => !option.renders.some((r) => r.image_id === p.id));
    setQueue({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      setRunning(todo[i].id);
      try {
        const r = await post({ action: "render_situ", option_id: option.id, image_id: todo[i].id });
        if (r?.url) await shrinkAndStore(todo[i].id, r.url);
      } catch (e) {
        // One wall failing must not abandon the other seven.
        setErr(`${todo[i].label ?? "a wall"}: ${String(e instanceof Error ? e.message : e)}`);
      }
      setQueue({ done: i + 1, total: todo.length });
      onChange();
    }
    setRunning(null);
    setQueue(null);
  };

  const upload = async (imageId: string, file: File) => {
    setRunning(imageId);
    try {
      const fd = new FormData();
      fd.set("proposal_id", proposalId);
      fd.set("option_id", option.id);
      fd.set("render_for_image_id", imageId);
      fd.set("file", file);
      await fetch("/api/admin/crm/studio", { method: "POST", body: fd });
      onChange();
    } finally {
      setRunning(null);
    }
  };

  const pending = running !== null || queue !== null;
  const approved = option.renders.filter((r) => r.status === "approved").length;

  return (
    <>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wide text-slate">
        In their space ({approved} of {sitePhotos.length} approved)
        <button onClick={renderAll} disabled={pending || option.images.length === 0}
          className="rounded-[6px] border border-edge px-2.5 py-1 text-[0.66rem] font-normal normal-case tracking-normal disabled:opacity-40">
          {queue ? `Rendering ${queue.done} of ${queue.total}…` : "Render every wall"}
        </button>
      </p>
      {option.images.length === 0 && (
        <p className="mt-1 text-[0.66rem] text-slate">Add a concept board first — it is what gets applied to the wall.</p>
      )}
      {err && <p className="mt-1 text-[0.66rem] text-red-700">{err}</p>}

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {sitePhotos.map((ph) => {
          const r = option.renders.find((x) => x.image_id === ph.id);
          return (
            <div key={ph.id} className="rounded-[10px] bg-surface p-1.5">
              <div className="relative overflow-hidden rounded-[8px]">
                {/* The render where there is one, so the cell shows the thing
                    being judged; otherwise their bare wall. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(r?.url ?? ph.url) ?? undefined} alt={ph.label ?? "space"}
                  className="aspect-[4/3] w-full object-cover" />
                {running === ph.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[0.66rem]">
                    Rendering…
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[0.64rem] text-slate">{ph.label ?? "Unlabelled wall"}</p>
              <p className="text-[0.6rem] text-slate">
                {!r ? "—" : r.source === "upload" ? "yours" : r.status === "approved" ? "approved" : "draft"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[0.62rem]">
                <button onClick={() => renderOne(ph.id)} disabled={pending || option.images.length === 0}
                  className="rounded-[6px] border border-edge px-2 py-0.5 disabled:opacity-40">
                  {r ? "Re-render" : "Render"}
                </button>
                {r && r.status === "draft" && (
                  <button onClick={() => post({ action: "render_approve", render_id: r.id }).then(onChange)}
                    disabled={pending} className="rounded-[6px] border border-charcoal px-2 py-0.5 disabled:opacity-40">
                    Approve
                  </button>
                )}
                {r && r.status === "approved" && r.source === "ai" && (
                  <button onClick={() => post({ action: "render_approve", render_id: r.id, status: "draft" }).then(onChange)}
                    disabled={pending} className="rounded-[6px] border border-edge px-2 py-0.5 disabled:opacity-40">
                    Unapprove
                  </button>
                )}
                <label className="cursor-pointer rounded-[6px] border border-edge px-2 py-0.5">
                  Mine
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(ph.id, f); }} />
                </label>
                {r && (
                  <button onClick={() => post({ action: "render_remove", render_id: r.id }).then(onChange)}
                    disabled={pending} className="text-slate" aria-label="Remove this render">×</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {sitePhotos.length === 0 && (
        <p className="mt-1 text-[0.66rem] text-slate">
          No client photographs yet — add them below and they will appear here.
        </p>
      )}
    </>
  );
}

function OptionCard({ option, sitePhotos, proposalId, busy, onSave, onRemove, onImage, onChange }: {
  option: Option; sitePhotos: Img[]; proposalId: string; busy: string | null;
  onSave: (fields: { title: string; tagline: string; body_md: string; palette: Swatch[] }) => void;
  onRemove: () => void;
  onImage: (action: string, extra: Record<string, unknown>) => void;
  onChange: () => void;
}) {
  const [title, setTitle] = useState(option.title);
  const [tagline, setTagline] = useState(option.tagline);
  const [palette, setPalette] = useState<Swatch[]>(option.palette ?? []);
  const [openBody, setOpenBody] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty =
    title !== option.title || tagline !== option.tagline ||
    JSON.stringify(palette) !== JSON.stringify(option.palette ?? []);

  const setSwatch = (i: number, patch: Partial<Swatch>) =>
    setPalette((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    // Sequential, not parallel: each board is 3-4 MB and gets a rendition made
    // server-side, and five at once is how you time a route out.
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.set("proposal_id", proposalId);
      fd.set("option_id", option.id);
      fd.set("file", f);
      fd.set("label", f.name.replace(/\.[^.]+$/, ""));
      await fetch("/api/admin/crm/studio", { method: "POST", body: fd });
    }
    setUploading(false);
    onChange();
  };

  return (
    <div className="rounded-[18px] bg-wash p-4">
      <div className="flex items-start gap-2">
        <span className="mt-2 text-xs font-semibold text-slate">{option.position}</span>
        <div className="flex-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The direction's name"
            className="h-9 w-full rounded-[10px] border border-edge bg-surface px-2.5 text-sm font-semibold outline-none focus:border-charcoal" />
          <input value={tagline} onChange={(e) => setTagline(e.target.value)}
            placeholder="What it says about the client — one line"
            className="mt-1.5 h-9 w-full rounded-[10px] border border-edge bg-surface px-2.5 text-xs outline-none focus:border-charcoal" />
        </div>
        <button onClick={onRemove} disabled={busy !== null}
          className="text-xs text-slate disabled:opacity-40" aria-label="Remove this direction">×</button>
      </div>

      <button onClick={() => setOpenBody((v) => !v)} className="mt-2.5 text-[0.7rem] text-slate underline">
        {openBody ? "Hide your text" : `Your text (${option.body_md.length.toLocaleString()} characters)`}
      </button>
      {openBody && (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] bg-surface p-3 font-mono text-[0.68rem] leading-relaxed">
          {option.body_md}
        </pre>
      )}

      {/* The palette. Names are hers; parsed colours are prefills she edits. */}
      <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-wide text-slate">Palette</p>
      <p className="text-[0.66rem] text-slate">
        Your names go to the client exactly as typed. Colours are prefilled from your palette notes — change or clear any of them; a cleared swatch ships as a plain labelled chip. The values, shares and roles below stay internal: the deck shows the strip above, where each share is a width, never a number.
      </p>
      {/* Exactly what the client will see: the shares as widths, the names
          beneath, and no numbers anywhere. */}
      {palette.length > 0 && <PaletteStrip swatches={palette} className="mt-2" />}
      <div className="mt-3 space-y-1.5">
        {palette.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="h-7 w-7 shrink-0 rounded-[6px] border border-edge"
              style={{ background: s.hex && /^#[0-9a-fA-F]{6}$/.test(s.hex) ? s.hex : "#EFE8DF" }} />
            <input value={s.name} onChange={(e) => setSwatch(i, { name: e.target.value })} placeholder="Colour name"
              className="h-7 min-w-[10rem] flex-1 rounded-[6px] border border-edge bg-surface px-2 text-[0.7rem] outline-none focus:border-charcoal" />
            <input value={s.hex ?? ""} onChange={(e) => setSwatch(i, { hex: e.target.value.trim() || null })}
              placeholder="#RRGGBB"
              className="h-7 w-24 rounded-[6px] border border-edge bg-surface px-2 font-mono text-[0.68rem] outline-none focus:border-charcoal" />
            <input type="color" value={s.hex && /^#[0-9a-fA-F]{6}$/.test(s.hex) ? s.hex : "#EFE8DF"}
              onChange={(e) => setSwatch(i, { hex: e.target.value })}
              aria-label={`Pick a colour for ${s.name || "this swatch"}`}
              className="h-7 w-8 cursor-pointer rounded-[6px] border border-edge bg-surface" />
            <input value={s.pct ?? ""} onChange={(e) => setSwatch(i, { pct: e.target.value.trim() || null })}
              placeholder="%"
              className="h-7 w-20 rounded-[6px] border border-edge bg-surface px-2 text-[0.68rem] outline-none focus:border-charcoal" />
            <input value={s.role ?? ""} onChange={(e) => setSwatch(i, { role: e.target.value.trim() || null })}
              placeholder="role"
              className="h-7 w-28 rounded-[6px] border border-edge bg-surface px-2 text-[0.68rem] outline-none focus:border-charcoal" />
            {/* On a cleared swatch, the parser's original read stays one click away. */}
            {!s.hex && s.hex_suggestion && (
              <button onClick={() => setSwatch(i, { hex: s.hex_suggestion ?? null })}
                className="rounded-[6px] border border-dashed border-edge px-2 py-1 text-[0.62rem] text-slate">
                suggested {s.hex_suggestion} — use
              </button>
            )}
            <button onClick={() => setPalette((rows) => rows.filter((_, j) => j !== i))}
              className="text-[0.7rem] text-slate" aria-label="Remove this swatch">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => setPalette((rows) => [...rows, { name: "", hex: null, role: null, pct: null }])}
        className="mt-1.5 rounded-[6px] border border-edge px-2.5 py-1 text-[0.66rem]">
        Add a colour
      </button>

      {/* Her finished boards for this direction. */}
      <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-wide text-slate">
        Concept boards ({option.images.length})
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {option.images.map((im, i) => (
          <div key={im.id} className="rounded-[10px] bg-surface p-1.5">
            {im.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={im.url} alt={im.caption ?? "concept board"} className="aspect-[3/2] w-full rounded-[8px] object-cover" />
            ) : (
              <div className="aspect-[3/2] w-full rounded-[8px] bg-wash" />
            )}
            <BoardCaption im={im}
              onCaption={(caption) => onImage("option_image_update", { image_id: im.id, caption })} />
            <div className="mt-1 flex items-center justify-between text-[0.62rem] text-slate">
              <span className="flex gap-1">
                <button disabled={i === 0}
                  onClick={() => onImage("option_image_update", { image_id: im.id, sort: (option.images[i - 1]?.sort ?? im.sort) - 1 })}
                  className="disabled:opacity-30" aria-label="Move earlier">←</button>
                <button disabled={i === option.images.length - 1}
                  onClick={() => onImage("option_image_update", { image_id: im.id, sort: (option.images[i + 1]?.sort ?? im.sort) + 1 })}
                  className="disabled:opacity-30" aria-label="Move later">→</button>
              </span>
              <button onClick={() => onImage("option_image_remove", { image_id: im.id })} aria-label="Remove board">×</button>
            </div>
          </div>
        ))}
      </div>
      <label className="mt-2 inline-block cursor-pointer rounded-[8px] border border-edge px-3 py-1.5 text-[0.7rem]">
        {uploading ? "Uploading…" : "Add boards"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
          onChange={(e) => upload(e.target.files)} />
      </label>

      <InTheirSpace option={option} sitePhotos={sitePhotos}
        proposalId={proposalId} onChange={onChange} />

      {dirty && (
        <div className="mt-3">
          <button onClick={() => onSave({ title, tagline, body_md: option.body_md, palette })}
            disabled={busy !== null}
            className="btn h-8 px-3.5 text-[0.75rem] disabled:opacity-40">
            {busy === "option_upsert" ? "Saving…" : "Save this direction"}
          </button>
        </div>
      )}
    </div>
  );
}

function BoardCaption({ im, onCaption }: { im: OptionImg; onCaption: (c: string) => void }) {
  const [caption, setCaption] = useState(im.caption ?? "");
  return (
    <input value={caption} onChange={(e) => setCaption(e.target.value)}
      onBlur={() => caption !== (im.caption ?? "") && onCaption(caption)}
      placeholder="Caption…"
      className="mt-1 h-7 w-full rounded-[6px] border border-edge bg-surface px-1.5 text-[0.62rem] outline-none focus:border-charcoal" />
  );
}

function CreativeView({ c, busy, onConcept }: {
  c: Creative; busy: string | null; onConcept: (i: number) => void;
}) {
  const vibe = useMemo(() => c.vibe.join(" · "), [c.vibe]);
  return (
    <div className="mt-4 rounded-[18px] bg-wash p-4">
      <p className="text-xs uppercase tracking-wide text-slate">{vibe}</p>
      <p className="mt-2 max-w-2xl text-sm">{c.narrative}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {c.palette.map((p) => (
          <div key={p.name} className="w-20">
            <div className="aspect-square w-full rounded-[8px] border border-edge" style={{ background: p.hex }} />
            <p className="mt-1 text-[0.65rem] font-semibold">{p.name}</p>
            <p className="text-[0.6rem] text-slate">{p.hex} · {p.role}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-2xl text-xs text-slate">{c.moodboard}</p>
      <div className="mt-4 space-y-3">
        {c.spaces.map((s, i) => (
          <div key={i} className="rounded-[12px] bg-surface p-3">
            <p className="text-xs text-slate">{s.label}</p>
            <p className="text-sm font-semibold">{s.concept_title}</p>
            <p className="mt-1 text-xs text-slate">{s.concept}</p>
            <button onClick={() => onConcept(i)} disabled={busy !== null}
              className="mt-2 rounded-[8px] border border-edge px-3 py-1.5 text-[0.7rem] disabled:opacity-40">
              {busy === "concept" ? "Rendering…" : s.image_path ? "Re-render concept art" : "Render concept art"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
