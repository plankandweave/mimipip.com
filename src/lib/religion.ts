// Reviewed against the live canvas catalogue, 15 October 2026. Handles alone
// can be misleading: vishnu-s-grace depicts Krishna, divine-lotus Balaji.
export const RELIGIONS = [
  { slug: "hinduism", label: "Hinduism" },
  { slug: "buddhism", label: "Buddhism" },
  { slug: "jainism", label: "Jainism" },
  { slug: "sikhism", label: "Sikhism" },
  { slug: "christianity", label: "Christianity" },
  { slug: "islam", label: "Islam" },
  { slug: "zoroastrianism", label: "Parsi · Zoroastrianism" },
  { slug: "judaism", label: "Judaism" },
  { slug: "bahai", label: "Bahá’í Faith" },
] as const;

export const HINDU_SUBJECTS = [
  { slug: "ganesha", label: "Ganesha" },
  { slug: "shiva", label: "Shiva" },
  { slug: "krishna", label: "Krishna" },
  { slug: "balaji", label: "Balaji · Venkateswara" },
  { slug: "vishnu", label: "Vishnu · Narayana" },
  { slug: "gau-mata", label: "Gau Mata" },
  { slug: "sacred-symbols", label: "Sacred stories & symbols" },
] as const;

export const FAITH_SUBJECTS: Record<string, readonly { slug: string; label: string }[]> = {
  hinduism: HINDU_SUBJECTS,
  buddhism: [{slug:"buddha",label:"Buddha"},{slug:"symbols",label:"Symbols & teachings"},{slug:"sacred-spaces",label:"Sacred places"},{slug:"sacred-life",label:"Monastic life"}],
  jainism: [{slug:"neminatha",label:"Neminatha"},{slug:"padmaprabha",label:"Padmaprabha"},{slug:"chandraprabha",label:"Chandraprabha"},{slug:"shantinatha",label:"Shantinatha"},{slug:"mahavira",label:"Mahavira"},{slug:"adinatha",label:"Adinatha"},{slug:"parshvanatha",label:"Parshvanatha"},{slug:"symbols",label:"Symbols & teachings"},{slug:"sacred-spaces",label:"Sacred places"},{slug:"sacred-life",label:"Contemplative life"}],
  sikhism: [{slug:"guru-nanak",label:"Guru Nanak"},{slug:"guru-gobind-singh",label:"Guru Gobind Singh"},{slug:"sacred-spaces",label:"Gurdwaras & sacred places"},{slug:"sacred-life",label:"Seva & shared life"}],
  christianity: [{slug:"jesus",label:"Jesus Christ"},{slug:"mary",label:"Mary"},{slug:"saint-francis",label:"Saint Francis"},{slug:"symbols",label:"Christian symbols"},{slug:"sacred-stories",label:"Sacred stories"}],
  islam: [{slug:"sacred-spaces",label:"Sacred architecture"},{slug:"gardens-geometry",label:"Gardens & geometry"}],
  zoroastrianism: [{slug:"symbols",label:"Values & symbols"},{slug:"sacred-spaces",label:"Sacred places"},{slug:"heritage",label:"Parsi heritage"}],
  judaism: [{slug:"symbols",label:"Symbols & teachings"},{slug:"sacred-spaces",label:"Sacred places"},{slug:"sacred-life",label:"Traditions & shared life"}],
  bahai: [{slug:"sacred-spaces",label:"Houses of Worship & sacred places"},{slug:"gardens",label:"Gardens & diversity"},{slug:"unity-service",label:"Unity & service"}],
};

export type ReligionSlug = typeof RELIGIONS[number]["slug"];
export type ReligiousIdentity = { faith: ReligionSlug; subject: string | null };

export function religiousIdentity(handle: string, tags: string[]): ReligiousIdentity | null {
  // Explicit tags take precedence for new artwork. Never infer faith from a
  // generic Spiritual, Lotus, Mandala, Buddha, or Indian Ethnic tag.
  const faith = RELIGIONS.find((r) => tags.some((t) => t.toLowerCase() === `religion:${r.slug}`));
  if (faith) {
    const subject = tags.find((t) => /^deity:/i.test(t))?.slice(6).trim().toLowerCase() || null;
    return { faith: faith.slug, subject };
  }
  let subject: string | null = null;
  if (handle.startsWith("dwadasha-") || handle.startsWith("ganesha-")) subject = "ganesha";
  else if (handle === "maharaja-s-procession" || handle.startsWith("shiva-") || handle === "divine-reverie") subject = "shiva";
  else if (["vishnu-s-grace", "milan"].includes(handle)) subject = "krishna";
  else if (["divine-balaji", "divine-balaji-ii", "divine-lotus"].includes(handle)) subject = "balaji";
  else if (handle === "temple-majesty-ii") subject = "vishnu";
  else if (handle.startsWith("sacred-bovine-") || handle === "sacred-mother-calf") subject = "gau-mata";
  else if (["karma", "matsya", "kaalchakra"].includes(handle)) subject = "sacred-symbols";
  return subject ? { faith: "hinduism", subject } : null;
}

export const RELIGION_PATH = "/wall-art/religion";
export function religionHref(faith?: string, subject?: string, page?: number, format?: string): string {
  const params = new URLSearchParams();
  if (faith) params.set("faith", faith);
  if (subject) params.set("deity", subject);
  if (format) params.set("format", format);
  if (page && page > 1) params.set("page", String(page));
  return `${RELIGION_PATH}${params.size ? `?${params}` : ""}`;
}
