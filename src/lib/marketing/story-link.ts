// THE STORY LINK RULE (founder, 6 October 2026, confirmed 9 October): a
// Story carries a Link sticker to its exact design when one can be attached,
// and is POSTED WITHOUT ONE rather than held when it cannot — "optional
// between not posting and posting with the link; I want it posted". The Graph
// publisher cannot attach a sticker, so it publishes approved Stories as they
// are. The exact-design destination is still recorded on the plan item for
// the native route. Historical hold text, kept so old ledger rows can be
// recognised and retried:
export const STORY_LINK_HOLD = "Story held: add a clickable Link sticker to the exact wallpaper in Instagram. Automatic Story publishing cannot attach the sticker.";

export function storyProductUrl(handle: string | null | undefined): string | null {
  if (!handle || handle.startsWith("plate-") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) return null;
  return `https://zyvorah.com/products/${handle}`;
}
