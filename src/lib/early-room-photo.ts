/**
 * A room photo chosen before the page's scripts have loaded.
 *
 * The "See It in My Room" upload tile is a plain <label> for a file input, so
 * the native picker opens from the HTML alone. But a file chosen in the
 * seconds before React hydrates fires its change event into the void, and if
 * hydration has to regenerate the tree the input itself is replaced and the
 * file is gone with it. This inline script, served in the page's HTML with no
 * bundle needed, listens at the document (so it outlives the element) and
 * keeps the File on `window` for the component to pick up on mount. It lives
 * in the root layout's <head>, so it is parsed before the upload tile is.
 */
export const EARLY_ROOM_PHOTO_KEY = "__zyvEarlyRoomPhoto";
export const ROOM_PHOTO_INPUT_ID = "room-photo-input";

export const EARLY_ROOM_PHOTO_SCRIPT = `document.addEventListener("change",function(e){var t=e.target;if(t&&t.id==="${ROOM_PHOTO_INPUT_ID}"&&t.files&&t.files[0]){window.${EARLY_ROOM_PHOTO_KEY}=t.files[0]}},true);`;

/** The stashed file, if any, taken exactly once. */
export function takeEarlyRoomPhoto(): File | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const f = w[EARLY_ROOM_PHOTO_KEY];
  delete w[EARLY_ROOM_PHOTO_KEY];
  return f instanceof File ? f : null;
}
