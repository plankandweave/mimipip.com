// Timbre — the Zyvorah house voice (founder, 12 October 2026). Pure rules.
//
// "I don't want to use any standard voices there, and English should always
// be great. The same voice should be able to speak in Hindi and always be
// able to put it in the local language." One designed voice: a woman in her
// mid-thirties, Indian English, calm, unhurried. It is never the founder's
// voice — that is Lumen's, for the presentation film — and it never changes
// from one wall to the next. The voice is designed from the brief below and
// chosen by the founder on the desk; timbre.ts does the speaking. No node
// imports here: the public Sonar player reads this module too.

export const TIMBRE_VERSION = "1.0";

/** The brief the voice is designed from. Changing it designs a different
 *  voice, so it is a decision, not a tweak. */
export const VOICE_BRIEF =
  "A woman in her mid-thirties from India speaking Indian English: calm, unhurried, warm and precise, " +
  "the voice of a well-read gallerist walking a guest through a building. Low-to-medium pitch, clear diction, " +
  "no breathiness, no sales energy, never sing-song. Equally at home in Hindi, Tamil and Kannada.";

/** What the candidates read aloud when they are designed — the register the
 *  voice will live in, long enough for the design to settle (the API asks
 *  for 100 to 1,000 characters). */
export const DESIGN_SAMPLE =
  "Welcome. You are standing in front of a wall that tells the story of this campus. " +
  "Look at the river first, the way it enters from the left and widens as it reaches the door. " +
  "Every colour here was chosen for this building and for the people who walk past it each morning. " +
  "Scan the code again whenever you like, and I will tell you a little more.";

export type TimbreLanguage = "en" | "hi" | "ta" | "kn" | "te" | "mr" | "ml";

/** Which model speaks which language. Multilingual v2 is the steadier voice
 *  and carries English, Hindi and Tamil; v3 is what reaches Kannada,
 *  Telugu, Marathi and Malayalam. The voice id is the same on both. */
export const LANGUAGES: Record<TimbreLanguage, { name: string; native: string; model: "eleven_multilingual_v2" | "eleven_v3"; sample: string }> = {
  en: { name: "English", native: "English", model: "eleven_multilingual_v2", sample: "Welcome to Zyvorah. Let me show you the wall." },
  hi: { name: "Hindi", native: "हिन्दी", model: "eleven_multilingual_v2", sample: "ज़ायवोरा में आपका स्वागत है। आइए, मैं आपको यह दीवार दिखाती हूँ।" },
  ta: { name: "Tamil", native: "தமிழ்", model: "eleven_multilingual_v2", sample: "ஸைவோராவிற்கு வரவேற்கிறோம். இந்தச் சுவரை நான் உங்களுக்குக் காட்டுகிறேன்." },
  kn: { name: "Kannada", native: "ಕನ್ನಡ", model: "eleven_v3", sample: "ಝೈವೋರಾಗೆ ಸ್ವಾಗತ. ಈ ಗೋಡೆಯನ್ನು ನಾನು ನಿಮಗೆ ತೋರಿಸುತ್ತೇನೆ." },
  te: { name: "Telugu", native: "తెలుగు", model: "eleven_v3", sample: "జైవోరాకు స్వాగతం. ఈ గోడను నేను మీకు చూపిస్తాను." },
  mr: { name: "Marathi", native: "मराठी", model: "eleven_v3", sample: "झायवोरामध्ये आपले स्वागत आहे. ही भिंत मी तुम्हाला दाखवते." },
  ml: { name: "Malayalam", native: "മലയാളം", model: "eleven_v3", sample: "സൈവോറയിലേക്ക് സ്വാഗതം. ഈ ചുമര് ഞാൻ നിങ്ങൾക്ക് കാണിച്ചുതരാം." },
};

export const isTimbreLanguage = (s: string): s is TimbreLanguage => s in LANGUAGES;

/** The campus language of a Blueprint, as Timbre will greet in it; English
 *  is always offered beside it. */
export function languagesForCampus(campusLanguage: string): TimbreLanguage[] {
  const l = isTimbreLanguage(campusLanguage) ? campusLanguage : "en";
  return l === "en" ? ["en", "hi"] : ["en", l, "hi"].filter((x, i, a) => a.indexOf(x) === i) as TimbreLanguage[];
}

/** TTS clips unfamiliar names; the brand's own fix (vapi-speech.ts) respells
 *  the name for the voice only. Stored text keeps the real spelling. */
export function spokenText(text: string): string {
  return text.replace(/Zyvorah/g, "Zivorah").trim();
}

/** Voice settings per model. v3 accepts only 0, 0.5 or 1 for stability. */
export function voiceSettings(model: "eleven_multilingual_v2" | "eleven_v3") {
  return model === "eleven_v3"
    ? { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true }
    : { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.95 };
}

/** The same line in the same voice and language is spoken once: this is
 *  what timbre.ts hashes into the line's key. */
export function lineKeyMaterial(voiceId: string, language: string, text: string): string {
  return `${voiceId}\n${language}\n${text.trim()}`;
}

export const MAX_LINE_CHARS = 1200;

export function lineReady(text: string): { ok: true } | { ok: false; reason: string } {
  const t = text.trim();
  if (!t) return { ok: false, reason: "Write the line first." };
  if (t.length > MAX_LINE_CHARS) return { ok: false, reason: `Too long for one line (${t.length} characters; ${MAX_LINE_CHARS} at most). Split it.` };
  return { ok: true };
}

export const candidatePath = (generatedVoiceId: string) => `timbre/candidates/${generatedVoiceId.replace(/[^a-z0-9]+/gi, "-")}.mp3`;
export const linePath = (key: string) => `timbre/lines/${key}.mp3`;

/** Timbre's own name for itself on ElevenLabs. */
export const VOICE_NAME = "Timbre · Zyvorah house voice";
