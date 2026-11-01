"use client";

/** The founder's decisions, one card per Diwali post: its picture, the one
 *  question it needs, and a button. Nothing here approves a post; an answer
 *  sends it to be drawn, and it then waits on /admin/marketing/review for the
 *  final yes. Phone first. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";

type Item = {
  id: string;
  day: string;
  format: string;
  title: string;
  collection: string | null;
  handle: string | null;
  caption: string | null;
  picture: string | null;
  pictures: string[];
  film: string | null;
  decided: boolean;
  kind: "choose-product" | "approve-design" | "confirm-film" | "redraw" | "production";
  question: string;
  production: string[];
};
type Product = { handle: string; title: string; picture: string };

const INK = "#2D2D2D";
const MIST = "#6B6B6B";
const LINE = "#E0E0E0";
const ACCENT = "#8C7B6B";
const FORMAT: Record<string, string> = { feed: "Grid post", carousel: "Carousel", reel: "Reel", story: "Story" };

function prettyDay(day: string): string {
  const d = new Date(`${day}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const btn = (primary: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 8,
  border: primary ? "none" : `1px solid ${LINE}`,
  background: primary ? ACCENT : "#fff",
  color: primary ? "#fff" : INK,
  fontSize: 15,
  cursor: "pointer",
});

export default function Decisions() {
  const staff = useStaff();
  const [items, setItems] = useState<Item[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [search, setSearch] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing/decisions", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not load");
      setItems(j.items);
      setProducts(j.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    if (staff === "in") void load();
  }, [staff, load]);

  const answer = async (it: Item, action: "approve" | "set-product" | "remove") => {
    if (action === "remove" && !confirm(`Don't run "${it.title}"?`)) return;
    setBusy(it.id);
    try {
      const res = await fetch("/api/admin/marketing/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: it.id, action, handle: choice[it.id] ?? it.handle }),
      });
      const j = await res.json();
      setNotes((n) => ({ ...n, [it.id]: res.ok ? j.message : j.error ?? "Something went wrong" }));
      if (res.ok) setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, decided: true } : x)) ?? null);
    } finally {
      setBusy(null);
    }
  };

  const yours = useMemo(() => (items ?? []).filter((i) => i.kind !== "production"), [items]);
  const production = useMemo(() => (items ?? []).filter((i) => i.kind === "production"), [items]);
  const open = yours.filter((i) => !notes[i.id]).length;

  if (staff !== "in") return <StaffGate state={staff} title="Your decisions" />;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 80px", fontFamily: "Inter, system-ui, Arial, sans-serif", color: INK, background: "#FAFAF8", minHeight: "100vh" }}>
      <a href="/admin/marketing" style={{ color: MIST, fontSize: 14 }}>← Marketing</a>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "14px 0 6px" }}>Your decisions</h1>
      <p style={{ color: MIST, fontSize: 15, lineHeight: 1.55, margin: 0 }}>
        Diwali posts that need your call. One tap each. Nothing is published from here: an answer redraws the post, and it then
        waits on <a href="/admin/marketing/review" style={{ color: ACCENT }}>your review page</a> for a final yes.
      </p>
      {items && <p style={{ fontSize: 15, margin: "14px 0 0" }} data-decisions-open={open}>{open} waiting on you</p>}
      {error && <p style={{ color: "#a33", marginTop: 16 }}>{error}</p>}
      {!items && !error && <p style={{ color: MIST, marginTop: 24 }}>Loading…</p>}

      {yours.map((it) => {
        const q = (search[it.id] ?? "").toLowerCase();
        const picked = choice[it.id] ?? it.handle ?? "";
        const pickedProduct = products.find((p) => p.handle === picked);
        const matches = q ? products.filter((p) => p.title.toLowerCase().includes(q) || p.handle.includes(q)).slice(0, 8) : [];
        return (
          <section key={it.id} data-decision={it.kind} style={{ borderTop: `1px solid ${LINE}`, marginTop: 28, paddingTop: 22 }}>
            <div style={{ fontSize: 13, color: MIST }}>
              {prettyDay(it.day)} · {FORMAT[it.format] ?? it.format}
              {it.collection ? ` · ${it.collection}` : ""}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 12px" }}>{it.title}</h2>
            {it.film ? (
              <video src={it.film} poster={it.picture ?? undefined} controls playsInline style={{ width: "100%", borderRadius: 8, background: "#F5F5F3" }} />
            ) : it.pictures.length > 1 ? (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory" }}>
                {it.pictures.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" style={{ width: "85%", flex: "0 0 auto", borderRadius: 8, scrollSnapAlign: "start" }} />
                ))}
              </div>
            ) : it.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.picture} alt="" style={{ width: "100%", borderRadius: 8 }} />
            ) : (
              <p style={{ color: MIST, fontSize: 14 }}>No picture yet.</p>
            )}
            {it.caption && <p style={{ fontSize: 14, color: MIST, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{it.caption.slice(0, 280)}{it.caption.length > 280 ? "…" : ""}</p>}

            <p style={{ fontSize: 16, fontWeight: 600, margin: "14px 0 10px" }}>{it.question}</p>

            {it.kind === "choose-product" && !notes[it.id] && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: MIST, marginBottom: 6 }}>
                  Sells: <strong style={{ color: INK }}>{pickedProduct?.title ?? (picked || "not chosen")}</strong>
                </div>
                <input
                  value={search[it.id] ?? ""}
                  onChange={(e) => setSearch((s) => ({ ...s, [it.id]: e.target.value }))}
                  placeholder="Search to choose another wallpaper"
                  style={{ width: "100%", minHeight: 44, border: `1px solid ${LINE}`, borderRadius: 8, padding: "0 12px", fontSize: 16, boxSizing: "border-box" }}
                />
                {matches.map((p) => (
                  <button
                    key={p.handle}
                    onClick={() => { setChoice((c) => ({ ...c, [it.id]: p.handle })); setSearch((s) => ({ ...s, [it.id]: "" })); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, border: "none", borderBottom: `1px solid ${LINE}`, background: "#fff", textAlign: "left", cursor: "pointer", padding: "4px 0" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.picture} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 4 }} />
                    <span style={{ fontSize: 15, color: INK }}>{p.title}</span>
                  </button>
                ))}
              </div>
            )}

            {notes[it.id] ? (
              <p style={{ fontSize: 15, color: ACCENT }}>{notes[it.id]}</p>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {it.kind === "choose-product" ? (
                  <button disabled={busy === it.id || !picked} onClick={() => answer(it, "set-product")} style={btn(true)}>
                    {busy === it.id ? "Working…" : "Use this wallpaper"}
                  </button>
                ) : (
                  <button disabled={busy === it.id} onClick={() => answer(it, "approve")} style={btn(true)}>
                    {busy === it.id ? "Working…" : it.kind === "confirm-film" ? "Yes, they match" : it.kind === "redraw" ? "Redraw it" : "Go ahead"}
                  </button>
                )}
                <button disabled={busy === it.id} onClick={() => answer(it, "remove")} style={btn(false)}>Don't run</button>
              </div>
            )}
          </section>
        );
      })}

      {production.length > 0 && (
        <section style={{ borderTop: `1px solid ${LINE}`, marginTop: 40, paddingTop: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>Being finished by production ({production.length})</h2>
          <p style={{ fontSize: 14, color: MIST, margin: "0 0 10px" }}>Nothing needed from you. They come to your review page when ready.</p>
          {production.map((it) => (
            <p key={it.id} style={{ fontSize: 14, margin: "6px 0" }}>
              {prettyDay(it.day)} · {FORMAT[it.format] ?? it.format} · {it.title}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
