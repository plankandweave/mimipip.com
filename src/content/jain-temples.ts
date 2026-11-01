export const JAIN_DESIGNS = ([] as string[][]).map(([slug, name, description], i) => ({
  slug, name, description, handle: `jain-temples-${slug}`,
  surface: i < 8 ? "wall" as const : "ceiling" as const,
  flat: `https://zyvorah.com/jain-temples/${slug}/flat.jpg`,
  render: `https://zyvorah.com/jain-temples/${slug}/render.jpg`,
}));
export const JAIN_RESPECT = "We have approached this collection with care and respect for Jain traditions, while recognising that we may not have understood every detail correctly. If you notice an omission, an inaccuracy, or something we could learn from, we welcome your guidance and will review it thoughtfully and make appropriate corrections. These decorative artworks have not been verified by a religious authority. Final selection, placement and any religious interpretation should be reviewed with the temple’s authorised representatives before use.";
export const JAIN_SHORT_RESPECT = "Created with care and respect. This decorative artwork has not been verified by a religious authority. We welcome your guidance and will review suggested corrections.";
