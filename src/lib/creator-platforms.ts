// The platforms a creator can pitch from. The /collaborate form used to demand
// an Instagram handle, which turned away creators who work on TikTok or YouTube
// (14 October 2026; Pinterest was considered and declined by the founder). Each platform knows what a
// handle looks like and where the profile lives, so the screener can open it.

export const CREATOR_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type CreatorPlatform = (typeof CREATOR_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<CreatorPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const HANDLE_RE: Record<CreatorPlatform, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  youtube: /^[A-Za-z0-9._-]{3,30}$/,
};

export function creatorPlatform(v: unknown): CreatorPlatform {
  return (CREATOR_PLATFORMS as readonly string[]).includes(String(v)) ? (v as CreatorPlatform) : "instagram";
}

/** "@name" → "name", or null when it is not a handle on that platform. */
export function cleanCreatorHandle(platform: CreatorPlatform, v: unknown): string | null {
  const h = String(v ?? "").trim().replace(/^@/, "");
  return HANDLE_RE[platform].test(h) ? h : null;
}

export function profileUrl(platform: CreatorPlatform, handle: string): string {
  const h = encodeURIComponent(handle);
  switch (platform) {
    case "instagram": return `https://www.instagram.com/${h}/`;
    case "tiktok": return `https://www.tiktok.com/@${h}`;
    case "youtube": return `https://www.youtube.com/@${h}`;
  }
}
