// The ears and the voice of every Zyvorah Vapi assistant, in one place.
//
// Two assistants now exist: the inbound concierge, provisioned once by
// scripts/vapi-setup.ts, and the OUTBOUND follow-up caller, which is built
// fresh for every call as a transient assistant by src/lib/voice-followup.ts.
// Both must sound like the same brand and hear Indian callers equally well, so
// the transcriber and voice live here and both read them. Each setting's WHY is
// unchanged from where it was learned (vapi-setup.ts, September 2026).
//
// Pure and dependency-free on purpose: vapi-setup.ts is a plain tsx script,
// not part of the Worker bundle, and must be able to import this.

/** Speech-to-text. Reads the env at CALL time, exactly as vapi-setup did. */
export function vapiTranscriber() {
  // nova-3 "multi": Deepgram's newest model — noticeably better far-field/noisy
  // capture (laptop mics, speakerphone) than nova-2, which was registering the
  // caller's short answers as silence mid-call. "multi" also covers the
  // Hindi-English code-switching Indian callers naturally use, replacing the
  // old nova-2 en-IN accent handling. smartFormat cleans up numbers (wall
  // sizes, prices) in the transcript the brain receives.
  return {
    provider: "deepgram",
    model: process.env.VAPI_STT_MODEL ?? "nova-3",
    language: process.env.VAPI_TRANSCRIBER_LANG ?? "multi",
    smartFormat: true,
  };
}

/** Text-to-speech. Reads the env at CALL time, exactly as vapi-setup did. */
export function vapiVoice() {
  return {
    provider: process.env.VAPI_VOICE_PROVIDER ?? "vapi",
    // "Neha" (Indian-English) is a retired legacy voice; "Elliot" is a current,
    // supported VAPI voice. Swap in the dashboard or via VAPI_VOICE_ID.
    voiceId: process.env.VAPI_VOICE_ID ?? "Elliot",
    // Pronunciation fix: TTS otherwise clips "Zyvorah" to "Zivar". Respell it
    // phonetically (zih-VOR-ah) before it reaches the voice.
    chunkPlan: {
      formatPlan: {
        replacements: [{ type: "exact", key: "Zyvorah", value: "Zivora" }],
      },
    },
  };
}
