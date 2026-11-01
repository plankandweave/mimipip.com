import { roomForIdeasWalls } from "@/content/projects/room-for-ideas";
import { mediaUrl } from "./project-media";

// The existing material row, never a second Soft Matte product or customer choice.
export const CONCEPT_MATERIAL = "smooth-matt";
export const CONCEPT_SLUG = "room-for-ideas";
export const CONCEPT_TITLE = "Room for Ideas";
export const CONCEPT_PATH = `/office-concepts/${CONCEPT_SLUG}`;
// Case studies also run on the outreach host, which intentionally has no shop.
export const CONCEPT_SHOP_URL = `https://zyvorah.com${CONCEPT_PATH}`;
export const MAX_CONCEPT_WALLS = 120;
export const MIN_WALL_CM = 30;
export const MAX_WALL_WIDTH_CM = 1500;
export const MAX_WALL_HEIGHT_CM = 500;

export const CONCEPT_DESIGNS = roomForIdeasWalls.map((wall) => ({
  ...wall,
  handle: `room-for-ideas-${wall.number}`,
  imageUrl: mediaUrl(wall.artwork),
  roomUrl: mediaUrl(wall.room),
}));
export type ConceptOffer = {
  handle: string; number: string; title: string; space: string;
  imageUrl: string; roomUrl: string; rate: number; sourceW: number; sourceH: number;
  requiresPreparation?: boolean;
  finishNote?: string;
  commerce?: {available:boolean;exclusiveAvailable:boolean;premiumPercent:number;historyVerified:boolean;priorOrders:number;priorCustomers:number};
};
export type ConceptWall = {
  id: string;
  handle: string;
  roomLabel: string;
  widthCm: number;
  heightCm: number;
  offsetX: number;
  offsetY: number;
};

export function validWallSize(w: ConceptWall) {
  return Number.isFinite(w.widthCm) && Number.isFinite(w.heightCm) &&
    w.widthCm >= MIN_WALL_CM && w.widthCm <= MAX_WALL_WIDTH_CM &&
    w.heightCm >= MIN_WALL_CM && w.heightCm <= MAX_WALL_HEIGHT_CM;
}
