"use client";
import {layoutChecks,layoutHold,layoutReceipt,requiresLayoutCheck} from "@/lib/marketing/layout-check";
import { StoryLink } from "./StoryLink";
import { preparedCarouselIdea } from "@/lib/marketing/prepared-carousel";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";
import type { MarketingPlan, PlanWeek } from "@/lib/marketing/plan";
import { slotDigestWeb, approvalMedia } from "@/lib/marketing/digest-web";
import { slotFrameTextProblem } from "@/lib/marketing/frame-text";
import { productionHold } from "@/lib/marketing/production-readiness";
import {
  BEAT_LABEL,
  CHANNEL_LABEL,
  adsByChannel,
  awaitingReview,
  composableIdea,
  gridOrder,
  reelsInOrder,
  longDay,
  monthOf,
  shortDay,
  shortTitle,
  stateLabel,
  storiesInOrder,
  tileImage,
  reviewVideo,
  weeksBetween,
} from "./desk-lib";
import { PersonalTab } from "./PersonalTab";
import { LibraryTab } from "./LibraryTab";
import { isPersonalPlan } from "@/lib/marketing/profiles";
import { StoryPlayer } from "./StoryPlayer";
import { LinkedInTab, linkedInSlots, type ChannelStat } from "./LinkedInTab";
import { OutreachQueue, outreachPending, type InboxStatus, type OutreachRow } from "@/components/admin/outreach/OutreachQueue";
import { adminRpc } from "@/lib/admin-rpc";
import { LINKEDIN_POST_TIME_IST } from "@/lib/marketing/linkedin-desk";
import { lockedTimeIST } from "@/lib/marketing/publish-time";
import { Btn, Card, Empty, INK, Kicker, LINE, MIST, PAPER, Pill } from "./ui";
import { enableUrl } from "./desk-lib";
import { CustomerAudiencePanel } from "./CustomerAudiencePanel";
import { MetaRetargetPanel } from "./MetaRetargetPanel";
import { ReelBoostPanel } from "./ReelBoostPanel";
import { GoogleAdsPanel } from "./GoogleAdsPanel";
import { MetaAdsPanel } from "./MetaAdsPanel";

// The marketing desk.
//
// One question per tab:
//   Grid      — what will my Instagram profile look like? (three to a row,
//               newest first, the next three months included)
//   LinkedIn  — the company page a month ahead, as the feed will show it;
//               posted Monday to Friday at 09:30 IST.
//   Calendar  — what is the plan, week by week, and what is planned after it?
//   Stories   — play the Stories in order, as a follower would see them.
//   Ads       — what is running on Google, Meta and ChatGPT, and what does it
//               cost; the creatives, with comments and "give me a variation".
//   Search    — what people typed into Google to find us, and whether we are
//               being shown and chosen. The only place the words appear.
//   Channels  — what is connected, what is not, and how a new plan gets in.
//
// Every tile opens the same drawer: the frame, the brief, the copy, and the
// decision — approve, rewrite, remove. Removed is removed: it vanishes.

//   Collabs   — creators and press who have pitched us, verified and scored,
//               each with a drafted reply to approve or decline. Moved in from
//               /admin/outreach on 27 Sep 2026: "I'd rather go to the marketing
//               portal every day and view everything in one window" — so no
//               email per pitch any more; the morning brief carries the count.
type Tab = "personal" | "grid" | "linkedin" | "collabs" | "reels" | "library" | "calendar" | "stories" | "ads" | "search" | "channels";
const TABS: { key: Tab; label: string }[] = [
  { key: "personal", label: "Roheena" },
  { key: "grid", label: "Grid" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "collabs", label: "Collabs" },
  { key: "reels", label: "Reels" },
  { key: "library", label: "Library" },
  { key: "calendar", label: "Calendar" },
  { key: "stories", label: "Stories" },
  { key: "ads", label: "Ads" },
  { key: "search", label: "Search" },
  { key: "channels", label: "Channels" },
];

type PlanResponse = { today: string; from: string; to: string; plans: MarketingPlan[]; slots: DeskSlot[]; removedCount: number; channelStats?: ChannelStat[]; reelSequence?: { slot: string; swap_with: string | null; line: string }[] };

/** `kind: "choice"` marks a switch with a safe setting and a faster one —
 *  OFF is a working state, not an unfinished one. Drawn apart from the
 *  connections so a deliberate choice never reads as a missing credential. */
type SetupItem = { key: string; ready: boolean; note: string; kind?: "choice" };
type Status = {
  setup: SetupItem[];
  budget: { weekly_cap: number; per_campaign_cap: number; active: boolean; spent_this_week: number; remaining_this_week: number } | null;
  instagram: { ok: boolean; detail: string } | null;
  linkedin: { ok: boolean; detail: string } | null;
} | null;

type PaidChannel = {
  key: string;
  label: string;
  basis: string;
  spend: number;
  clicks: number;
  sessions: number;
  purchases: number;
  cpc: number | null;
  costPerPurchase: number | null;
  campaigns: { name: string; spend: number; clicks: number; sessions: number; purchases: number; cpc: number | null }[];
  note?: string;
};
type Paid = {
  date: string;
  week: PaidChannel[];
  today?: { date: string; channels: PaidChannel[] };
  verdicts: string[];
  flags: string[];
  gaConfigured: boolean;
} | null;

/** Search Console. `position` is average rank, where LOWER IS BETTER. */
type SearchRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type SearchData = {
  configured: boolean;
  /** Which property answered. Null with configured:true means the service
   *  account cannot see a zyvorah.com property — a different fix from a query
   *  that failed, so the two are shown apart. */
  site: string | null;
  window: {
    from: string; to: string; days: number;
    clicks: number; impressions: number; ctr: number; position: number;
    queries: SearchRow[]; pages: SearchRow[];
  } | null;
  /** Present only when there is nothing to show. "No readable property" has
   *  several causes needing different fixes, so the tab prints the cause rather
   *  than leaving her to guess which console to open. */
  diagnosis: {
    serviceAccount: string | null;
    tokenMinted: boolean;
    sitesStatus: number | null;
    sitesError: string | null;
    sites: { siteUrl: string; permissionLevel: string }[];
    pinned: string | null;
    likelyCause: string | null;
  } | null;
} | null;

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);

const isTab = (v: string | null): v is Tab => TABS.some((t) => t.key === v);

