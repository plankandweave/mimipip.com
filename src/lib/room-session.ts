import type { Corners } from "@/components/RoomVisualizer";
import type { EdgeMids } from "./coons";

// Persists the customer's uploaded room photo + aligned wall corners across
// the whole "See It in My Room" browsing session, so trying a second or
// third design never asks them to re-upload or re-align the wall.
const KEY = "zyvorah:room-session";

export type RoomSession = {
  photo: string; // data URI or object URL — data URIs are what actually survive a reload
  corners: Corners;
  widthFt: number;
  heightFt: number;
  /** Curve handles from a "curved surface" (column/arch) alignment. Absent on
   *  older stored sessions and on flat walls — always treat missing as flat. */
  mids?: EdgeMids;
};

export function loadRoomSession(): RoomSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSession;
    if (!parsed?.photo || !Array.isArray(parsed.corners)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRoomSession(next: RoomSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full/unavailable — the session just won't persist across reloads */
  }
}

export function clearRoomSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A photo the session can keep. RoomVisualizer hands back whatever it was
 * given — a `blob:` object URL for a photo picked inside it — and an object
 * URL dies with the page, so a room saved from a product page came back empty
 * on the next one. Blob URLs are drawn down to a phone-sized JPEG data URI;
 * anything else (already a data URI, or the demo room's path) is returned as
 * is. Resolves to null when the image cannot be read, so a failed conversion
 * costs the saved room, never the placement.
 */
export async function persistablePhoto(src: string, maxEdge = 1800): Promise<string | null> {
  if (!src.startsWith("blob:")) return src;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = src;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.width * scale));
    cv.height = Math.max(1, Math.round(img.height * scale));
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}
