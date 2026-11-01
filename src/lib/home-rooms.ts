import { SCENARIOS } from "./studio-scenes";

/**
 * The room collections the header's Homes door fronts ("By Room").
 *
 * Kind "room" spans every scene the studio renders — hotel lobbies, cafés,
 * gyms and lift lobbies included. Those have their own audience doors on the
 * rail, so Homes lists only the rooms of somebody's own home, by allow-list:
 * a new room collection is NOT auto-visible here. Every room, commercial
 * included, still lists on /rooms behind "See all".
 *
 * The allow-list drifts: Piano Rooms went live as a room collection and sat
 * on /rooms for weeks while the Homes menu never showed it (founder,
 * 12 October 2026). `home-rooms.test.ts` now fails when a studio scene
 * classed Residential or Kids & Family sells into a collection this set does
 * not carry, so the next room cannot be missed the same way.
 */
export const HOME_ROOM_HANDLES = new Set([
  "living-room-wallpaper",
  "bedroom-wallpaper",
  "kids-wallpapers",
  "baby-nursery-wallpapers",
  "pooja-room-wallpaper",
  "home-office-wallpaper",
  "piano-rooms",
  "dining-room-wallpaper",
  "foyer",
  "kitchen-wallpaper",
  "teen-wallpaper",
  "toddler-wallpaper",
  "entertainment-media-room",
  "library-reading-corners",
  "games-room",
  // A surface rather than a room, but a home one: the founder wants it in
  // the Homes menu beside the rooms (12 October 2026). It is filed as a STYLE
  // collection (kind "category"), not a room, so homeMenuCollections below
  // also looks outside the room list for it.
  "ceiling-wallpaper",
]);

/**
 * The Homes menu's collections: the home rooms in their own position order,
 * then any allow-listed home collection filed under another kind (the ceiling
 * range is a style collection). Reading only kind "room" is what would have
 * left Ceiling off the menu while the allow-list said it was on.
 */
export function homeMenuCollections<T extends { handle: string }>(rooms: T[], otherKinds: T[]): T[] {
  const fromRooms = rooms.filter((c) => HOME_ROOM_HANDLES.has(c.handle));
  const taken = new Set(fromRooms.map((c) => c.handle));
  const fromOthers = otherKinds.filter((c) => HOME_ROOM_HANDLES.has(c.handle) && !taken.has(c.handle) && taken.add(c.handle));
  return [...fromRooms, ...fromOthers];
}

/** The studio's own answer to "which room collections are a home": every
 *  scene classed Residential or Kids & Family that sells into a collection. */
export function homeRoomCollectionsFromScenes(): string[] {
  const handles = new Set<string>();
  for (const s of SCENARIOS) {
    if (s.collection && (s.spaceCategory === "Residential" || s.spaceCategory === "Kids & Family")) {
      handles.add(s.collection);
    }
  }
  return [...handles];
}