export function Desk() {
  const [tab, setTab] = useState<Tab>("grid");
  const [outreach, setOutreach] = useState<OutreachRow[] | null>(null);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [inboxStatus, setInboxStatus] = useState<InboxStatus | null>(null);
  const [personalData, setPersonalData] = useState<PlanResponse | null>(null);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [data, setData] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [paid, setPaid] = useState<Paid>(null);
  const [search, setSearch] = useState<SearchData>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [open, setOpen] = useState<DeskSlot | null>(null);
  const linkedSlotOpened = useRef(false);
  const [player, setPlayer] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOutreach = useCallback(async () => {
    // Best-effort: the "inbox last read" line must never cost the queue itself.
    void adminRpc("admin_outreach_inbox_status").then(({ data }) => setInboxStatus((data ?? null) as InboxStatus | null));
    const { data, error: e } = await adminRpc("admin_outreach_list");
    if (e) {
      setOutreachError(e.message === "unauthorized" ? "You're not signed in." : e.message);
      return;
    }
    setOutreachError(null);
    setOutreach((data ?? []) as OutreachRow[]);
  }, []);

  const loadPersonal = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/plan?profile=roheena&removed=1", { cache: "no-store" });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error ?? "Could not read your personal workspace.");
      setPersonalData(value); setPersonalError(null);
      setOpen((o) => o && isPersonalPlan(o.plan_key) ? value.slots.find((s: DeskSlot) => s.id === o.id) ?? null : o);
    } catch (e) { setPersonalError((e as Error).message); }
  }, []);

  const load = useCallback(async () => {
    void loadPersonal();
    void loadOutreach();
    try {
      const query = new URLSearchParams();
      const linked = new URLSearchParams(window.location.search);
      for (const key of ["from", "to"]) {
        const day = linked.get(key);
        if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) query.set(key, day);
      }
      if (showRemoved) query.set("removed", "1");
      const res = await fetch(`/api/admin/marketing/plan${query.size ? `?${query}` : ""}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `The plan could not be read (${res.status}).`);
        return;
      }
      const j = (await res.json()) as PlanResponse;
      setError(null);
      setData(j);
      const linkedSlot = linkedSlotOpened.current ? null : j.slots.find((s) => s.id === linked.get("slot")) ?? null;
      if (linkedSlot) linkedSlotOpened.current = true;
      setOpen((o) => (o && !isPersonalPlan(o.plan_key) ? (j.slots.find((s) => s.id === o.id) ?? null) : o ?? linkedSlot));
    } catch {
      setError("Couldn't reach the server.");
    }
    fetch("/api/admin/marketing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setStatus(s))
      .catch(() => setStatus(null));
    fetch("/api/admin/search-console", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSearch)
      .catch(() => setSearch(null));
    fetch("/api/admin/marketing/paid", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setPaid(p))
      .catch(() => setPaid(null));
  }, [showRemoved, loadOutreach, loadPersonal]);

  // ?tab=collabs from the morning brief (or an old /admin/outreach link) opens
  // that tab directly; the decision is the action, and making her find it
  // inside the desk is how a daily chore stops being done.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isTab(t)) setTab(t);
  }, []);

  useEffect(() => {
    // Deferred a tick: the lint rule (and React) prefer an effect that does
    // not set state synchronously; the fetch does its own waiting anyway.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const slots = useMemo(() => data?.slots ?? [], [data]);
  const waiting = useMemo(() => slots.filter(awaitingReview), [slots]);
  // Each tab approves only what it shows: "Approve all" on the Instagram grid
  // must never sign a LinkedIn post she has not looked at, and vice versa.
  const igWaiting = useMemo(() => waiting.filter((s) => s.channel !== "linkedin"), [waiting]);
  const liWaiting = useMemo(() => linkedInSlots(waiting, data?.plans ?? []), [waiting, data]);
  const collabWaiting = useMemo(() => (outreach ?? []).filter(outreachPending), [outreach]);
  // Everything that needs her, by tab — the strip under the title. A tab with
  // nothing waiting is not listed, so the strip reads as a to-do, not a menu.
  const needsYou = useMemo(
    () =>
      (
        [
          ["grid", igWaiting.length, "Instagram post", "Instagram posts"],
          ["linkedin", liWaiting.length, "LinkedIn post", "LinkedIn posts"],
          ["collabs", collabWaiting.length, "collab / press pitch", "collab / press pitches"],
        ] as [Tab, number, string, string][]
      ).filter(([, n]) => n > 0),
    [igWaiting.length, liWaiting.length, collabWaiting.length],
  );
  const stories = useMemo(() => storiesInOrder(slots), [slots]);
  const reels = useMemo(() => reelsInOrder(slots), [slots]);

  // Compose on open, not on a clock — and never silently. Two things the
  // founder said on 26 Sep 2026 have to both be true: "it can literally run
  // every time I refresh… I don't need an hourly [run] at all", and "I want
  // it to run on demand and tell me approximately how long it takes". So
  // opening the desk still composes, but it SAYS what it is doing and for how
  // long first, because work happening invisibly under her is the complaint
  // this whole mechanism exists to answer.
  //
  // Days she has already approved are excluded by the survey (and by
  // alreadyDone inside the run), so an approved fortnight is never disturbed.
  const autoComposed = useRef(false);
  useEffect(() => {
    if (!data || tab === "personal" || autoComposed.current) return;
    // Review links are read-only: opening an owner/QA preview must never
    // start the desk's whole-calendar automatic compose loop.
    if (new URLSearchParams(window.location.search).get("review") === "1") return;
    const personalIsOpen = () => new URLSearchParams(window.location.search).get("tab") === "personal";
    if (personalIsOpen()) return;
    autoComposed.current = true;
    (async () => {
      try {
        const sres = await fetch("/api/admin/marketing/plan/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ survey: true }),
        });
        if (!sres.ok || personalIsOpen()) return;
        const sj = (await sres.json()) as { count?: number; ideas?: number; estimateSeconds?: number };
        const count = Number(sj.count ?? 0);
        if (!count) return; // everything is composed or approved: stay quiet
        const mins = Math.max(1, Math.round(Number(sj.estimateSeconds ?? 0) / 60));
        setMsg(`Composing ${count} post${count > 1 ? "s" : ""} — about ${mins} minute${mins > 1 ? "s" : ""}. Nothing you approved is touched.`);

        let made = 0;
        // Planned slots first, then the finished ideas (composeReadyIdeas).
        const phases = Number(sj.ideas ?? 0) > 0 ? [{ all: true }, { ideas: true }] : [{ all: true }];
        for (const phase of phases) {
          for (let round = 1; round <= 8; round++) {
            if (personalIsOpen()) return;
            const res = await fetch("/api/admin/marketing/plan/compose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(phase),
            });
            if (!res.ok || personalIsOpen()) return;
            const j = (await res.json()) as { complete?: boolean; composed?: { status: string }[]; remaining?: string[] };
            const done = (j.composed ?? []).filter((c) => c.status === "queued" || c.status === "published").length;
            made += done;
            if (done) await load();
            if (j.complete) break;
            setMsg(`${made} of ${count} composed — ${(j.remaining ?? []).length} to go…`);
          }
        }
        setMsg(`${made} of ${count} composed.`);
      } catch {
        return;
      }
    })();
  }, [data, load, tab]);

  // ── actions ───────────────────────────────────────────────────────────────
  const call = async (label: string, url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) setMsg(String(json.error ?? `Failed (${res.status}).`));
      return { ok: res.ok, json };
    } catch {
      setMsg("Couldn't reach the server.");
      return { ok: false, json: {} };
    } finally {
      setBusy(null);
    }
  };

  const approve = async (targets: DeskSlot[]) => {
    const withPost = targets.filter((t) => t.post);
    if (!withPost.length) return;
    // The approval endpoint accepts at most 60 IDs. Smaller batches also keep
    // each request bounded while the server writes every approval separately.
    const batchSize = 15;
    let approved = 0;
    const failures: string[] = [];
    setBusy("approve");
    setMsg(`Approving 0 of ${withPost.length}…`);
    try {
      for (let start = 0; start < withPost.length; start += batchSize) {
        const batch = withPost.slice(start, start + batchSize);
        const digests: Record<string, string> = {};
        for (const t of batch) digests[t.post!.id] = await slotDigestWeb(t.post!.caption, approvalMedia(t.post!));
        const res = await fetch("/api/admin/marketing/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", ids: batch.map((t) => t.post!.id), digests }),
        });
        const result = (await res.json().catch(() => ({}))) as {
          error?: string; ok?: number; outcomes?: { ok: boolean; error?: string }[];
        };
        if (!res.ok) {
          failures.push(result.error ?? `Request failed (${res.status})`);
          break;
        }
        approved += result.ok ?? 0;
        failures.push(...(result.outcomes ?? []).filter((o) => !o.ok).map((o) => o.error ?? "Approval failed"));
        setMsg(`Approving ${Math.min(start + batch.length, withPost.length)} of ${withPost.length}… ${approved} saved.`);
      }
    } catch {
      failures.push("Couldn't reach the server. Refresh before retrying.");
    } finally {
      setMsg(
        failures.length
          ? `${approved} of ${withPost.length} approved. ${[...new Set(failures)].join("; ")}`
          : `${approved} approved — each post goes out on its scheduled day.`,
      );
      await load();
      setBusy(null);
    }
  };

  const rewrite = async (s: DeskSlot) => {
    if (!s.post) return;
    const reason = window.prompt("What should be different? (the writer reads this)", "");
    if (reason === null) return;
    const r = await call("rewrite", "/api/admin/marketing/approve", { action: "regenerate", ids: [s.post.id], reason });
    if (r.ok) {
      const status = String(((r.json.outcomes as { status?: string }[] | undefined) ?? [])[0]?.status ?? "");
      setMsg(
        status === "caption updated"
          ? "Done — the caption is updated. It is back in Ready to review."
          : status === "composed again"
            ? "Done — composed again with your note. It is back in Ready to review."
            : `Sent back${status.startsWith("regenerate requested — ") ? ` (${status.slice(23)})` : ""}.`,
      );
    }
    await load();
  };

  const replaceStory = async (s: DeskSlot, file: File, title: string, line: string) => {
    if (!s.post?.media_urls?.[0]) return;
    const form = new FormData();
    form.set("id", s.post.id);
    form.set("expectedUrl", s.post.media_urls[0]);
    form.set("image", file);
    form.set("title", title);
    form.set("line", line);
    setBusy("replace-story");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/marketing/story/replace", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? "Story redrawn from your photograph in the measured frame. Review it before approving." : body.error ?? `Replacement failed (${res.status}).`);
      await load();
    } catch {
      setMsg("Couldn't upload the corrected Story.");
    } finally {
      setBusy(null);
    }
  };

  const rebuildStory = async (s: DeskSlot, sourceUrl: string, title: string, line: string) => {
    if (!s.post?.media_urls?.[0]) return;
    const r = await call("rebuild-story", "/api/admin/marketing/story/replace", {
      id: s.post.id, expectedUrl: s.post.media_urls[0], sourceUrl, title, line,
    });
    if (r.ok) setMsg("Story rebuilt from the catalogue scene. Review this frame before approving it.");
    await load();
  };

  const rebuildReel = async (s: DeskSlot, sceneUrls: string[], title: string, sub: string) => {
    if (!s.post?.media_urls?.[0]) return;
    const r = await call("rebuild-reel", "/api/admin/marketing/reel/replace", {
      id: s.post.id, expectedUrl: s.post.media_urls[0], sceneUrls, title, sub,
    });
    if (r.ok) setMsg("Video rebuilt from exact catalogue scenes. Review the full frame before approving it.");
    await load();
  };

  const remove = async (s: DeskSlot) => {
    if (s.unplanned && s.post) {
      const r = await call("remove", "/api/admin/marketing/approve", { action: "reject", ids: [s.post.id], reason: "removed on the desk" });
      if (r.ok) setMsg("Removed.");
    } else {
      const r = await call("remove", "/api/admin/marketing/plan/slot", { id: s.id, action: "remove" });
      if (r.ok) setMsg("Removed. It will not be composed or posted. Undo from “show removed”.");
    }
    setOpen(null);
    await load();
  };

  const restore = async (s: DeskSlot) => {
    const r = await call("restore", "/api/admin/marketing/plan/slot", { id: s.id, action: "restore" });
    if (r.ok) setMsg("Back on the plan.");
    await load();
  };

  const compose = async (s: DeskSlot) => {
    const r = await call(`compose:${s.id}`, "/api/admin/marketing/plan/compose", { id: s.id });
    if (r.ok) {
      const o = r.json.outcome as { status: string; error?: string } | undefined;
      setMsg(o?.status === "failed" ? `Could not compose: ${o.error}` : o?.status === "skipped" ? "Already composed — remove it or ask for a variation first." : "Composed. Have a look.");
    }
    await load();
  };

  const composeAhead = async () => {
    // Ask what the run would do BEFORE doing it, and say how long — the
    // founder's question (26 Sep 2026) was "tell me approximately how long it
    // takes", which a progress bar cannot answer once you are already
    // committed. Days she has approved are excluded by the survey itself, so
    // an approved fortnight is never recomposed or disturbed.
    const s = await call("compose-ahead", "/api/admin/marketing/plan/compose", { survey: true });
    if (!s.ok) return;
    const count = Number(s.json.count ?? 0);
    if (count === 0) {
      setMsg("Nothing to compose — everything planned or finished is already composed or approved.");
      await load();
      return;
    }
    const secs = Number(s.json.estimateSeconds ?? 0);
    const mins = Math.max(1, Math.round(secs / 60));
    const span =
      s.json.firstDay && s.json.lastDay ? ` (${shortDay(String(s.json.firstDay))} – ${shortDay(String(s.json.lastDay))})` : "";
    if (!window.confirm(`Compose ${count} post${count > 1 ? "s" : ""}${span}?\n\nAbout ${mins} minute${mins > 1 ? "s" : ""}. Nothing you have already approved will be touched.`)) {
      setMsg(null);
      return;
    }

    const began = Date.now();
    let made = 0;
    let failed = 0;
    const reasons: string[] = [];
    // Planned slots first, then the finished ideas (composeReadyIdeas).
    const phases = Number(s.json.ideas ?? 0) > 0 ? [{ all: true }, { ideas: true }] : [{ all: true }];
    for (const phase of phases) {
      let complete = false;
      for (let round = 1; round <= 12; round++) {
        const r = await call("compose-ahead", "/api/admin/marketing/plan/compose", phase);
        if (!r.ok) break;
        const composed = (r.json.composed as { slot: string; status: string; error?: string }[]) ?? [];
        made += composed.filter((c) => c.status === "queued" || c.status === "published").length;
        failed += composed.filter((c) => c.status === "failed").length;
        for (const c of composed) if (c.status === "failed" && c.error) reasons.push(`${c.slot}: ${c.error}`);
        const left = ((r.json.remaining as string[]) ?? []).length;
        setMsg(`${made} of ${count} composed${failed ? `, ${failed} failed` : ""} — ${left} to go…`);
        complete = !!r.json.complete;
        if (complete) break;
        await load();
      }
      if (!complete) break;
    }
    const elapsed = Math.round((Date.now() - began) / 60000);
    setMsg(`${made} composed, ${failed} failed — ${elapsed || "<1"} min.${reasons.length ? ` ${reasons.slice(0, 3).join(" · ")}` : ""}`);
    await load();
  };

  const note = async (s: DeskSlot, kind: "comment" | "variation", text: string) => {
    if (s.unplanned) {
      // A rotation post has no plan slot to hold a note, but a variation is
      // still a request she expects acted on — route it through Rewrite.
      if (kind === "variation" && s.post) {
        const r = await call("note", "/api/admin/marketing/approve", { action: "regenerate", ids: [s.post.id], reason: text });
        const status = String(((r.json.outcomes as { status?: string }[] | undefined) ?? [])[0]?.status ?? "");
        if (r.ok) setMsg(status === "caption updated" ? "Done — the caption is updated. It is back in Ready to review." : `Sent back. ${status}`);
        await load();
      } else setMsg("This post came from the rotation, not the plan, so it has no place to keep a note — use Ask for a variation.");
      return;
    }
    setMsg(kind === "variation" ? "Working on it…" : null);
    const r = await call("note", "/api/admin/marketing/plan/slot", { id: s.id, action: kind, text });
    if (r.ok) {
      const a = r.json.applied as { done?: string; how?: string; why?: string } | undefined;
      setMsg(
        kind !== "variation"
          ? "Noted."
          : a?.done === "caption"
            ? a.how === "hashtags"
              ? "Done — hashtags added. It is back in Ready to review."
              : "Done — the caption is rewritten with your note. It is back in Ready to review."
            : a?.done === "composed"
              ? "Done — composed again with your note. It is back in Ready to review."
              : `Noted — ${a?.why ?? "it will be used on the next compose"}.`,
      );
    }
    await load();
  };

  const saveFrame = async (s: DeskSlot, crop: { zoom: number; x: number; y: number; sceneUrl?: string } | null) => {
    const r = await call("frame", "/api/admin/marketing/plan/slot", { id: s.id, action: "frame", crop });
    if (!r.ok) return;
    setMsg(crop ? "Frame saved — composing it now…" : "Framing reset — composing afresh…");
    await compose(s);
  };

  const publishNow = async () => {
    const r = await call("publish", "/api/admin/marketing/publish", {});
    if (r.ok) {
      const outcomes = (r.json.outcomes ?? []) as { status: string; reason?: string }[];
      const posted = outcomes.filter((o) => o.status === "published").length;
      const issues = outcomes.filter((o) => o.status !== "published").map((o) => o.reason).filter(Boolean);
      setMsg(`${posted} published. ${issues.join("; ") || (posted ? "" : "No approved posts are waiting for today.")}`);
    }
    await load();
  };

  const markPosted = async (s: DeskSlot, url: string) => {
    if (!s.post) return;
    const r = await call("posted", "/api/admin/marketing/approve", { action: "posted", ids: [s.post.id], url });
    if (r.ok) {
      const o = ((r.json.outcomes as { ok: boolean; error?: string }[] | undefined) ?? [])[0];
      setMsg(o?.ok ? "Recorded as posted — its numbers are tracked from here." : `Not recorded: ${o?.error ?? "unknown error"}`);
    }
    await load();
  };

  const importPlan = async (file: File) => {
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      setMsg("That file is not JSON.");
      return;
    }
    const r = await call("import", "/api/admin/marketing/plan/import", doc);
    if (r.ok) setMsg(`Plan "${r.json.key}" imported: ${r.json.inserted} added, ${r.json.updated} updated, ${r.json.skipped} kept as removed.`);
    await load();
  };

  // ── layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", fontFamily: "Inter, system-ui", padding: "28px 24px 80px", color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Marketing desk</h1>
          <div style={{ fontSize: 13, color: MIST, marginTop: 4 }}>
            {tab === "personal" ? "Your personal creative workspace for Instagram and LinkedIn." : <>What is planned, what it will look like, and what you have approved. Today is {longDay(today)}.</>}
          </div>
          {tab !== "personal" && <div style={{ fontSize: 13, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {needsYou.length === 0 ? (
              <span style={{ color: MIST }}>{data && outreach ? "Nothing needs you right now." : "Checking what needs you…"}</span>
            ) : (
              <>
                <b>Needs you:</b>
                {needsYou.map(([key, n, one, many]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    style={{ fontFamily: "inherit", fontSize: 13, padding: "3px 10px", borderRadius: 999, border: `1px solid ${tab === key ? INK : LINE}`, background: "#fff", cursor: "pointer", color: INK }}
                  >
                    {n} {n === 1 ? one : many}
                  </button>
                ))}
              </>
            )}
          </div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* The one-at-a-time queue (the morning brief links there): the same
              approval, a narrower window onto it. */}
          {tab !== "personal" && <a href="/admin/marketing/review" style={{ fontSize: 13, color: "#fff", background: "#1a7f37", textDecoration: "none", padding: "6px 12px", border: "1px solid #1a7f37", borderRadius: 999, fontWeight: 600 }}>
            Review one at a time{waiting.length ? ` (${waiting.length})` : ""}
          </a>}
          {tab !== "personal" && <a href="/admin/marketing/decisions" style={{ fontSize: 13, color: INK, textDecoration: "none", padding: "6px 12px", border: `1px solid ${LINE}`, borderRadius: 999 }}>
            Your decisions
          </a>}
          {tab !== "personal" && <a href="/admin/marketing/board-refresh" style={{ fontSize: 13, color: INK, textDecoration: "none", padding: "6px 12px", border: `1px solid ${LINE}`, borderRadius: 999 }}>
            Marketing review board
          </a>}
          {tab !== "personal" && <a href="/admin/marketing/guide" style={{ fontSize: 13, color: INK, textDecoration: "none", padding: "6px 12px", border: `1px solid ${LINE}`, borderRadius: 999 }}>
            What the numbers mean
          </a>}
          {tab !== "personal" && <Btn disabled={!!busy} onClick={publishNow}>{busy === "publish" ? "Publishing…" : "Publish approved now"}</Btn>}
          <Btn onClick={() => load()}>Refresh</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginTop: 20, borderBottom: `1px solid ${LINE}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            type="button"
            onClick={() => {
              setTab(t.key); setOpen(null); setMsg(null);
              const url = new URL(window.location.href); url.searchParams.set("tab", t.key);
              if (t.key !== "personal") url.searchParams.delete("channel");
              window.history.replaceState(null, "", url);
            }}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? INK : MIST,
              borderBottom: tab === t.key ? `2px solid ${INK}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {t.label}
            {t.key === "grid" && igWaiting.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: "#8250df", color: "#fff", borderRadius: 999, padding: "1px 7px" }}>{igWaiting.length}</span>
            )}
            {t.key === "linkedin" && liWaiting.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: "#0a66c2", color: "#fff", borderRadius: 999, padding: "1px 7px" }}>{liWaiting.length}</span>
            )}
            {t.key === "collabs" && collabWaiting.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: "#C2185B", color: "#fff", borderRadius: 999, padding: "1px 7px" }}>{collabWaiting.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab !== "personal" && error && <p style={{ color: "#cf222e", fontSize: 13 }}>{error}</p>}
      {tab !== "personal" && !!data?.reelSequence?.length && (
        <div role="alert" style={{ margin: "12px 0 0", padding: "10px 14px", border: "1px solid #A3211E", borderRadius: 8, borderLeftWidth: 4, background: "#FFFFFF", color: "#A3211E", fontSize: 13 }}>
          <strong>Reel sequence broken — these reels are held until fixed (nothing is reordered automatically):</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {data.reelSequence.map((v, i) => <li key={`${v.slot}-${i}`}>{v.line}</li>)}
          </ul>
        </div>
      )}
      {msg && (
        <p style={{ fontSize: 13, margin: "12px 0 0", padding: "8px 12px", background: "#f4f2ec", borderRadius: 8 }}>
          {msg}
        </p>
      )}
      {tab !== "personal" && !data && !error && <Empty>Loading the plan…</Empty>}

      {tab === "personal" && <PersonalTab slots={personalData?.slots ?? []} loading={!personalData} error={personalError} onReload={loadPersonal}
        renderSlot={(slot) => <Tile key={slot.id} slot={slot} today={today} onOpen={setOpen} />} />}

      {data && tab === "grid" && (
        <GridTab
          slots={slots}
          today={today}
          waiting={igWaiting}
          busy={busy}
          onOpen={setOpen}
          onApproveAll={() => approve(igWaiting)}
          onComposeAhead={composeAhead}
        />
      )}
      {data && tab === "linkedin" && (
        <LinkedInTab
          slots={slots}
          plans={data.plans}
          today={today}
          connected={!!status?.linkedin?.ok}
          connection={status?.linkedin?.detail ?? null}
          stats={data.channelStats ?? []}
          busy={busy}
          onOpen={setOpen}
          onApprove={(targets) => approve(targets)}
          onPosted={markPosted}
        />
      )}
      {data && tab === "calendar" && (
        <CalendarTab data={data} today={today} showRemoved={showRemoved} onToggleRemoved={() => setShowRemoved((v) => !v)} onOpen={setOpen} />
      )}
      {tab === "collabs" && <OutreachQueue rows={outreach} error={outreachError} onReload={loadOutreach} inbox={inboxStatus} />}
      {data && tab === "reels" && <ReelsTab reels={reels} today={today} onOpen={setOpen} />}
      {tab === "library" && <LibraryTab />}
      {data && tab === "stories" && <StoriesTab stories={stories} today={today} onOpen={setOpen} onPlay={(i) => setPlayer(i)} />}
      {data && tab === "ads" && <AdsTab slots={slots} paid={paid} status={status} today={today} onOpen={setOpen} />}
      {tab === "search" && <SearchTab search={search} />}
      {data && tab === "channels" && <ChannelsTab status={status} plans={data.plans} busy={busy} onImport={importPlan} />}

      {open && (
        <Drawer
          slot={open}
          today={today}
          busy={busy}
          onClose={() => setOpen(null)}
          onApprove={() => approve([open])}
          onRewrite={() => rewrite(open)}
          onReplaceStory={(file, title, line) => replaceStory(open, file, title, line)}
          onRebuildStory={(sourceUrl, title, line) => rebuildStory(open, sourceUrl, title, line)}
          onRebuildReel={(sceneUrls, title, sub) => rebuildReel(open, sceneUrls, title, sub)}
          onRemove={() => remove(open)}
          onRestore={() => restore(open)}
          onCompose={() => compose(open)}
          onNote={(kind, text) => note(open, kind, text)}
          onFrame={(crop) => saveFrame(open, crop)}
        />
      )}
      {player !== null && stories.length > 0 && (
        <StoryPlayer stories={stories} start={player} today={today} busy={busy !== null}
          onClose={() => setPlayer(null)} onOpen={(s) => { setPlayer(null); setOpen(s); }}
          onApprove={(s) => { void approve([s]); }}
          onCompose={(s) => { void compose(s); }} composingId={busy?.startsWith("compose:") ? busy.slice(8) : null} />
      )}
    </div>
  );
}

// ── Grid ────────────────────────────────────────────────────────────────────

function GridTab({
  slots,
  today,
  waiting,
  busy,
  onOpen,
  onApproveAll,
  onComposeAhead,
}: {
  slots: DeskSlot[];
  today: string;
  waiting: DeskSlot[];
  busy: string | null;
  onOpen: (s: DeskSlot) => void;
  onApproveAll: () => void;
  onComposeAhead: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "review" | "approved" | "posted">("all");
  const ordered = useMemo(() => gridOrder(slots), [slots]);
  const shown = ordered.filter((s) => {
    const st = stateLabel(s, today).state;
    if (filter === "review") return st === "review";
    if (filter === "approved") return st === "approved";
    if (filter === "posted") return st === "posted";
    return true;
  });
  const counts = {
    review: ordered.filter((s) => stateLabel(s, today).state === "review").length,
    approved: ordered.filter((s) => stateLabel(s, today).state === "approved").length,
    posted: ordered.filter((s) => stateLabel(s, today).state === "posted").length,
    planned: ordered.filter((s) => ["planned", "idea"].includes(stateLabel(s, today).state)).length,
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        {waiting.length > 0 ? (
          <>
            <b style={{ fontSize: 13 }}>{waiting.length} waiting for you</b>
            <Btn kind="primary" onClick={onApproveAll} disabled={busy !== null}>
              Approve all {waiting.length}
            </Btn>
            <span style={{ fontSize: 12, color: MIST }}>Each post goes out on its scheduled day — approving now does not post them today.</span>
          </>
        ) : (
          <span style={{ fontSize: 13, color: MIST }}>Nothing is waiting for you.</span>
        )}
        <span style={{ flex: 1 }} />
        <Btn onClick={onComposeAhead} disabled={busy !== null} title="Says how many posts and roughly how long, then composes them. Days you have approved are never touched.">
          {busy === "compose-ahead" ? "Composing…" : "Compose everything pending"}
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {(
          [
            ["all", `Everything (${ordered.length})`],
            ["review", `Ready to review (${counts.review})`],
            ["approved", `Approved (${counts.approved})`],
            ["posted", `Posted (${counts.posted})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${filter === k ? INK : LINE}`, background: filter === k ? INK : "#fff", color: filter === k ? "#fff" : INK, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            {label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: MIST, alignSelf: "center", marginLeft: 6 }}>
          {counts.planned} planned and not composed yet — they show the catalogue picture.
        </span>
      </div>

      {/* The profile, as Instagram lays it out. */}
      <div style={{ maxWidth: 640, margin: "0 auto", border: `1px solid ${LINE}`, borderRadius: 18, background: "#fff", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 22px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>z.</div>
          <div>
            <div style={{ fontWeight: 700 }}>zyvorah.</div>
            <div style={{ fontSize: 12, color: MIST }}>
              {counts.posted} posted · {counts.approved} approved · {counts.review} to review · {counts.planned} planned
            </div>
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty>Nothing here for this filter.</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, background: LINE }}>
            {shown.map((s) => (
              <Tile key={s.id} slot={s} today={today} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: MIST, textAlign: "center", marginTop: 10 }}>
        Newest at the top left, the way the profile reads. Every tile uses the same portrait crop; open a post to review its complete creative. A three-day arc (wall → detail → word) lands as one row when it starts on a row boundary.
      </p>
    </div>
  );
}

function Tile({ slot, today, onOpen, aspect = "4/5" }: { slot: DeskSlot; today: string; onOpen: (s: DeskSlot) => void; aspect?: string }) {
  const img = tileImage(slot);
  const native = typeof slot.art?.full_bleed_policy === "string";
  const st = stateLabel(slot, today);
  const dim = st.state === "planned" || st.state === "idea" || st.state === "missed";
  // A full-source review policy belongs to the drawer, not the profile grid.
  // Landscape source previews must keep the same portrait tile as every post.
  return (
    <div role="button" tabIndex={0} aria-label={shortTitle(slot) || "Open creative"} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(slot); } }} onClick={() => onOpen(slot)} style={{ position: "relative", aspectRatio: aspect, minWidth: 0, background: "#f4f2ec", cursor: "pointer", overflow: "hidden" }} title={`${slot.art?.unscheduled ? "Unscheduled idea" : longDay(slot.day_key)} · ${shortTitle(slot)}`}>
      {img.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "bottom", opacity: dim && !native ? 0.55 : 1, filter: dim && !native ? "grayscale(0.25)" : undefined }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: MIST, fontSize: 12, padding: 10, textAlign: "center" }}>
          {shortTitle(slot) || "no picture"}
        </div>
      )}
      {dim && <div style={{ position: "absolute", inset: 6, border: "1.5px dashed rgba(15,15,15,0.5)", borderRadius: 6, pointerEvents: "none" }} />}
      <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4 }}>
        {slot.beat && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>{BEAT_LABEL[slot.beat] ?? slot.beat.toUpperCase()}</span>}
        {/* The kind from the PLAN, not just the composed post — a planned reel
            or carousel must read as one before it is composed, or the calendar
            looks like a wall of single stills (founder, 25 Sep 2026). */}
        {(slot.post?.format === "reel" || slot.kind === "reel") && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>REEL</span>}
        {(slot.post?.format === "carousel" || slot.kind === "carousel") && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>SWIPE</span>}
        {slot.unplanned && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>ROTATION</span>}
      </div>
      <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.8)", fontWeight: 600 }}>{slot.art?.unscheduled ? "Unscheduled" : shortDay(slot.day_key)}</span>
        <Pill label={st.label} colour={st.colour} bg={st.bg} style={{ fontSize: 10 }} />
      </div>
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────

function CalendarTab({
  data,
  today,
  showRemoved,
  onToggleRemoved,
  onOpen,
}: {
  data: PlanResponse;
  today: string;
  showRemoved: boolean;
  onToggleRemoved: () => void;
  onOpen: (s: DeskSlot) => void;
}) {
  const live = data.plans.filter((p) => p.status === "live" && p.window_end >= today && !p.key.startsWith("paid-"));
  const drafts = data.plans.filter((p) => p.status === "draft");
  const from = today < data.from ? data.from : addDaysStr(today, -7);
  const weeks = useMemo(() => weeksBetween(data.slots, from, data.to), [data.slots, from, data.to]);
  const monthsSeen = new Set<string>();

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      {live.map((p) => (
        <PlanCard key={p.key} plan={p} />
      ))}
      {drafts.map((p) => (
        <PlanCard key={p.key} plan={p} draft />
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Day by day</Kicker>
        <label style={{ fontSize: 12, color: MIST, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={showRemoved} onChange={onToggleRemoved} /> show removed{!showRemoved && data.removedCount ? ` (${data.removedCount})` : ""}
        </label>
      </div>
      {weeks.map((w) => {
        const month = monthOf(w.start);
        const header = !monthsSeen.has(month);
        monthsSeen.add(month);
        const anything = w.days.some((d) => d.slots.length);
        return (
          <div key={w.start}>
            {header && <div style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 8px" }}>{month}</div>}
            <Card style={{ padding: 0, overflow: "hidden", opacity: anything ? 1 : 0.7 }}>
              <div style={{ padding: "8px 14px", fontSize: 12, color: MIST, borderBottom: `1px solid ${LINE}`, background: "#fafaf8" }}>
                Week of {shortDay(w.start)}{!anything ? " — nothing planned" : ""}
              </div>
              {w.days.map((d) => (
                <div key={d.day} style={{ display: "flex", gap: 12, padding: "8px 14px", borderBottom: `1px solid ${LINE}`, alignItems: "center", background: d.day === today ? "#fffbe6" : undefined }}>
                  <div style={{ width: 84, fontSize: 12, color: d.day < today ? MIST : INK, fontWeight: d.day === today ? 700 : 500 }}>{longDay(d.day)}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    {d.slots.length === 0 && <span style={{ fontSize: 12, color: "#bbb" }}>—</span>}
                    {d.slots.map((s) => (
                      <DayChip key={s.id} slot={s} today={today} onOpen={onOpen} />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function addDaysStr(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function PlanCard({ plan, draft }: { plan: MarketingPlan; draft?: boolean }) {
  const [openWeeks, setOpenWeeks] = useState(!draft);
  return (
    <Card style={{ borderStyle: draft ? "dashed" : "solid" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <Kicker>{draft ? "Draft — ideas only, nothing composes from this" : `Strategy · ${shortDay(plan.window_start)} → ${shortDay(plan.window_end)}`}</Kicker>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{plan.name}</div>
        </div>
        <button type="button" onClick={() => setOpenWeeks((v) => !v)} style={{ background: "none", border: "none", color: MIST, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {openWeeks ? "hide the weeks" : `show the ${(plan.weeks ?? []).length} weeks`}
        </button>
      </div>
      {plan.big_idea && <p style={{ fontSize: 13, lineHeight: 1.55, margin: "10px 0 0" }}>{plan.big_idea}</p>}
      {plan.grid_system && <p style={{ fontSize: 12, color: MIST, lineHeight: 1.5, margin: "6px 0 0" }}>{plan.grid_system}</p>}
      {openWeeks && (plan.weeks ?? []).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginTop: 14 }}>
          {(plan.weeks as PlanWeek[]).map((w) => (
            <div key={w.week} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: MIST }}>Week {w.week} · {w.dates}</div>
              <div style={{ fontSize: 13, fontWeight: 700, margin: "3px 0" }}>{w.theme}</div>
              <div style={{ fontSize: 12, color: "#3f3f3f", lineHeight: 1.45 }}>{w.goal}</div>
            </div>
          ))}
        </div>
      )}
      {plan.source && <div style={{ fontSize: 11, color: "#999", marginTop: 10 }}>Source: {plan.source}</div>}
    </Card>
  );
}

function DayChip({ slot, today, onOpen }: { slot: DeskSlot; today: string; onOpen: (s: DeskSlot) => void }) {
  const img = tileImage(slot);
  const st = stateLabel(slot, today);
  const isStory = slot.kind === "story";
  return (
    <div onClick={() => onOpen(slot)} style={{ display: "flex", gap: 8, alignItems: "center", border: `1px solid ${LINE}`, borderRadius: 10, padding: 4, paddingRight: 10, cursor: "pointer", background: "#fff", opacity: slot.status === "removed" ? 0.5 : 1 }}>
      <div style={{ width: isStory ? 34 : 44, height: 54, borderRadius: 6, overflow: "hidden", background: "#f4f2ec", flex: "0 0 auto" }}>
        {img.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: img.composed ? 1 : 0.6 }} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: MIST }}>
          {CHANNEL_LABEL[slot.channel] ?? slot.channel} · {slot.beat ? BEAT_LABEL[slot.beat] : slot.kind}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{shortTitle(slot) || slot.handle}</div>
        <Pill label={slot.status === "removed" ? "removed" : st.label} colour={st.colour} bg={st.bg} style={{ fontSize: 10, marginTop: 2 }} />
      </div>
    </div>
  );
}

// ── Reels ────────────────────────────────────────────────────────────────────
//
// The Reels rail: one a day (the founder's cadence, 26 Sep 2026), played
// where a follower plays them. Most post OFF the grid — the grid carries a
// reel only every fourth post, and those wear the ON THE GRID mark here.

function ReelsTab({ reels, today, onOpen }: { reels: DeskSlot[]; today: string; onOpen: (s: DeskSlot) => void }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, color: MIST, marginBottom: 14 }}>
        {reels.length} reels on the plan — one a day. Most play from the Reels tab only; every fourth day&apos;s reel also lands on the grid, marked here.
      </div>
      {reels.length === 0 ? (
        <Empty>No reels planned in this range — open the desk tomorrow or press “Compose everything pending”.</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
          {reels.map((s) => {
            const st = stateLabel(s, today);
            const img = tileImage(s);
            const onGrid = s.post ? s.post.share_to_feed !== false : undefined;
            return (
              <div key={s.id} style={{ display: "grid", gap: 6, minWidth: 0 }}>
                <div role="button" tabIndex={0} aria-label={`Open ${shortTitle(s)}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(s); } }} onClick={() => onOpen(s)} style={{ position: "relative", aspectRatio: "9/16", borderRadius: 14, overflow: "hidden", background: "#1b1a18", cursor: "pointer", border: `1px solid ${LINE}` }}>
                  {img.src && (
                    // The cover is the 4:5 grid frame, the card is the 9:16
                    // Reel: shown whole over a blurred copy of itself, so the
                    // title and mark on the cover are never cropped off (they
                    // were — "ka — Eent" for "Ikka — Eent", 29 Sep 2026).
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt="" aria-hidden loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(18px) brightness(0.7)", transform: "scale(1.15)" }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: img.composed ? 1 : 0.55 }} />
                    </>
                  )}
                  {!img.composed && <div style={{ position: "absolute", inset: 6, border: "1.5px dashed rgba(255,255,255,0.6)", borderRadius: 10 }} />}
                  <div style={{ position: "absolute", top: 8, left: 8, fontSize: 11, color: "#fff", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{shortDay(s.day_key)}</div>
                  {onGrid && (
                    <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>ON THE GRID</span>
                  )}
                  <div style={{ position: "absolute", bottom: 8, right: 10, color: "#fff", fontSize: 16, textShadow: "0 1px 3px #000" }}>▶</div>
                </div>
                <div title={shortTitle(s)} style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortTitle(s)}</div>
                <Pill label={st.label} colour={st.colour} bg={st.bg} style={{ fontSize: 10, justifySelf: "start", maxWidth: "100%", whiteSpace: "normal" }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stories ──────────────────────────────────────────────────────────────────

function StoriesTab({ stories, today, onOpen, onPlay }: { stories: DeskSlot[]; today: string; onOpen: (s: DeskSlot) => void; onPlay: (i: number) => void }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Btn kind="dark" onClick={() => onPlay(0)} disabled={!stories.length}>
          ▶ Play the Stories in order
        </Btn>
        <span style={{ fontSize: 12, color: MIST }}>
          {stories.length} Stories on the plan. Open an item to review its exact image or video before approving.
        </span>
      </div>
      {stories.length === 0 ? (
        <Empty>No Stories planned in this range.</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {stories.map((s, i) => {
            const st = stateLabel(s, today);
            const img = tileImage(s);
            return (
              <div key={s.id} style={{ display: "grid", gap: 6 }}>
                <div onClick={() => onPlay(i)} style={{ position: "relative", aspectRatio: "9/16", borderRadius: 14, overflow: "hidden", background: "#f4f2ec", cursor: "pointer", border: `1px solid ${LINE}` }}>
                  {img.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: img.composed ? 1 : 0.55 }} />
                  )}
                  {!img.composed && <div style={{ position: "absolute", inset: 6, border: "1.5px dashed rgba(15,15,15,0.5)", borderRadius: 10 }} />}
                  {img.video && <div style={{ position: "absolute", top: 28, right: 8, color: "#fff", fontSize: 11, textShadow: "0 1px 3px #000" }}>▶ VIDEO</div>}
                  <div style={{ position: "absolute", top: 8, left: 8, fontSize: 11, color: "#fff", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{shortDay(s.day_key)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortTitle(s)}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                  <Pill label={st.label} colour={st.colour} bg={st.bg} style={{ fontSize: 10 }} />
                  <button type="button" onClick={() => onOpen(s)} style={{ background: "none", border: "none", color: MIST, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Ads ──────────────────────────────────────────────────────────────────────

function AdsTab({ slots, paid, status, today, onOpen }: { slots: DeskSlot[]; paid: Paid; status: Status; today: string; onOpen: (s: DeskSlot) => void }) {
  const byChannel = useMemo(() => adsByChannel(slots), [slots]);
  const order = [...new Set(["google", "youtube", "meta", "chatgpt", "linkedin", ...byChannel.keys()])];
  const [span, setSpan] = useState<"week" | "today">("week");
  const rows = span === "today" ? (paid?.today?.channels ?? []) : (paid?.week ?? []);
  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Kicker>
            {span === "today"
              ? `Paid channels · today so far${paid?.today?.date ? ` (${paid.today.date})` : ""}`
              : `Paid channels · last 7 days${paid?.date ? ` to ${paid.date}` : ""}`}
          </Kicker>
          {paid?.today && (
            <div role="tablist" style={{ display: "flex", gap: 4 }}>
              {(["week", "today"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={span === k}
                  onClick={() => setSpan(k)}
                  style={{ minHeight: 32, padding: "4px 12px", borderRadius: 999, border: `1px solid ${LINE}`, background: span === k ? "#2D2D2D" : "transparent", color: span === k ? "#fff" : "#2D2D2D", fontSize: 12, fontFamily: "inherit" }}
                >
                  {k === "week" ? "Last 7 days" : "Today so far"}
                </button>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: MIST }}>These are tracking events, not reconciled customer orders. Samples and historical internal tests may be included. A dash means spend is unavailable or zero in this import; it does not prove no platform spend. Verify customer payments in All orders and ChatGPT spend in Ads Manager.{span === "today" ? " Today is incomplete: Google Analytics and the ad platforms catch up through the day." : ""}</p>
        {paid && !paid.gaConfigured && <p role="status">Google Analytics is not configured. Available platform figures are shown; website landings and purchase attribution are unavailable.</p>}
        {!paid ? (
          <Empty>Paid figures are loading or unavailable. Use the account panels below to check current status.</Empty>
        ) : rows.length === 0 ? (
          <Empty>{span === "today" ? "No paid traffic recorded yet today." : "No paid traffic recorded in the last seven days."}</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: MIST }}>
                {["Channel / campaign", "Imported spend", "Imported clicks", "Landings", "CPC", "Tracked purchases", "Cost / tracked purchase"].map((h, i) => (
                  <th key={h} style={{ padding: "4px 6px", fontWeight: 500, textAlign: i ? "right" : "left", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((c) => [
                <tr key={c.key}>
                  <td style={{ padding: "6px", fontWeight: 600 }}>{c.label}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{c.spend ? inr(c.spend) : "—"}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{c.clicks.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{c.sessions.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{c.cpc == null ? "—" : `₹${c.cpc.toFixed(2)}`}</td>
                  <td style={{ padding: "6px", textAlign: "right", color: c.spend > 0 && c.purchases === 0 ? "#cf222e" : undefined }}>{c.purchases}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{c.spend > 0 && c.purchases > 0 ? inr(c.costPerPurchase) : "—"}</td>
                </tr>,
                ...(c.note
                  ? [
                      <tr key={`${c.key}:note`}>
                        <td colSpan={7} style={{ padding: "0 6px 6px 18px", fontSize: 11, color: MIST }}>{c.note}</td>
                      </tr>,
                    ]
                  : []),
                ...c.campaigns.map((cam) => (
                  <tr key={`${c.key}:${cam.name}`} style={{ color: MIST }}>
                    <td style={{ padding: "3px 6px 3px 18px" }}>{cam.name}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.spend ? inr(cam.spend) : "—"}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.clicks.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.sessions.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.cpc == null ? "—" : `₹${cam.cpc.toFixed(2)}`}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.purchases}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{cam.spend > 0 && cam.purchases > 0 ? inr(cam.spend / cam.purchases) : "—"}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          </div>
        )}
        {paid && [...paid.verdicts, ...paid.flags].length > 0 && (
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "#3f3f3f", lineHeight: 1.6 }}>
            {paid.verdicts.map((v, i) => <li key={`v${i}`}>{v}</li>)}
            {paid.flags.map((f, i) => <li key={`f${i}`} style={{ color: "#9a6700" }}>{f}</li>)}
          </ul>
        )}
        {status?.budget && (
          <div style={{ marginTop: 10, fontSize: 12, color: MIST, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
            Engine ad budget: <b style={{ color: status.budget.active ? "#1a7f37" : "#cf222e" }}>{status.budget.active ? "active" : "paused"}</b> · weekly cap {inr(status.budget.weekly_cap)} · spent {inr(status.budget.spent_this_week)} · per campaign {inr(status.budget.per_campaign_cap)}
          </div>
        )}
      </Card>

      <CustomerAudiencePanel />
      <GoogleAdsPanel />
      <MetaAdsPanel />
      <ReelBoostPanel />
      <MetaRetargetPanel />

      {order.map((ch) => {
        const list = byChannel.get(ch) ?? [];
        return (
          <div key={ch}>
            <Kicker>{CHANNEL_LABEL[ch] ?? ch}</Kicker>
            {list.length === 0 ? (
              <Empty>Nothing on file for {CHANNEL_LABEL[ch] ?? ch}.</Empty>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {list.map((s) => (
                  <AdCard key={s.id} slot={s} today={today} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: MIST }}>
        An ad here is a creative you can comment on and ask a variation of. Copy that is not on file is left blank rather than guessed — paste it in from the platform when you review it.
      </p>
    </div>
  );
}

function AdCard({ slot, today, onOpen }: { slot: DeskSlot; today: string; onOpen: (s: DeskSlot) => void }) {
  const art = slot.art ?? {};
  const state = String(art.status ?? "");
  const img = (art.image_url as string | undefined) ?? slot.preview ?? null;
  const video = art.video_url as string | undefined;
  const colour = state === "paused" ? "#cf222e" : state.startsWith("live") ? "#1a7f37" : "#57606a";
  const variations = (slot.comments ?? []).filter((c) => c.kind === "variation").length;
  void today;
  return (
    <Card style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}>
      <div className="cursor-pointer" onClick={() => onOpen(slot)}>
        {/* An ad creative is reviewed here too, so it is letterboxed whole
            rather than cropped to the card's shape — the card must not decide
            what of the artwork the founder gets to see. */}
        {video ? (
          <video src={video} controls muted playsInline style={{ width: "100%", aspectRatio: "16/9", background: "#11100e", objectFit: "contain" }} />
        ) : img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "16/9", objectFit: "contain", background: "#11100e" }} />
        ) : (
          <div style={{ aspectRatio: "16/9", background: "#f4f2ec", display: "flex", alignItems: "center", justifyContent: "center", color: MIST, fontSize: 12 }}>no creative on file</div>
        )}
        <div style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{slot.title}</div>
            {state && <Pill label={state} colour={colour} bg="#f4f2ec" />}
          </div>
          {slot.hook && <div style={{ fontSize: 12, color: "#3f3f3f", marginTop: 6, lineHeight: 1.5 }}>{slot.hook}</div>}
          {slot.caption && <div style={{ fontSize: 12, color: MIST, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 80, overflow: "hidden" }}>{slot.caption}</div>}
          <div style={{ fontSize: 11, color: MIST, marginTop: 8 }}>
            since {shortDay(slot.day_key)} · {(slot.comments ?? []).length} notes{variations ? ` · ${variations} variation${variations > 1 ? "s" : ""} asked` : ""}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Channels ─────────────────────────────────────────────────────────────────

/* ── Search: the words people typed ─────────────────────────────────────── */

/** Search Console is not answering. Say which of the several possible reasons
 *  it is, and show the exact address that has to be granted access — that
 *  string is the whole fix in the commonest case, and hunting for it in a Cloud
 *  console is the reason this kind of integration sits broken for weeks. */
function SearchNotWorking({ search }: { search: NonNullable<SearchData> }) {
  const d = search.diagnosis;
  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      <Card>
        <Kicker>Search Console is not answering yet</Kicker>
        <p style={{ fontSize: 14, lineHeight: 1.65, margin: "4px 0 0", color: INK }}>
          {d?.likelyCause ?? "The property is visible but the query failed."}
        </p>
        {/* Google puts the exact console URL in its own error when an API is
            switched off. Surfacing it turns a paragraph of instructions into
            one click, which is the difference between this being fixed today
            and sitting broken. */}
        {enableUrl(d?.sitesError) && (
          <p style={{ margin: "12px 0 0" }}>
            <a
              href={enableUrl(d?.sitesError)!}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "9px 18px",
                borderRadius: 999,
                background: INK,
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Enable it in Google Cloud
            </a>
          </p>
        )}
        <p style={{ fontSize: 12.5, color: MIST, lineHeight: 1.6, margin: "10px 0 0" }}>
          Nothing is shown rather than shown as zero. A zero here would say nobody found us on Google, which
          is a very different thing. Once this is fixed the numbers appear on their own — nothing needs
          redeploying.
        </p>
      </Card>

      {d && (
        <Card>
          <Kicker>What to check</Kicker>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div>
              Account asking:{" "}
              <code style={{ fontSize: 12.5, background: PAPER, padding: "2px 6px", borderRadius: 6 }}>
                {d.serviceAccount ?? "not configured"}
              </code>
            </div>
            <div>Google issued a token: {d.tokenMinted ? "yes" : "no"}</div>
            <div>
              Property list answered: {d.sitesStatus == null ? "no answer" : d.sitesStatus}
              {d.sites.length ? ` · ${d.sites.length} visible` : " · none visible"}
            </div>
            {d.pinned && <div>Pinned property: {d.pinned}</div>}
            {d.sites.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {d.sites.map((s) => (
                  <div key={s.siteUrl} style={{ color: MIST }}>
                    {s.siteUrl} — {s.permissionLevel}
                  </div>
                ))}
              </div>
            )}
          </div>
          {d.sitesError && (
            <pre
              style={{
                marginTop: 12,
                padding: 10,
                background: PAPER,
                borderRadius: 8,
                fontSize: 11.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                color: MIST,
                overflowX: "auto",
              }}
            >
              {d.sitesError}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}

/** Search Console, which is the only place these words exist. Analytics can say
 *  a visit came from Google; it cannot say what was searched for.
 *
 *  Impressions sit beside clicks on purpose. A term shown often and clicked
 *  rarely is a listing problem — Google is already offering us and people are
 *  choosing someone else, which is fixed by rewriting a title. A term ranked
 *  well with few impressions is just a rare search, and no amount of rewriting
 *  helps. Clicks alone cannot tell those apart. */
function SearchTab({ search }: { search: SearchData }) {
  if (!search) return <Empty>Reading Search Console…</Empty>;
  if (!search.configured) {
    return (
      <div style={{ marginTop: 20 }}>
        <Card>
          <Kicker>Not connected</Kicker>
          <Empty>The Google service account is not configured, so no search data can be read.</Empty>
        </Card>
      </div>
    );
  }
  const w = search.window;
  if (!w) return <SearchNotWorking search={search} />;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const row = (r: SearchRow, i: number, label: (k: string) => string) => (
    <tr key={`${r.key}-${i}`} style={{ borderTop: `1px solid ${LINE}` }}>
      <td style={{ padding: "7px 8px 7px 0", fontSize: 13 }}>{label(r.key)}</td>
      <td style={{ padding: "7px 8px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{r.clicks}</td>
      <td style={{ padding: "7px 8px", fontSize: 13, textAlign: "right", color: MIST }}>{r.impressions}</td>
      <td style={{ padding: "7px 8px", fontSize: 13, textAlign: "right", color: MIST }}>{pct(r.ctr)}</td>
      <td style={{ padding: "7px 0 7px 8px", fontSize: 13, textAlign: "right", color: MIST }}>{r.position.toFixed(1)}</td>
    </tr>
  );
  const head = (
    <tr>
      <th style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, padding: "0 8px 6px 0" }}>Term</th>
      <th style={{ textAlign: "right", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, padding: "0 8px 6px" }}>Clicks</th>
      <th style={{ textAlign: "right", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, padding: "0 8px 6px" }}>Shown</th>
      <th style={{ textAlign: "right", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, padding: "0 8px 6px" }}>Chosen</th>
      <th style={{ textAlign: "right", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, padding: "0 0 6px 8px" }}>Rank</th>
    </tr>
  );

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      <Card>
        <Kicker>
          {w.from} to {w.to} · {search.site}
        </Kicker>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>{w.clicks}</div>
            <div style={{ fontSize: 12, color: MIST }}>visits from Google</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>{w.impressions}</div>
            <div style={{ fontSize: 12, color: MIST }}>times we were shown</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>{pct(w.ctr)}</div>
            <div style={{ fontSize: 12, color: MIST }}>chosen when shown</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>{w.position.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: MIST }}>average rank (1 is the top)</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: MIST, lineHeight: 1.6, margin: "12px 0 0" }}>
          Google settles this data two to three days late, so the window ends {w.to} rather than yesterday. A
          fresher window would under-report and read as a fall that did not happen.
        </p>
      </Card>

      <Card>
        <Kicker>What people typed</Kicker>
        {w.queries.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>{head}</thead>
            <tbody>{w.queries.map((r, i) => row(r, i, (k) => `“${k}”`))}</tbody>
          </table>
        ) : (
          <Empty>Google recorded no searches that reached us in this window.</Empty>
        )}
        <p style={{ fontSize: 12, color: MIST, lineHeight: 1.6, margin: "12px 0 0" }}>
          Shown often and chosen rarely is a listing problem: Google is already offering us and people pick
          someone else, which is fixed by rewriting the page title and description. Ranked well but shown
          rarely is simply a rare search, and rewriting will not help it.
        </p>
      </Card>

      <Card>
        <Kicker>Which pages Google sends them to</Kicker>
        {w.pages.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>{head}</thead>
            <tbody>
              {w.pages.map((r, i) =>
                row(r, i, (k) => {
                  try {
                    return new URL(k).pathname || "/";
                  } catch {
                    return k;
                  }
                }),
              )}
            </tbody>
          </table>
        ) : (
          <Empty>No pages recorded in this window.</Empty>
        )}
      </Card>
    </div>
  );
}

function ChannelsTab({ status, plans, busy, onImport }: { status: Status; plans: MarketingPlan[]; busy: string | null; onImport: (f: File) => void }) {
  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      <Card>
        <Kicker>Connections — what is live, what is waiting</Kicker>
        {!status ? (
          <Empty>Checking…</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {status.setup.filter((s) => s.kind !== "choice").map((s) => (
              <div key={s.key} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
                <span style={{ color: s.ready ? "#1a7f37" : "#9a6700", fontWeight: 700 }}>{s.ready ? "●" : "○"}</span>
                <span>
                  <b>{s.key}</b> — <span style={{ color: MIST }}>{s.note}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* The switches. These are not gaps to be closed — each has a safe
          setting and a faster one, and the safe setting is a finished state.
          Drawn as ON/OFF rather than the ●/○ used for connections, because an
          open circle beside "campaigns go live immediately" invites someone to
          tick it without reading what it costs. */}
      {status && status.setup.some((s) => s.kind === "choice") && (
        <Card>
          <Kicker>Your switches — how much the engine does without asking</Kicker>
          <div style={{ display: "grid", gap: 12 }}>
            {status.setup.filter((s) => s.kind === "choice").map((s) => (
              <div key={s.key} style={{ fontSize: 13, display: "flex", gap: 12, alignItems: "flex-start", lineHeight: 1.55 }}>
                <span
                  style={{
                    flex: "0 0 auto", marginTop: 1, padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    letterSpacing: 0.4, minWidth: 40, textAlign: "center",
                    color: s.ready ? "#1a7f37" : "#3f3f3f",
                    background: s.ready ? "#e6f4ea" : "#f1f1ef",
                    border: `1px solid ${s.ready ? "#b7e1c4" : "#e0e0dc"}`,
                  }}
                >
                  {s.ready ? "ON" : "OFF"}
                </span>
                <span>
                  <b>{s.key}</b>
                  <div style={{ color: MIST, fontSize: 12, marginTop: 2 }}>{s.note}</div>
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: MIST, margin: "12px 0 0" }}>
            Neither switch can post or spend on its own: an ad still needs a decision you approved, and every rupee still passes the weekly and per-campaign caps the database enforces.
          </p>
        </Card>
      )}

      <Card>
        <Kicker>How posting works</Kicker>
        <ol style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
          <li>The plan says what posts on which day (Calendar). Nothing composes on its own: press <strong>Compose everything pending</strong> and it tells you how many posts and roughly how long before it starts. Days you have already approved are never touched.</li>
          <li>You look at the frame and the copy (Grid / Stories), and approve, rewrite, or remove. Removed vanishes and is never composed again.</li>
          <li>Each approved post goes out on its own day: Instagram at 11:30 IST, LinkedIn at {LINKEDIN_POST_TIME_IST} IST. Nothing posts without your approval — and nothing you approved is changed afterwards; if the copy or picture changed, it is held.</li>
        </ol>
      </Card>

      <Card>
        <Kicker>Bring in a strategy</Kicker>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>
          A strategy is a JSON plan document — the shape Astra wrote on 22 Sep — with the big idea, the weeks, and one entry per post (date, design, beat, copy, brief). Import it here, or from a terminal session with <code style={{ fontSize: 12 }}>scripts/marketing-plan-import.ts</code>. Re-importing updates copy and briefs and keeps what you removed. The format is written down in <code style={{ fontSize: 12 }}>docs/marketing-desk.md</code>.
        </p>
        <label style={{ display: "inline-block" }}>
          <span style={{ padding: "7px 15px", borderRadius: 999, background: INK, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {busy === "import" ? "Importing…" : "Import a plan (JSON)"}
          </span>
          <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = ""; }} />
        </label>
        <div style={{ marginTop: 14, fontSize: 12, color: MIST }}>
          Plans on file: {plans.map((p) => `${p.name} (${p.status})`).join(" · ") || "none"}
        </div>
      </Card>
    </div>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({
  slot,
  today,
  busy,
  onClose,
  onApprove,
  onRewrite,
  onReplaceStory,
  onRebuildStory,
  onRebuildReel,
  onRemove,
  onRestore,
  onCompose,
  onNote,
  onFrame,
}: {
  slot: DeskSlot;
  today: string;
  busy: string | null;
  onClose: () => void;
  onApprove: () => void;
  onRewrite: () => void;
  onReplaceStory: (file: File, title: string, line: string) => void;
  onRebuildStory: (sourceUrl: string, title: string, line: string) => void;
  onRebuildReel: (sceneUrls: string[], title: string, sub: string) => void;
  onRemove: () => void;
  onRestore: () => void;
  onCompose: () => void;
  onNote: (kind: "comment" | "variation", text: string) => void;
  onFrame: (crop: { zoom: number; x: number; y: number; sceneUrl?: string } | null) => void;
}) {
  const [text, setText] = useState("");
  // The desk's preview comes from the product-image rows. A guessed scene-01
  // path fails for designs such as Chuna and Resha, whose scenes live elsewhere.
  const [storySource, setStorySource] = useState(
    typeof slot.art?.source_image === "string" ? slot.art.source_image :
      slot.preview?.startsWith("https://zyvorah.com/media/product-images/") ? slot.preview : "",
  );
  const [storyTitle, setStoryTitle] = useState(slot.title ?? slot.handle?.replace(/^taash-/, "") ?? "");
  const [storyLine, setStoryLine] = useState(slot.hook ?? "");
  const [reelScenes, setReelScenes] = useState("");
  const [reelTitle, setReelTitle] = useState(slot.title ?? "");
  const [reelSub, setReelSub] = useState("sized to your wall");
  const st = stateLabel(slot, today);
  const p = slot.post;
  const img = tileImage(slot);
  const isStory = slot.kind === "story";
  const native = typeof slot.art?.full_bleed_policy === "string";
  const previewVideo = reviewVideo(slot);
  const hold = p?.status === "published" ? null : p?.review_hold || slot.design_sequence_error || productionHold(slot);
  const isAd = slot.kind === "ad";
  const personal = isPersonalPlan(slot.plan_key);
  const canApprove = !personal && awaitingReview(slot);
  // A headline that is a working note (frame-text.ts) is refused everywhere.
  const frameNote = personal || slot.unplanned ? null : slotFrameTextProblem(slot);
  const composedButNotPostable = !!p && (p.status === "failed" || (p.status === "queued" && !p.safety_passed));
  const canCompose =
    !personal && !isAd && !hold &&
    !slot.unplanned &&
    slot.status !== "removed" &&
    (slot.status !== "idea" || preparedCarouselIdea(slot) || composableIdea(slot)) &&
    (!p || composedButNotPostable || !!p.regenerate_requested_at || p.status === "skipped");
  const composing = busy === `compose:${slot.id}`;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,0.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100vw)", background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-12px 0 40px rgba(0,0,0,0.18)", fontFamily: "Inter, system-ui" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: `1px solid ${LINE}`, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
          <div style={{ fontSize: 12, color: MIST }}>
            {personal && slot.art?.unscheduled ? "Unscheduled idea" : longDay(slot.day_key)} · {CHANNEL_LABEL[slot.channel] ?? slot.channel} · {slot.beat ? BEAT_LABEL[slot.beat] : slot.kind}
          </div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }} aria-label="close">×</button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{slot.title ?? slot.handle}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <Pill label={slot.status === "removed" ? "removed" : st.label} colour={st.colour} bg={st.bg} />
              {slot.collection && <span style={{ fontSize: 12, color: MIST }}>{slot.collection}</span>}
              {slot.price && <span style={{ fontSize: 12, color: MIST }}>{slot.price}</span>}
              {slot.handle && (
                <a href={`/products/${slot.handle}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: MIST }}>
                  @{slot.handle}
                </a>
              )}
            </div>
          </div>

          {isStory && slot.channel === "instagram" && <StoryLink slot={slot} />}

          {slot.kind === "reel" && typeof slot.art?.reel_cover_url === "string" && <figure style={{margin:0}}>
            <figcaption style={{fontSize:12,marginBottom:8}}>Profile cover · 4:5 crop · aligned to the feed grid</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p?.thumbnail_url ?? slot.art.reel_cover_url} alt="Measured Reel profile cover" style={{display:"block",width:240,maxWidth:"100%",aspectRatio:"4/5",objectFit:"cover"}} />
            <p style={{fontSize:12}}>Full-screen film below · 9:16 playback safe area</p>
          </figure>}
          {/* The frame.
              NEVER CROPPED. This showed reels and stills with object-fit:
              cover, so the review pane cut the very edges of the thing being
              approved — on 26 Sep 2026 a reel's own title read "aash, in three
              oves" and the wordmark "YORAH · TAASH", because the frame's left
              edge was outside the box. Approving a picture you have not seen
              all of is the one thing this pane must not allow, so every
              creative is letterboxed whole, at its own aspect, capped to a
              height that fits on screen. */}
          <div style={{ background: native ? "transparent" : "#11100e", borderRadius: 14, overflow: "hidden", position: "relative", display: "flex", justifyContent: "center" }}>
            {previewVideo ? (
              <video src={previewVideo} controls preload="metadata" playsInline poster={slot.art?.reel_cover_url ? undefined : img.src ?? undefined} style={{ width: "auto", maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }} />
            ) : (p?.format === "reel" || (p?.format === "story" && /\.mp4(?:\?|$)|\.mov(?:\?|$)/i.test(p.media_urls?.[0] ?? ""))) && p.media_urls?.[0] ? (
              <video src={p.media_urls[0]} controls muted playsInline poster={p.thumbnail_url ?? undefined} style={{ width: "auto", maxWidth: "100%", maxHeight: "70vh", aspectRatio: "9/16", objectFit: "contain", background: "#000", display: "block" }} />
            ) : p && p.media_urls?.length > 1 ? (
              // ONE SLIDE AT A TIME. This showed each slide at 88% width, so a
              // sliver of the NEXT slide sat at the right edge — and since
              // every slide carries the monogram in its own top-left corner,
              // two marks appeared side by side and read as a double logo
              // (founder, 26 Sep 2026). Instagram shows a carousel one slide
              // at a time; so does the review pane, full width and snapped,
              // with a counter so the swipe is legible.
              <div style={{ width: "100%", position: "relative" }}>
                <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", background: "#11100e", width: "100%", scrollbarWidth: "none" }}>
                  {p.media_urls.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt={`slide ${i + 1} of ${p.media_urls.length}`} style={{ width: "100%", height: native ? "auto" : undefined, flex: "0 0 100%", scrollSnapAlign: "center", aspectRatio: native ? undefined : "4/5", objectFit: "contain", background: native ? "transparent" : "#11100e", display: "block" }} />
                  ))}
                </div>
                <div style={{ position: "absolute", top: 10, right: 12, background: "rgba(17,16,14,0.72)", color: "#fff", fontSize: 11, letterSpacing: 0.4, padding: "3px 8px", borderRadius: 999, pointerEvents: "none" }}>
                  swipe · {p.media_urls.length} slides
                </div>
              </div>
            ) : img.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.src} alt="" style={{ width: native ? "100%" : "auto", height: native ? "auto" : undefined, maxWidth: "100%", maxHeight: native ? undefined : "70vh", aspectRatio: native ? undefined : isStory ? "9/16" : isAd ? "16/9" : "4/5", objectFit: "contain", background: native ? "transparent" : "#11100e", display: "block", opacity: img.composed || native ? 1 : 0.8 }} />
            ) : (
              <div style={{ padding: 30, textAlign: "center", color: MIST, fontSize: 13 }}>No picture yet.</div>
            )}
            {!img.composed && img.src && (
              <div style={{ position: "absolute", top: 10, left: 10, fontSize: 11, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "3px 8px", borderRadius: 6 }}>
                {previewVideo ? "Finished film — pending review" : "catalogue picture — not composed yet"}
              </div>
            )}
          </div>

          {personal && <p style={{ fontSize: 12, color: MIST }}>Personal creative draft. Publishing and scheduling become available after your personal account is connected and the finished piece is reviewed.</p>}
          {personal && typeof slot.art?.voiceover === "string" && <div><Kicker>Your voiceover · draft</Kicker><p style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{slot.art.voiceover}</p></div>}
          {frameNote && (
            <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px" }}>
              Not composed, not approvable, never published: {frameNote}. Change the title on this slot, then compose it again.
            </p>
          )}
          {(requiresLayoutCheck(slot.art) || slot.channel === "instagram") && <section aria-label="Measured layout checklist" style={{border:"1px solid #ddd",borderRadius:10,padding:12}}>
            <strong>Measured layout checklist</strong>
            <p style={{fontSize:12}}>Export pixels, checked again against the exact files before approval and publication. Video playback and its profile cover are separate measured surfaces.</p>
            <ul style={{paddingLeft:20,fontSize:13}}>{layoutChecks(slot.art).map(c=><li key={c.label} style={{color:c.ok?"#166534":"#9a3412",marginBottom:7}}><b>{c.ok?"✓":"✕"} {c.label}</b><br/>{c.detail}</li>)}</ul>
            <details><summary style={{fontSize:12,cursor:"pointer"}}>Measured coordinates for every export</summary>
              {layoutReceipt(slot.art)?.assets.map((a,i)=><div key={a.url} style={{fontSize:11,overflowWrap:"anywhere",marginTop:8}}><b>Export {i+1} · SHA-256 {a.sha256.slice(0,12)}</b>{a.frames.map((f,j)=><p key={j}>{f.surface} {j+1}: logo ({f.logo.x}, {f.logo.y}) {f.logo.width}×{f.logo.height}; footer y={f.titleFoot}; text x={f.textLeft}; rightmost pixel={f.text.x+f.text.width}; bottom pixel={f.text.y+f.text.height}.</p>)}</div>)}
            </details>
            {layoutHold(slot.art,p?.media_urls,p?.thumbnail_url,slot.channel === "instagram") && <p role="status" style={{fontSize:12,color:"#9a3412"}}>{layoutHold(slot.art,p?.media_urls,p?.thumbnail_url,slot.channel === "instagram")}</p>}
          </section>}
          {slot.channel === "instagram" && <section aria-label="Design sequence checklist" style={{border:"1px solid #ddd",borderRadius:10,padding:12}}>
            <strong>{slot.design_sequence_error ? "✕" : slot.design_sequence_error === null ? "✓" : "…"} Design sequence check</strong>
            <p style={{fontSize:12}}>{slot.design_sequence_error ?? (slot.design_sequence_error === null ? "No repeated wallpaper identity in this format across the saved calendar and publication history. Feed and carousel count together. Different files and dates do not reset the check." : "Waiting for the calendar identity check.")}</p>
          </section>}
          {/* The decision */}
          {hold && <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 13, lineHeight: 1.6 }}>
            {previewVideo ? "The finished Reel is ready to watch above. " : "Publication is held. "}{hold}
          </p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canApprove && (
              <Btn kind="primary" onClick={onApprove} disabled={busy !== null}>
                Approve{slot.day_key > today ? ` for ${shortDay(slot.day_key)}` : slot.day_key < today ? " — posts today (its day has passed)" : " — posts today"}
              </Btn>
            )}
            {canApprove && (
              <Btn onClick={onRewrite} disabled={busy !== null}>Rewrite</Btn>
            )}
            {canCompose && (
              <Btn kind={p ? "ghost" : "dark"} onClick={onCompose} disabled={busy !== null}>
                {composing ? "Composing…" : p ? "Compose again" : "Compose now"}
              </Btn>
            )}
            {slot.status === "removed" ? (
              <Btn onClick={onRestore} disabled={busy !== null}>Put it back</Btn>
            ) : (
              p?.status !== "published" && (
                <Btn kind="danger" onClick={onRemove} disabled={busy !== null}>Remove</Btn>
              )
            )}
            {p?.status === "published" && p.external_id && slot.channel === "linkedin" && (
              <a href={p.external_id.startsWith("https://") ? p.external_id : `https://www.linkedin.com/feed/update/${p.external_id}/`} target="_blank" rel="noreferrer" style={{ fontSize: 13, alignSelf: "center" }}>
                Open on LinkedIn
              </a>
            )}
            {p?.status === "published" && p.external_id && slot.channel === "instagram" && (
              <a href={`/api/admin/marketing/instagram/permalink?id=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, alignSelf: "center" }}>
                Open on Instagram
              </a>
            )}
          </div>
          {isStory && p?.media_urls?.[0] && p.status !== "published" && (
            <details style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Rebuild Story</summary>
              <p style={{ color: MIST, lineHeight: 1.5 }}>Draws the Story in the measured house frame from a catalogue scene or a room photograph you upload. A headline that does not fit is refused, nothing is replaced. Rebuilding clears the old approval.</p>
              <input aria-label="Catalogue scene URL" value={storySource} onChange={(e) => setStorySource(e.target.value)} placeholder="https://zyvorah.com/media/product-images/…" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <input aria-label="Story headline" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} placeholder="Headline" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <input aria-label="Story subline" value={storyLine} onChange={(e) => setStoryLine(e.target.value)} placeholder="Optional subline" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn disabled={busy !== null || !storySource.trim() || !storyTitle.trim()} onClick={() => onRebuildStory(storySource.trim(), storyTitle.trim(), storyLine.trim())}>Rebuild from scene</Btn>
                <label style={{ cursor: busy !== null || !storyTitle.trim() ? "not-allowed" : "pointer", padding: "9px 13px", border: `1px solid ${LINE}`, borderRadius: 999, fontSize: 13 }}>
                  {busy === "replace-story" ? "Uploading…" : "Rebuild from a photograph"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy !== null || !storyTitle.trim()} style={{ display: "none" }}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) onReplaceStory(file, storyTitle.trim(), storyLine.trim()); e.currentTarget.value = ""; }} />
                </label>
              </div>
            </details>
          )}
          {(p?.format === "reel" || (isStory && /video/i.test(slot.title ?? ""))) && p?.media_urls?.[0] && p.status !== "published" && (
            <details style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Rebuild video from catalogue scenes</summary>
              <p style={{ color: MIST, lineHeight: 1.5 }}>Enter two to five exact Zyvorah room-scene URLs, one per line. The current full-screen layout keeps text clear of Instagram controls. Rebuilding clears the old approval.</p>
              <textarea aria-label="Reel catalogue scene URLs" value={reelScenes} onChange={(e) => setReelScenes(e.target.value)} rows={5} placeholder="https://zyvorah.com/media/product-images/…" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <input aria-label="Reel headline" value={reelTitle} onChange={(e) => setReelTitle(e.target.value)} placeholder="Headline" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <input aria-label="Reel subline" value={reelSub} onChange={(e) => setReelSub(e.target.value)} placeholder="Optional subline" style={{ width: "100%", marginBottom: 8, padding: 8 }} />
              <Btn disabled={busy !== null || !reelTitle.trim() || reelScenes.split(/\s+/).filter(Boolean).length < 2} onClick={() => onRebuildReel(reelScenes.split(/\s+/).filter(Boolean), reelTitle.trim(), reelSub.trim())}>Rebuild video</Btn>
            </details>
          )}
          {p?.approved_at && p.status !== "published" && (
            <div style={{ fontSize: 12, color: st.state === "held" ? "#9a3412" : "#0969da" }}>{st.state === "held" ? "Previous approval retained; publication is held until the checks pass." : <>✓ approved by {p.approved_by} · posts on {shortDay(slot.day_key)} at {lockedTimeIST(slot.art) ?? (slot.channel === "linkedin" ? LINKEDIN_POST_TIME_IST : "11:30")} IST</>}</div>
          )}
          {p?.regenerate_requested_at && (
            <div style={{ fontSize: 12, color: "#9a6700" }}>↻ sent back{p.regenerate_reason ? `: ${p.regenerate_reason}` : ""} — waiting to be composed again (press Compose again to do it now)</div>
          )}
          {p?.error && p.status !== "published" && <div style={{ fontSize: 12, color: "#cf222e" }}>{p.error}</div>}
          {p?.safety_issues && p.safety_issues.length > 0 && !p.safety_passed && (
            <div style={{ fontSize: 11, color: "#9a6700" }}>
              Blocked by the brand-safety gate:
              {p.safety_issues.map((i, k) => (
                <div key={k}>[{i.severity}] {i.code}: {i.detail}</div>
              ))}
            </div>
          )}
          {p?.metrics && (
            <div style={{ fontSize: 12, color: MIST }}>{Object.entries(p.metrics).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
          )}

          {/* The framing — where the composed picture's window sits. Only for
              slots the engine composes from a catalogue render: a finished
              frame posts as-is and a Story page owns its own layout. */}
          {!personal && !slot.unplanned && !!slot.handle && (slot.kind === "feed" || slot.kind === "carousel") && slot.status === "planned" && (
            <FrameTool slot={slot} busy={busy} onSave={onFrame} />
          )}

          {/* The brief */}
          {(slot.hook || slot.visual_brief || slot.meaning || slot.cta) && (
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
              <Kicker>The brief</Kicker>
              {slot.hook && <Row k="Hook" v={slot.hook} />}
              {slot.visual_brief && <Row k="Frame" v={slot.visual_brief} />}
              {slot.devanagari && <Row k="Name" v={`${slot.devanagari}${slot.meaning ? ` — ${slot.meaning}` : ""}`} />}
              {!slot.devanagari && slot.meaning && <Row k="Meaning" v={slot.meaning} />}
              {slot.cta && <Row k="Ask" v={slot.cta} />}
            </div>
          )}

          {/* The copy */}
          {(p?.caption || slot.caption) && (
            <div>
              <Kicker>{isAd ? "Creative" : isStory ? "Story text (not posted — a Story carries no caption)" : "Caption"}</Kicker>
              <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{p?.caption ?? slot.caption}</p>
            </div>
          )}

          {/* Notes */}
          {!slot.unplanned && (
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              <Kicker>Notes</Kicker>
              {(slot.comments ?? []).length === 0 && <Empty>No notes yet.</Empty>}
              {(slot.comments ?? []).map((c, i) => (
                <div key={i} style={{ fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}`, opacity: (c as { resolved?: boolean }).resolved ? 0.65 : 1 }}>
                  <span style={{ color: MIST }}>
                    {c.at.slice(0, 10)} · {c.by.split("@")[0]}{c.kind === "variation" ? " · asked for a variation" : ""}
                    {(c as { resolved?: boolean }).resolved ? " · ✓ acted on" : ""}
                  </span>
                  <div style={{ marginTop: 2 }}>{c.text}</div>
                </div>
              ))}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isAd ? "A note on this ad, or what the variation should change…" : "A note, or what should be different…"}
                style={{ width: "100%", minHeight: 64, marginTop: 10, padding: 8, borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small onClick={() => { if (text.trim()) { onNote("comment", text.trim()); setText(""); } }} disabled={busy !== null || !text.trim()}>
                  Add note
                </Btn>
                <Btn small kind="dark" onClick={() => { if (text.trim()) { onNote("variation", text.trim()); setText(""); } }} disabled={busy !== null || !text.trim()}>
                  Ask for a variation
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The grid-frame tool ──────────────────────────────────────────────────────
//
// The Instagram frame over the actual picture: drag to move it, scroll or the
// slider to zoom, the inner square showing exactly what the profile grid will
// crop to. The arithmetic here mirrors cropWindow() in
// src/lib/marketing/media/image.ts — the same cover window, the same focal
// centring, the same clamping — so the frame saved here IS the frame the
// composer draws, not an approximation of it. Adapted from the crop model the
// configurator and the print pipeline already share (CropData → renderCrop):
// one window over a source, described by where it sits and how far in it is.

const FEED_W = 1080;
const FEED_H = 1350; // 4:5, CANVAS.feed — the composed post's shape

function FrameTool({
  slot,
  busy,
  onSave,
}: {
  slot: DeskSlot;
  busy: string | null;
  onSave: (crop: { zoom: number; x: number; y: number; sceneUrl?: string } | null) => void;
}) {
  const art = (slot.art ?? {}) as { zoom?: unknown; focus_x?: unknown; focus_y?: unknown };
  // The picture the composer will actually frame: the flat artwork for the
  // detail beat, the chosen room render for everything else (the API already
  // resolves the render the composer will lead with).
  const src = (slot.beat === "detail" ? (slot.flat ?? slot.preview) : slot.preview) ?? slot.flat;
  const saved = art.zoom != null || art.focus_x != null || art.focus_y != null;
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const [zoom, setZoom] = useState(() => Math.min(6, Math.max(1, num(art.zoom, slot.beat === "detail" ? 2.4 : 1))));
  const [fx, setFx] = useState(() => Math.min(1, Math.max(0, num(art.focus_x, 0.5))));
  const [fy, setFy] = useState(() => Math.min(1, Math.max(0, num(art.focus_y, slot.beat === "detail" ? 0.45 : 0.5))));
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const drag = useRef<{ px: number; py: number; fx: number; fy: number; k: number } | null>(null);

  if (!src) return null;

  const W = 288; // display width of the 4:5 frame
  const H = Math.round((W * FEED_H) / FEED_W);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // cropWindow(), verbatim: cover scale, window = cover / zoom, centred on the
  // focus and clamped inside the source.
  let img: CSSProperties = { visibility: "hidden" };
  let k = 1;
  if (nat) {
    const scale = Math.min(nat.w / FEED_W, nat.h / FEED_H);
    const winW = (FEED_W * scale) / zoom;
    const winH = (FEED_H * scale) / zoom;
    const left = clamp(fx * nat.w - winW / 2, 0, nat.w - winW);
    const top = clamp(fy * nat.h - winH / 2, 0, nat.h - winH);
    k = W / winW; // screen px per source px
    img = {
      position: "absolute",
      left: -left * k,
      top: -top * k,
      width: nat.w * k,
      height: nat.h * k,
      maxWidth: "none",
      willChange: "left, top, width, height",
    };
  }

  const move = (px: number, py: number) => {
    const d = drag.current;
    if (!d || !nat) return;
    setFx(clamp(d.fx - (px - d.px) / d.k / nat.w, 0, 1));
    setFy(clamp(d.fy - (py - d.py) / d.k / nat.h, 0, 1));
    setDirty(true);
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <Kicker>Frame for the grid</Kicker>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div
          style={{ position: "relative", width: W, height: H, overflow: "hidden", borderRadius: 10, background: "#e8e6df", cursor: "grab", touchAction: "none", flex: "0 0 auto" }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, fx, fy, k };
          }}
          onPointerMove={(e) => move(e.clientX, e.clientY)}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => {
            setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 6));
            setDirty(true);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            style={img}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {/* What the profile grid shows: the centre square of the 4:5 post. */}
          <div style={{ position: "absolute", left: 0, right: 0, top: (H - W) / 2, height: W, border: "1.5px solid rgba(255,255,255,0.9)", boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 0 0 2000px rgba(15,15,15,0.28)", pointerEvents: "none" }} />
          <span style={{ position: "absolute", left: 8, top: (H - W) / 2 + 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.8)", pointerEvents: "none" }}>GRID</span>
        </div>
        <div style={{ display: "grid", gap: 8, minWidth: 180, flex: 1 }}>
          <div style={{ fontSize: 12, color: MIST, lineHeight: 1.55 }}>
            Drag the picture, scroll or slide to zoom. The outer frame is the post (4:5); the bright square is what the profile grid shows. Saving composes the post again with this exact frame.
          </div>
          <label style={{ fontSize: 12, color: MIST, display: "grid", gap: 4 }}>
            Zoom · {zoom.toFixed(2)}×
            <input
              type="range"
              min={1}
              max={4}
              step={0.02}
              value={Math.min(zoom, 4)}
              onChange={(e) => {
                setZoom(Number(e.target.value));
                setDirty(true);
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small kind="dark" onClick={() => onSave({ zoom, x: fx, y: fy, sceneUrl: src })} disabled={busy !== null || (!dirty && saved)}>
              {busy === "frame" ? "Saving…" : "Save frame & compose"}
            </Btn>
            {saved && (
              <Btn small onClick={() => onSave(null)} disabled={busy !== null}>
                Reset framing
              </Btn>
            )}
          </div>
          {saved && !dirty && <div style={{ fontSize: 11, color: MIST }}>A saved frame is already on this slot — move or zoom to change it.</div>}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 8, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ color: MIST }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
