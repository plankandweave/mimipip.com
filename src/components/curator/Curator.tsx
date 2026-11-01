"use client";

import { useEffect, useRef, useState } from "react";
import { CURATION_KEY, emptySession, type CuratorSession, type ZAnalysis, type ZPick } from "./types";
import { CuratorStart } from "./CuratorStart";
import { useAuthGate } from "@/components/AuthGate";
import { PhotoUpload } from "./PhotoUpload";
import { CuratorChat } from "./CuratorChat";
import { Curation } from "./Curation";

function Spinner() {
  return <span className="h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-charcoal" />;
}
function Waiting({ msg }: { msg: string }) {
  return (
    <div className="grid min-h-[52vh] place-items-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner />
        <p className="text-slate">{msg}</p>
      </div>
    </div>
  );
}

type ConverseRes = { answers?: Record<string, string>; slotId?: string | null; question?: string; done?: boolean };

export function Curator() {
  const { gate, authModal, signedIn, loading } = useAuthGate();
  const [session, setSession] = useState<CuratorSession | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<CuratorSession | null>(null);
  // Bumped on restart so an in-flight request can't write its response into
  // the fresh session the user just reset to.
  const epoch = useRef(0);

  useEffect(() => {
    let s: CuratorSession;
    try {
      s = (JSON.parse(localStorage.getItem(CURATION_KEY) || "null") as CuratorSession) || emptySession();
    } catch {
      s = emptySession();
    }
    if (!s || !s.stage) s = emptySession();
    if (s.stage === "reading" && !s.analysis) s.stage = "start";
    if (s.stage === "curating" && !(s.picks && s.picks.length)) s.stage = "chat";
    ref.current = s;
    // localStorage is client-only; hydrating here (not in a useState initializer)
    // keeps the server render and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
  }, []);

  const commit = (mut: (s: CuratorSession) => void) => {
    const base = ref.current;
    if (!base) return;
    const next = structuredClone(base);
    mut(next);
    ref.current = next;
    try {
      localStorage.setItem(CURATION_KEY, JSON.stringify(next));
    } catch {
      /* quota — the flow still works in memory */
    }
    setSession(next);
  };

  const submitPhotos = async () => {
    const photos = ref.current?.photos;
    if (!photos?.room && !photos?.wide) return; // either photo is enough
    const at = epoch.current;
    commit((s) => { s.stage = "reading"; });
    // send whichever photo we have as the primary; the other (if any) as the wider shot
    const primary = photos!.room ?? photos!.wide;
    const secondary = photos!.room ? photos!.wide : undefined;
    let analysis: ZAnalysis | null = null;
    try {
      const r = await fetch("/api/curator/read-room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room: primary, wide: secondary }),
      });
      analysis = (await r.json())?.analysis ?? null;
    } catch {
      analysis = null;
    }
    if (at !== epoch.current) return;
    commit((s) => { s.analysis = analysis; s.stage = "chat"; });
    await askNext(undefined, undefined);
  };

  const askNext = async (lastSlotId?: string, lastAnswer?: string) => {
    const cur = ref.current!;
    const at = epoch.current;
    setBusy(true);
    let res: ConverseRes = {};
    try {
      const r = await fetch("/api/curator/converse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: cur.answers, lastSlotId, lastAnswer, asked: cur.asked, summary: cur.analysis?.summary ?? "", imageKind: cur.analysis?.imageKind ?? "room" }),
      });
      res = await r.json();
    } catch {
      res = { question: "Tell me a little about how you'd like the room to feel.", slotId: lastSlotId ?? "feeling", done: false };
    }
    if (at !== epoch.current) return;
    const q = res.question ?? "";
    commit((s) => {
      if (res.answers) s.answers = res.answers;
      s.currentSlotId = res.slotId ?? null;
      if (q) { s.transcript.push({ role: "curator", text: q }); s.asked.push(q); }
    });
    setBusy(false);
    if (res.done) setTimeout(() => { if (at === epoch.current) void runCurate(); }, 800);
  };

  const onSend = async (text: string) => {
    const slotId = ref.current?.currentSlotId ?? undefined;
    commit((s) => { s.transcript.push({ role: "client", text }); });
    await askNext(slotId, text);
  };

  // Three ways in: a photo (existing upload→reading→chat flow), a free-text
  // description (treated as the answer to the first question, then the usual
  // conversation continues), or straight into guided questions with no photo.
  const beginUpload = () => commit((s) => { s.stage = "upload"; });
  const beginGuide = () => {
    commit((s) => { s.stage = "chat"; });
    void askNext(undefined, undefined);
  };
  const beginDescribe = (text: string) => {
    commit((s) => { s.stage = "chat"; s.transcript.push({ role: "client", text }); });
    void askNext("purpose", text);
  };

  // "Make it quieter/bolder" on the results page — nudges the relevant
  // answers and re-runs curation against the same real catalogue.
  const nudge = async (direction: "quieter" | "bolder") => {
    const cur = ref.current!;
    const at = epoch.current;
    const nudged = {
      ...cur.answers,
      feeling: `${cur.answers.feeling ?? ""} ${direction === "quieter" ? "Quieter and more subtle now, please." : "Bolder — more of a real statement, please."}`.trim(),
    };
    commit((s) => { s.answers = nudged; s.stage = "curating"; });
    let picks: ZPick[] = [];
    let note = "";
    try {
      const r = await fetch("/api/curator/curate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: nudged, summary: cur.analysis?.summary ?? "" }),
      });
      const j = await r.json();
      picks = j?.picks ?? [];
      note = j?.note ?? "";
    } catch {
      picks = cur.picks ?? [];
    }
    if (at !== epoch.current) return;
    commit((s) => { s.picks = picks; s.note = note; s.stage = "result"; });
  };

  const runCurate = async () => {
    const at = epoch.current;
    commit((s) => { s.stage = "curating"; });
    let picks: ZPick[] = [];
    let note = "";
    try {
      const r = await fetch("/api/curator/curate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: ref.current!.answers, summary: ref.current!.analysis?.summary ?? "" }),
      });
      const j = await r.json();
      picks = j?.picks ?? [];
      note = j?.note ?? "";
    } catch {
      picks = [];
    }
    if (at !== epoch.current) return;
    commit((s) => { s.picks = picks; s.note = note; s.stage = "result"; });
  };

  const restart = () => {
    epoch.current += 1;
    const s = emptySession();
    ref.current = s;
    try {
      localStorage.setItem(CURATION_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    setBusy(false);
    setSession(s);
  };

  if (!session) return <Waiting msg="" />;

  // The whole curator is Sonnet 5 + Haiku vision, and curate() self-chains, so
  // it's gated at the front door rather than per-call. An unverified visitor is
  // held at the start screen even if localStorage has a half-finished session —
  // otherwise they'd resume straight into a 401. `loading` keeps us from
  // flashing this at a signed-in customer while the session resolves.
  if (!loading && !signedIn) {
    return (
      <>
        <CuratorStart
          onUpload={() => gate("design with our curator", beginUpload)}
          onDescribe={(text) => gate("design with our curator", () => beginDescribe(text))}
          onGuide={() => gate("design with our curator", beginGuide)}
        />
        {authModal}
      </>
    );
  }

  // Every stage past the start screen offers a way back to a blank session —
  // the results page has its own "Start a new curation", this covers the rest.
  const startOver = (maxW: string) => (
    <div className={`mx-auto mb-2 flex ${maxW} justify-end`}>
      <button className="caps text-[0.65rem] text-mist transition-colors hover:text-charcoal" onClick={restart}>
        Start over
      </button>
    </div>
  );

  if (session.stage === "start") {
    return <CuratorStart onUpload={beginUpload} onDescribe={beginDescribe} onGuide={beginGuide} />;
  }
  if (session.stage === "upload") {
    return (
      <>
        {startOver("max-w-3xl")}
        <PhotoUpload
          room={session.photos.room}
          wide={session.photos.wide}
          onRoom={(u) => commit((s) => { s.photos.room = u; })}
          onWide={(u) => commit((s) => { s.photos.wide = u; })}
          onSubmit={submitPhotos}
        />
      </>
    );
  }
  if (session.stage === "reading") {
    return (
      <>
        {startOver("max-w-2xl")}
        <Waiting msg="The curator is looking at your room…" />
      </>
    );
  }
  if (session.stage === "chat") {
    return (
      <>
        {startOver("max-w-2xl")}
        <CuratorChat analysis={session.analysis ?? null} transcript={session.transcript} busy={busy} onSend={onSend} />
      </>
    );
  }
  if (session.stage === "curating") {
    return (
      <>
        {startOver("max-w-2xl")}
        <Waiting msg="Curating your wallpapers…" />
      </>
    );
  }
  return <Curation session={session} onRestart={restart} onNudge={nudge} />;
}
