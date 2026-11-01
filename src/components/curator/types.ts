export type ZTurn = { role: "curator" | "client"; text: string };

export type ZAnalysis = {
  roomType: string;
  summary: string;
  palette: string[];
  moodWords: string[];
  suggestedPurpose: string;
  imageKind?: "room" | "inspiration";
};

export type ZPick = {
  handle: string;
  title: string;
  flatUrl: string | null;
  flatAlt: string;
  fromPricePerSqft: number | null;
  rationale: string;
  url: string;
  /** Samples are offered on one collection today — see SAMPLE_COLLECTION_TAGS.
   *  Optional so an older cached session (localStorage) simply hides the CTA. */
  sampleable?: boolean;
};

export type ZStage = "start" | "upload" | "reading" | "chat" | "curating" | "result";

export type CuratorSession = {
  stage: ZStage;
  photos: { room?: string; wide?: string };
  analysis?: ZAnalysis | null;
  transcript: ZTurn[];
  answers: Record<string, string>;
  currentSlotId?: string | null;
  asked: string[];
  picks?: ZPick[];
  note?: string;
};

export const CURATION_KEY = "zyvorah:curation";

export function emptySession(): CuratorSession {
  return { stage: "start", photos: {}, transcript: [], answers: {}, asked: [], currentSlotId: null };
}
