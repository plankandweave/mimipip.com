// What the Library knows about a film beyond the file: where it has been
// published (with proof), and whether it is cleared for public use. Shared by
// the Library tab and the library API. Nothing here takes anyone's word for
// it — a post is a link the server checks, a status is computed from those
// checks, and a clearance is Roheena's, with written evidence
// (Roheena, 28 Sep 2026; account premise: verify, then trust the record).

export type Platform = "youtube" | "instagram" | "amazon" | "meta";

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  amazon: "Amazon",
  meta: "Meta ads",
};

export type Post = {
  id: string;
  platform: Platform;
  url: string;
  recorded_at: string;
  recorded_by: string;
  verified: boolean;
  verified_at?: string;
  /** What the platform said, e.g. { videoId, channelId, privacyStatus }. */
  evidence?: Record<string, string>;
  /** Why it is not verified yet, in words. */
  unverified_reason?: string;
  removed_at?: string;
  removed_by?: string;
};

export type ClearanceItem = "voice" | "music" | "listening";
export type ClearanceState = "pending" | "cleared" | "n/a";
export type Clearance = Record<ClearanceItem, { state: ClearanceState; cleared_at?: string; cleared_by?: string; evidence?: string }>;

export const CLEARANCE_ITEMS: { key: ClearanceItem; label: string; ask: string }[] = [
  { key: "voice", label: "Voice licence", ask: "e.g. regenerated on the paid ElevenLabs plan, 29 Sep" },
  { key: "music", label: "Music licence", ask: "e.g. licence number or library and track ID" },
  { key: "listening", label: "Listening review", ask: "e.g. listened on headphones and phone, 29 Sep" },
];

export const STATUS = {
  none: "not been posted yet",
  unproven: "partly posted",
  posted: "posted",
} as const;

/** What a person reads for each stored status. */
export const STATUS_LABEL: Record<string, string> = {
  [STATUS.none]: "Not posted",
  [STATUS.unproven]: "Recorded, unverified",
  [STATUS.posted]: "Posted",
};

/** Roheena's addresses — the only person who may clear a film. */
const APPROVER = /^roheena@(zyvorah\.com|plankandweave\.com|magnitudegroup\.in)$/i;
export const canClear = (email: string | null | undefined) => !!email && APPROVER.test(email);

/** Saving a finished film is Roheena's approval of its final picture, sound,
 * and usage rights. Keep that attestation on the row so the green badge has
 * an owner and a reason, including when the Library is read later. */
export function clearanceOnApprovedUpload(email: string, language: string, now: string): Clearance {
  if (!canClear(email)) throw new Error("Only Roheena can approve a film for the Library.");
  const approved = (evidence: string) => ({ state: "cleared" as const, cleared_at: now, cleared_by: email, evidence });
  return {
    voice: language === "none"
      ? { state: "n/a", cleared_at: now, cleared_by: email, evidence: "No spoken voice in this film." }
      : approved("Roheena confirmed voice usage rights by approving and saving this finished film."),
    music: approved("Roheena confirmed music usage rights by approving and saving this finished film."),
    listening: approved("Roheena confirmed final picture and sound review by approving and saving this finished film."),
  };
}

export function normaliseClearance(raw: unknown): Clearance {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Clearance>;
  const item = (k: ClearanceItem) => {
    const v = c[k];
    const state: ClearanceState = v?.state === "cleared" || v?.state === "n/a" ? v.state : "pending";
    return { ...(v ?? {}), state };
  };
  return { voice: item("voice"), music: item("music"), listening: item("listening") };
}

/** The items still standing between this film and the public. */
export const pendingClearance = (c: Clearance) => CLEARANCE_ITEMS.filter((i) => c[i.key].state === "pending");
export const isCleared = (c: Clearance) => pendingClearance(c).length === 0;

/** A post counts as proven when the platform confirmed it AND, where the
 *  platform tells us, it is public. A private YouTube video is ours but is
 *  not in front of anyone yet. */
export const isProven = (p: Post) => p.verified && p.evidence?.privacyStatus !== "private" && p.evidence?.privacyStatus !== "unlisted";

export function deriveStatus(posts: Post[]): string {
  if (posts.length === 0) return STATUS.none;
  return posts.every(isProven) ? STATUS.posted : STATUS.unproven;
}

export function asPosts(raw: unknown): Post[] {
  return Array.isArray(raw) ? (raw as Post[]).filter((p) => p && typeof p.url === "string") : [];
}

/** Which platform a link belongs to, and the id the platform knows it by.
 *  A link from anywhere else is refused: the Library records publications,
 *  not bookmarks. */
export function parsePostUrl(input: string): { platform: Platform; url: string; ref?: string } | { error: string } {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return { error: "That is not a link. Paste the full address, starting https://" }; }
  if (url.protocol !== "https:") return { error: "The link must start with https://" };
  const host = url.hostname.replace(/^(www|m)\./, "");
  const clean = url.toString();
  if (host === "youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be"
      ? url.pathname.slice(1)
      : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1] ?? url.searchParams.get("v") ?? "";
    if (!/^[\w-]{11}$/.test(id)) return { error: "That YouTube link does not name a video." };
    return { platform: "youtube", url: clean, ref: id };
  }
  if (host === "instagram.com") {
    const code = url.pathname.match(/^\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/)?.[1];
    if (!code) return { error: "That Instagram link does not name a post or Reel." };
    return { platform: "instagram", url: clean, ref: code };
  }
  if (/^amazon\.(in|com)$/.test(host)) return { platform: "amazon", url: clean };
  if (host === "facebook.com" || host === "fb.com" || host === "business.facebook.com") return { platform: "meta", url: clean };
  return { error: "Only YouTube, Instagram, Amazon and Meta links can be recorded." };
}
