import { NextResponse } from "next/server";
import { audioExtension, transcribeAudio } from "@/lib/transcribe";
import { allowConceptRequest } from "@/lib/concept-request";
import {
  CONCEPT_TRANSCRIPTION_MODEL,
  conceptTranscriptionPrompt,
  isConceptTranscriptionLanguage,
} from "@/lib/concept-transcription";
import { reviewConceptTranscript } from "@/lib/concept-transcript-review";
export const maxDuration = 120;
export async function POST(req: Request) {
  if (!(await allowConceptRequest(req, "voice", 12)))
    return NextResponse.json(
      {
        error:
          "Please wait before recording again. You can still type your message.",
      },
      { status: 429 },
    );
  if (Number(req.headers.get("content-length")) > 13 * 1024 * 1024)
    return NextResponse.json(
      { error: "Please keep each recording under 3 minutes." },
      { status: 413 },
    );
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  const lang = String(form?.get("language") || "en");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > 12 * 1024 * 1024 ||
    !audioExtension(file.type) ||
    !isConceptTranscriptionLanguage(lang)
  )
    return NextResponse.json(
      { error: "Use a supported audio recording under 12 MB." },
      { status: 400 },
    );
  const result = await transcribeAudio(
    await file.arrayBuffer(),
    `brief.${audioExtension(file.type)}`,
    file.type,
    {
      language: lang,
      model: CONCEPT_TRANSCRIPTION_MODEL,
      prompt: conceptTranscriptionPrompt(lang),
    },
  );
  if (!result.ok)
    return NextResponse.json(
      {
        error:
          "We couldn’t transcribe this recording just now. Retry the recording or type your message.",
      },
      { status: 503 },
    );
  const reviewedText = await reviewConceptTranscript(result.text, lang);
  return NextResponse.json(
    { text: reviewedText },
    { headers: { "Cache-Control": "no-store" } },
  );
}
