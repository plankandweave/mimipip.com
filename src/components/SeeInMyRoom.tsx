"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { RoomVisualizer, type Corners } from "@/components/RoomVisualizer";
import { SaveToBoard } from "@/components/SaveToBoard";
import { useAuth } from "@/components/AuthProvider";
import { AUTO_BOARD_NAME, addBoardItem, ensureBoard, resolveProductId, uploadBoardImage } from "@/lib/board-save";
import { CM_PER_FOOT } from "@/lib/pricing";
import { loadRoomSession, saveRoomSession, clearRoomSession, type RoomSession } from "@/lib/room-session";
import type { CropData } from "@/lib/visualizer";
import type { ProductCardData } from "@/lib/types";
import { ROOM_PHOTO_INPUT_ID, takeEarlyRoomPhoto } from "@/lib/early-room-photo";

// `crop` rides along so a tried look can be saved to the customer's board with
// the same framing data the product page stores — the tiles below are otherwise
// in-memory only and vanish on refresh.
type TriedLook = { handle: string; title: string; composite: string; crop: CropData };

async function fileToDataUri(file: File, maxEdge = 1800): Promise<string> {
  const raw = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = raw;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    if (scale >= 1) return raw;
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

export function SeeInMyRoom({ initialDesigns, focusHandle = null }: { initialDesigns: ProductCardData[]; focusHandle?: string | null }) {
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [widthFt, setWidthFt] = useState(10);
  const [heightFt, setHeightFt] = useState(8);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCardData[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [active, setActive] = useState<ProductCardData | null>(null); // design currently open in the visualiser
  const [tried, setTried] = useState<TriedLook[]>([]);
  const [compareSet, setCompareSet] = useState<string[]>([]); // up to 2 handles
  const [saving, setSaving] = useState<TriedLook | null>(null); // look being saved to a named board
  // Auto-save status per design handle, for signed-in customers.
  const [autoSaved, setAutoSaved] = useState<Record<string, "saving" | "saved" | "error">>({});
  const { session, ensureCustomerId } = useAuth();
  // No email wall up front (30 Sep 2026): the photo stays in the browser and
  // the design is drawn on it locally. Server work — furniture detection and
  // saving — is gated where it happens (RoomVisualizer, autoSave).
  const autoBoardRef = useRef<string | null>(null); // resolved once per session
  // Mirrors of tried/autoSaved for the sign-in backfill, which must read current
  // values without re-running on every change to them.
  const triedRef = useRef<TriedLook[]>([]);
  const autoSavedRef = useRef<Record<string, "saving" | "saved" | "error">>({});
  useEffect(() => { triedRef.current = tried; }, [tried]);
  useEffect(() => { autoSavedRef.current = autoSaved; }, [autoSaved]);

  const fileRef = useRef<HTMLInputElement | null>(null);
  // "Looks you've tried" sits right under the header so the result of "Use
  // this placement" is the next thing on a phone screen, and the page scrolls
  // to it when a look lands (7 October 2026: the tiles rendered below the
  // whole design grid, so on a phone the modal closed and nothing seemed to
  // happen — "try any design against it, but it doesn't let me").
  const triedSectionRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (!landed) return;
    triedSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [landed]);

  // ?design=<handle> (see the page): open that design on the room the first
  // time a room is there, whether it was saved earlier or has just come in.
  const focusOpened = useRef(false);
  useEffect(() => {
    if (!room || !focusHandle || focusOpened.current) return;
    const d = initialDesigns.find((x) => x.handle === focusHandle);
    if (!d) return;
    focusOpened.current = true;
    setActive(d);
  }, [room, focusHandle, initialDesigns]);

  useEffect(() => {
    const s = loadRoomSession();
    if (s) { setRoom(s); setWidthFt(s.widthFt); setHeightFt(s.heightFt); return; }
    // A photo chosen before hydration (see src/lib/early-room-photo.ts): the
    // inline script stashed it; the input is a fallback for the case where
    // hydration kept the original element.
    const early = takeEarlyRoomPhoto() ?? fileRef.current?.files?.[0];
    if (early) {
      void onUploadRoom(early);
      if (fileRef.current) fileRef.current.value = "";
    }
    // Mount only: onUploadRoom reads the wall fields, which at mount still
    // hold their defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The wall stays editable AFTER the room is saved. The size used to be two
  // fields under the upload tile, below the fold on a phone, and frozen as
  // "Wall: 10 × 8 ft" once the photo was in (7 October 2026: "it just takes a
  // wall as 10 by 8 … doesn't allow me to change a wall"). A change is kept
  // with the room, so the order link and the next visit carry it.
  const setWall = (w: number, h: number) => {
    setWidthFt(w);
    setHeightFt(h);
    if (room) {
      const next = { ...room, widthFt: w, heightFt: h };
      setRoom(next);
      saveRoomSession(next);
    }
  };

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/design-search?q=${encodeURIComponent(query.trim())}`);
        const data = await r.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const onUploadRoom = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const uri = await fileToDataUri(file);
    // corners get set for real once the customer aligns them in the visualiser;
    // start with a full-frame placeholder so "Identify the wall" opens cleanly.
    const placeholder: Corners = [{ x: 0.2, y: 0.15 }, { x: 0.8, y: 0.15 }, { x: 0.8, y: 0.75 }, { x: 0.2, y: 0.75 }];
    const next: RoomSession = { photo: uri, corners: placeholder, widthFt, heightFt };
    setRoom(next);
    saveRoomSession(next);
  };
  const useDemoRoom = () => {
    const next: RoomSession = {
      photo: "/room-preview-demo.svg",
      corners: [{ x: 0.08, y: 0.08 }, { x: 0.68, y: 0.08 }, { x: 0.68, y: 0.77 }, { x: 0.08, y: 0.77 }],
      widthFt,
      heightFt,
    };
    setRoom(next);
    saveRoomSession(next);
  };

  // Signed-in customers shouldn't have to think about saving — a placement they
  // aligned is worth keeping. Fire-and-forget: a failure here leaves the tile on
  // screen and the explicit "Save to my board" button as the fallback, it never
  // blocks the visualiser closing.
  const autoSave = async (look: TriedLook) => {
    setAutoSaved((s) => ({ ...s, [look.handle]: "saving" }));
    try {
      const customerId = await ensureCustomerId();
      if (!customerId) throw new Error("no customer");
      if (!autoBoardRef.current) autoBoardRef.current = await ensureBoard(customerId, AUTO_BOARD_NAME);
      const [imageUrl, productId] = await Promise.all([
        uploadBoardImage(customerId, look.composite),
        resolveProductId(look.handle),
      ]);
      await addBoardItem({
        boardId: autoBoardRef.current,
        productId,
        imageUrl,
        crop: look.crop,
        // Re-framing the same design updates its tile instead of stacking.
        replaceSameProduct: true,
      });
      setAutoSaved((s) => ({ ...s, [look.handle]: "saved" }));
    } catch {
      autoBoardRef.current = null; // re-resolve next time in case that was the failure
      setAutoSaved((s) => ({ ...s, [look.handle]: "error" }));
    }
  };

  // Signing in mid-session (typically via the explicit save flow) backfills
  // everything already tried, so logging in never leaves earlier looks behind.
  const prevSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    const justSignedIn = uid && !prevSessionRef.current;
    prevSessionRef.current = uid;
    if (!justSignedIn) return;
    triedRef.current.forEach((look) => {
      if (autoSavedRef.current[look.handle] !== "saved") void autoSave(look);
    });
    // autoSave/tried are read through refs so this fires only on the sign-in
    // transition, never on every new look (onApply already saves those).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const shown = results ?? initialDesigns;

  return (
    <div className="container-x py-12">
      {!room ? (
        <div className="mx-auto max-w-2xl text-center">
          <span className="caps text-slate">See It in My Room</span>
          <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">
            See wallpaper in your room before you decide.
          </h1>
          <p className="mt-4 text-slate">
            Upload your room once — we'll keep it and the wall you mark, so you can try as many designs
            against it as you like without starting over.
          </p>
          <p className="mt-2 text-xs text-slate">Your room photo is kept in this browser until you remove it. A basic preview runs on your device; signed-in furniture detection and looks saved to a board use our service. <Link href="/privacy" className="underline">Privacy details</Link></p>
          {/* A <label> for the file input, not a div with onClick: the native
              picker opens from the HTML alone, before any script has loaded.
              On a slow phone the tile is the first thing a visitor taps, and
              a tap in the seconds before hydration used to do nothing
              (8 October 2026). A photo chosen in that window is picked up
              by the mount effect below once the scripts arrive. */}
          <label
            htmlFor={ROOM_PHOTO_INPUT_ID}
            className="mt-8 grid cursor-pointer place-items-center rounded-[20px] border-2 border-dashed border-edge px-6 py-16 text-center transition-colors hover:bg-wash/60 focus-within:border-charcoal"
          >
            <span className="text-sm font-medium text-charcoal">Tap to upload a photo of your room</span>
            <span className="mt-1 text-xs text-mist">JPG, PNG or WEBP</span>
            <input id={ROOM_PHOTO_INPUT_ID} ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadRoom(f); e.target.value = ""; }} />
          </label>
          <button type="button" onClick={useDemoRoom} className="mt-3 text-sm font-semibold text-charcoal underline underline-offset-4">No photo yet? Try a demo room</button>
          <p className="mt-2 text-xs text-mist">For your own photo, take a straight-on picture in good light with the whole wall visible.</p>
          <div className="mt-6 grid grid-cols-2 gap-4 text-left">
            <div>
              <label className="mb-1 block text-xs font-medium text-mist">Wall width (ft)</label>
              <input type="number" inputMode="decimal" min={0} step="any" aria-label="Wall width in feet" value={widthFt} onChange={(e) => setWall(parseFloat(e.target.value) || 0, heightFt)} className="h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-mist">Wall height (ft)</label>
              <input type="number" inputMode="decimal" min={0} step="any" aria-label="Wall height in feet" value={heightFt} onChange={(e) => setWall(widthFt, parseFloat(e.target.value) || 0)} className="h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal" />
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="caps text-slate">See It in My Room</span>
              <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{room.photo === "/room-preview-demo.svg" ? "Demo room ready. Tap a design to see it on the wall." : "Your room is saved. Tap a design to see it on your wall."}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-14 w-14 overflow-hidden rounded-[12px] border border-edge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={room.photo} alt="Your room" className="h-full w-full object-cover" />
              </div>
              <button
                onClick={() => { clearRoomSession(); setRoom(null); setTried([]); setCompareSet([]); }}
                className="btn btn-ghost h-10 px-4 text-xs"
              >
                {room.photo === "/room-preview-demo.svg" ? "Leave demo" : "Change room"}
              </button>
            </div>
          </div>

          {/* the wall, editable at any time */}
          <div className="mb-6 flex flex-wrap items-end gap-3 rounded-[16px] border border-edge bg-surface px-4 py-3">
            <p className="w-full text-xs font-medium text-mist sm:w-auto sm:self-center sm:pr-2">Your wall</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs text-slate">Width</span>
              <input type="number" inputMode="decimal" min={0} step="any" aria-label="Wall width in feet" value={widthFt} onChange={(e) => setWall(parseFloat(e.target.value) || 0, heightFt)} className="h-10 w-20 rounded-[10px] border border-edge bg-cloud px-3 text-sm outline-none focus:border-charcoal" />
              <span className="text-xs text-slate">ft</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs text-slate">Height</span>
              <input type="number" inputMode="decimal" min={0} step="any" aria-label="Wall height in feet" value={heightFt} onChange={(e) => setWall(widthFt, parseFloat(e.target.value) || 0)} className="h-10 w-20 rounded-[10px] border border-edge bg-cloud px-3 text-sm outline-none focus:border-charcoal" />
              <span className="text-xs text-slate">ft</span>
            </label>
            <p className="text-xs text-mist">Measure wall to wall and floor to ceiling. You can refine it when you order.</p>
          </div>

          {/* tried looks — first, so the result of "Use this placement" is on screen */}
          {tried.length > 0 && (
            <div ref={triedSectionRef} className="mb-10 scroll-mt-28">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Looks you&apos;ve tried</h2>
                {compareSet.length === 2 && (
                  <button onClick={() => setCompareSet([])} className="min-h-10 text-xs font-semibold text-slate underline underline-offset-2">Clear comparison</button>
                )}
              </div>
              <p className="mb-4 text-xs text-mist">
                {tried.length > 1 ? "Pick two to compare them side by side. " : ""}
                {session
                  ? "Saved to your account automatically — find them under My Boards."
                  : "These stay only while this page is open — save one to your board to keep it."}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tried.map((t) => {
                  const picked = compareSet.includes(t.handle);
                  return (
                    <div key={t.handle} className={`overflow-hidden rounded-[16px] border-2 ${picked ? "border-charcoal" : "border-edge"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.composite} alt={t.title} className="aspect-[4/3] w-full object-cover" />
                      <div className="space-y-3 p-3">
                        <p className="text-sm font-semibold">{t.title}</p>
                        <Link
                          href={`/products/${t.handle}?w=${widthFt}&h=${heightFt}&configure=1`}
                          className="btn flex h-11 w-full items-center justify-center px-4 text-[0.8rem]"
                        >
                          Order this wallpaper · {widthFt} × {heightFt} ft
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/products/${t.handle}?sample=1`} className="inline-flex min-h-10 items-center rounded-full border border-edge px-3.5 text-xs font-semibold text-charcoal hover:border-charcoal">
                            Order a sample
                          </Link>
                          {tried.length > 1 && (
                            <button
                              onClick={() =>
                                setCompareSet((prev) => {
                                  if (prev.includes(t.handle)) return prev.filter((h) => h !== t.handle);
                                  if (prev.length >= 2) return [prev[1], t.handle];
                                  return [...prev, t.handle];
                                })
                              }
                              className="inline-flex min-h-10 items-center rounded-full border border-edge px-3.5 text-xs font-semibold text-slate hover:border-charcoal hover:text-charcoal"
                            >
                              {picked ? "Comparing ✓" : "Compare"}
                            </button>
                          )}
                          <button
                            onClick={() => setSaving(t)}
                            className="inline-flex min-h-10 items-center rounded-full border border-edge px-3.5 text-xs font-semibold text-slate hover:border-charcoal hover:text-charcoal"
                          >
                            {autoSaved[t.handle] === "saved" ? "Save to another board" : "Save to my board"}
                          </button>
                          {autoSaved[t.handle] === "saving" && (
                            <span className="inline-flex min-h-10 items-center px-1 text-xs text-mist">Saving…</span>
                          )}
                          {autoSaved[t.handle] === "saved" && (
                            <Link
                              href="/account/boards"
                              className="inline-flex min-h-10 items-center px-1 text-xs font-semibold text-slate underline underline-offset-2"
                            >
                              Saved ✓
                            </Link>
                          )}
                          {autoSaved[t.handle] === "error" && (
                            <span className="inline-flex min-h-10 items-center px-1 text-xs text-mist">Not saved — use Save to my board</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {compareSet.length === 2 && (
                <div className="mt-8">
                  <h3 className="mb-3 text-sm font-semibold text-slate">Comparing</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {compareSet.map((h) => {
                      const t = tried.find((x) => x.handle === h)!;
                      return (
                        <div key={h} className="overflow-hidden rounded-[16px] border border-edge">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={t.composite} alt={t.title} className="aspect-[4/3] w-full object-cover" />
                          <p className="p-3 text-sm font-semibold">{t.title}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* design picker */}
          <h2 className="mb-3 text-base font-semibold">{tried.length > 0 ? "Try another design" : "Pick a design to try"}</h2>
          <div className="mb-4 max-w-md">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search designs to try…"
              className="h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {shown.map((d) => (
              <button
                key={d.handle}
                onClick={() => setActive(d)}
                className="group relative aspect-square overflow-hidden rounded-[14px] border border-edge"
              >
                {d.image && <Image src={d.image} alt={d.title} fill sizes="150px" className="object-cover transition-transform group-hover:scale-105" />}
                <span className="absolute inset-x-0 bottom-0 truncate bg-charcoal/60 px-2 py-1 text-[0.65rem] font-medium text-surface">{d.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {room && active && (
        <RoomVisualizer
          open
          onClose={() => setActive(null)}
          // The flat pattern, never a room render (catalogue rule); the card
          // image is the render shown on the tile.
          imageUrl={active.flatImage ?? active.image ?? ""}
          imageAlt={active.title}
          productHandle={active.handle}
          wallWidthCm={widthFt * CM_PER_FOOT}
          wallHeightCm={heightFt * CM_PER_FOOT}
          wallLabel={`${widthFt} × ${heightFt} ft wall`}
          initial={null}
          initialPhoto={room.photo}
          initialCorners={room.corners}
          initialMids={room.mids ?? null}
          onRoomCapture={(photo, corners, mids) => {
            const next: RoomSession = { photo, corners, widthFt, heightFt, mids };
            setRoom(next);
            saveRoomSession(next);
          }}
          onApply={(crop, composite) => {
            if (composite) {
              const look: TriedLook = { handle: active.handle, title: active.title, composite, crop };
              setTried((prev) => [look, ...prev.filter((t) => t.handle !== active.handle)]);
              setLanded((n) => n + 1);
              if (session) void autoSave(look);
            }
            setActive(null);
          }}
        />
      )}

      {saving && (
        <SaveToBoard
          open
          onClose={() => setSaving(null)}
          productId={null}
          productHandle={saving.handle}
          imageDataUrl={saving.composite}
          crop={saving.crop}
        />
      )}

    </div>
  );
}
