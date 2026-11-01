// What a viewer HEARS in a Library film. Shared by the Library tab and the
// library API. 'none' is a real answer — music and on-screen copy only — not
// a gap; a film nobody has declared yet has no language at all (null).

export type FilmLanguage = "english" | "hindi" | "marathi" | "none";

export const LANGUAGES: { key: FilmLanguage; label: string }[] = [
  { key: "english", label: "English" },
  { key: "hindi", label: "Hindi" },
  { key: "marathi", label: "Marathi" },
  { key: "none", label: "No voice" },
];

export const isLanguage = (v: unknown): v is FilmLanguage =>
  typeof v === "string" && LANGUAGES.some((l) => l.key === v);
