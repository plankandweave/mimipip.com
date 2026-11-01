import "server-only";

import {
  CONCEPT_TRANSCRIPT_REVIEW_MODEL,
  conceptTranscriptReviewInstruction,
} from "@/lib/concept-transcription";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 30_000;

/**
 * Repair only obvious recognition errors in a concept brief. Review is
 * deliberately best-effort: transcription remains useful even if this second
 * request times out or is unavailable.
 */
export async function reviewConceptTranscript(
  transcript: string,
  language: string,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !transcript.trim()) return transcript;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONCEPT_TRANSCRIPT_REVIEW_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: conceptTranscriptReviewInstruction(language),
          },
          { role: "user", content: transcript.slice(0, 12_000) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `[concept-transcript-review] ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`,
      );
      return transcript;
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() || transcript;
  } catch (error) {
    console.error("[concept-transcript-review] review unavailable", error);
    return transcript;
  }
}
