"use client";

import { useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";

const PLAN = "diwali-owner-review-20261002";
const value = (s: DeskSlot, k: string) => typeof s.art?.[k] === "string" ? s.art[k] as string : "";

/** Owner review of a draft plan. Reads saved slots only; has no approval,
 * composition or publication controls. Source images retain their full aspect. */
export default function BoardRefresh() {
  const staff = useStaff();
  const [slots, setSlots] = useState<DeskSlot[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [placement, setPlacement] = useState("All placements");
  const [showReserves, setShowReserves] = useState(true);
  const [campaign, setCampaign] = useState("AHIMSA launch");
  useEffect(() => {
    if (staff !== "in") return;
    let active = true;
    fetch("/api/admin/marketing/plan?from=2026-10-02&to=2027-01-26", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error(`Board read failed (${r.status})`); return r.json(); })
      .then(data => { if (!active) return; if (data.error) throw new Error(data.error); setSlots((data.slots as DeskSlot[]).filter(s => s.plan_key === PLAN).sort((a, b) => a.day_key.localeCompare(b.day_key) || a.seq - b.seq)); setLoaded(true); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Board read failed"); });
    return () => { active = false; };
  }, [staff]);
  if (staff !== "in") return <StaffGate state={staff} title="Marketing board review" />;
  const choices = [...new Set(slots.map(s => value(s, "placement")))];
  const handoff = slots.map(s => value(s, "handoff_library_file_id")).find(Boolean);
  const shown = slots.filter(s => (campaign === "All saved proposals" || s.art?.owner_scope === "ahimsa-five-day-20261003") && (showReserves || s.art?.selected === true) && (placement === "All placements" || value(s, "placement") === placement));
  return <main style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 20px", color: "#202020" }}>
    <a href="/admin/marketing?review=1">Marketing desk · review</a>
    <h1>Marketing review board</h1>
    <p>Saved draft board · all dates proposed in IST · awaiting owner reapproval.</p>
    {slots.some(s => s.art?.owner_scope === "ahimsa-five-day-20261003") && <section aria-label="Ahimsa launch schedule">
      <h2>AHIMSA · Strength, Softly Woven</h2>
      <p>3–7 October · eleven wallpapers across five days: 3 + 2 + 2 + 2 + 2. Each wallpaper has its own five-room carousel. One collection Reel per day; two linked Story frames per wallpaper. October 2 remains historical.</p>
      <p>Review each daily set together. Dates are proposed until the exact finished media is approved. Missing rooms and voiceovers are production holds, never substitute creative.</p>
    </section>}
    <p>Catalogue images below are source previews, shown whole without bands, stretching or cropping. Each card lists what remains before its final creative can be approved. Stories may retain an exact product destination; Link stickers are optional. YouTube Shorts require current channel verification.</p>
    {handoff && <p><a href={`https://chatgpt.com/api/library/files/${encodeURIComponent(handoff)}/download`}>Owner’s prepared assets and design handoff in ChatGPT Library</a></p>}
    {error && <p role="alert">{error}</p>}
    {!loaded && !error && <p>Reading the saved board…</p>}
    {loaded && <p>{slots.length} saved cards · {slots.filter(s => s.art?.selected === true).length} proposed · {slots.filter(s => s.art?.selected !== true).length} reserves or awaiting assets · {shown.length} shown</p>}
    <label>Campaign <select value={campaign} onChange={e => setCampaign(e.target.value)}><option>AHIMSA launch</option><option>All saved proposals</option></select></label>{" "}
    <label>Placement <select value={placement} onChange={e => setPlacement(e.target.value)}><option>All placements</option>{choices.map(c => <option key={c}>{c}</option>)}</select></label>{" "}
    <label><input type="checkbox" checked={showReserves} onChange={e => setShowReserves(e.target.checked)} /> Show reserves</label>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 24, marginTop: 24 }}>
      {shown.map(s => {
        const image = value(s, "review_image_url");
        const video = value(s, "review_video_url");
        const link = value(s, "product_url");
        const blockers = Array.isArray(s.art?.blockers) ? s.art.blockers.filter((b): b is string => typeof b === "string") : [];
        const frames = Array.isArray(s.art?.carousel_frames) ? s.art.carousel_frames.filter((f): f is { title: string; image_url: string; product_url: string } => typeof f === "object" && f !== null && typeof f.title === "string" && typeof f.image_url === "string" && typeof f.product_url === "string") : [];
        return <article key={s.id} data-slot-id={s.id} style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", alignSelf: "start" }}>
          {video ? <video controls preload="metadata" src={video} poster={value(s, "review_poster_url") || undefined} style={{ width: "100%", height: "auto", display: "block" }} /> : image ? <img src={image} alt={`${s.title ?? "Creative"} · whole source preview`} loading="lazy" style={{ width: "100%", height: "auto", display: "block" }} /> : <p style={{ padding: 20 }}>Creative awaiting supported media transfer or owner artwork</p>}
          <div style={{ padding: 18 }}>
            <p>{s.day_key} · {value(s, "proposed_time_ist") || "time awaiting owner"} IST · {s.channel} · {s.kind}</p>
            <strong>{value(s, "placement")}</strong>
            <h2 style={{ fontSize: 22 }}>{s.title}</h2>
            <p>{s.collection || "Collection awaiting owner"} · {value(s, "review_state")}</p>
            <p><a href={`/admin/marketing?review=1&tab=calendar&from=2026-10-02&to=2027-01-26&slot=${encodeURIComponent(s.id)}`}>Open this saved item in the marketing desk</a></p>
            {frames.length > 0 && <section aria-label="Complete carousel sequence">
              <h3 style={{ fontSize: 15 }}>{frames.length} slides · first slide is the cover</h3>
              {frames.map((f, i) => <figure key={f.image_url} style={{ margin: "16px 0" }}>
                <img src={f.image_url} alt={`Slide ${i + 1}: ${f.title} · whole artwork`} loading="lazy" style={{ width: "100%", height: "auto", display: "block" }} />
                <figcaption>{i + 1}. {f.title} · <a href={f.product_url} target="_blank" rel="noreferrer">Product destination</a></figcaption>
              </figure>)}
            </section>}
            {link ? <p><a href={link} target="_blank" rel="noreferrer">{link}</a></p> : <p>Destination awaiting confirmation</p>}
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{s.caption || "Copy awaiting owner artwork"}</p>
            {s.visual_brief && <section><h3 style={{ fontSize: 15 }}>Creative direction</h3><p style={{ whiteSpace: "pre-wrap" }}>{s.visual_brief}</p></section>}
            {value(s, "voiceover_script") && <section><h3 style={{ fontSize: 15 }}>Voiceover · {value(s, "voice_name")}</h3><p style={{ whiteSpace: "pre-wrap" }}>{value(s, "voiceover_script")}</p></section>}
            {value(s, "voiceover_draft_url") && <section><h3 style={{ fontSize: 15 }}>Draft narration · listening review required</h3><audio controls preload="none" style={{ width: "100%" }} src={value(s, "voiceover_draft_url")} /><p><a href={value(s, "voiceover_draft_url")}>Open narration draft</a></p></section>}
            {value(s, "story_link_url") && <p>Native Link sticker: <a href={value(s, "story_link_url")}>{value(s, "story_link_sticker_text") || "Shop this wallpaper"}</a></p>}
            {value(s, "archive_member") && <p style={{ overflowWrap: "anywhere" }}>Selected existing Library cut: {value(s, "archive_member")} · {String(s.art?.duration_s)} seconds</p>}
            {value(s, "review_artwork_url") && <p><a href={value(s, "review_artwork_url")} target="_blank" rel="noreferrer">View complete catalogue artwork</a></p>}
            {blockers.length > 0 && <><h3 style={{ fontSize: 15 }}>Before approval</h3><ul>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
          </div>
        </article>;
      })}
    </div>
  </main>;
}
