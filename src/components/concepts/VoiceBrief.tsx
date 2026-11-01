"use client";
import { useEffect, useRef, useState } from "react";
import { toIndianMobile } from "@/lib/phone";
import { gaEvent } from "@/lib/ga";
import { conversionLead } from "@/lib/conversions";
export function VoiceBrief({ slug, title }: { slug: string; title: string }) {
  const [brief, setBrief] = useState("");
  const [language, setLanguage] = useState("en");
  const [state, setState] = useState<
    "idle" | "recording" | "transcribing" | "sending" | "done"
  >("idle");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const requestId = useRef("");
  const busy = useRef(false);
  useEffect(() => { gaEvent("concept_brief_open", { concept_slug: slug }); }, [slug]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function transcribe(blob: Blob) {
    setState("transcribing");
    setError("");
    const form = new FormData();
    form.append(
      "audio",
      blob,
      blob.type.includes("mp4") ? "brief.m4a" : "brief.webm",
    );
    form.append("language", language);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/concept-brief/transcribe", {
        method: "POST",
        body: form,
        signal: abort.current.signal,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error ||
            "Speech could not be transcribed. Retry or type your message.",
        );
      if (mounted.current) {
        setBrief((s) => [s.trim(), data.text].filter(Boolean).join(" "));
        setRecording(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Speech could not be transcribed. Your recording is available to retry.",
        );
    } finally {
      if (mounted.current) setState("idle");
    }
  }
  async function start() {
    if (busy.current) return;
    busy.current = true;
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Voice recording is unavailable in this browser. You can type here or use your phone keyboard’s microphone.",
        );
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      let bytes = 0;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 12 * 1024 * 1024 && rec.state === "recording") rec.stop();
        }
      };
      rec.onerror = () => {
        if (mounted.current)
          setError(
            "Recording was interrupted. Try again or type your message.",
          );
        mic.getTracks().forEach((t) => t.stop());
      };
      rec.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        mic.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType });
        setRecording(blob);
        void transcribe(blob);
      };
      rec.start(1000);
      setState("recording");
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 180000);
    } catch (e) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was not allowed. Enable it in your browser, or type below."
          : e instanceof Error
            ? e.message
            : "Could not start the microphone.",
      );
      setState("idle");
    } finally {
      busy.current = false;
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle" || busy.current) return;
    const fields = new FormData(event.currentTarget);
    const phone = toIndianMobile(fields.get("phone"));
    if (!phone) {
      setError(
        "Enter a valid 10-digit Indian mobile number, with or without +91.",
      );
      return;
    }
    busy.current = true;
    setState("sending");
    setError("");
    requestId.current ||= crypto.randomUUID();
    gaEvent("concept_brief_attempt", { concept_slug: slug });
    try {
      const response = await fetch("/api/concept-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId.current,
          conceptSlug: slug,
          name: fields.get("name"),
          phone,
          email: fields.get("email"),
          brief,
          language,
          wantsExclusive: fields.get("exclusive") === "on",
          website: fields.get("website"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Your request could not be saved. Please try again.",
        );
      setState("done");
      gaEvent("concept_brief_submitted", { concept_slug: slug });
      conversionLead({ leadType: "enquiry", topic: `concept:${slug}`, user: { email: String(fields.get("email") ?? ""), phone } });
    } catch (e) {
      gaEvent("concept_brief_failed", { concept_slug: slug });
      setError(
        e instanceof Error
          ? e.message
          : "Please try again. Your words are still here.",
      );
      setState("idle");
    } finally {
      busy.current = false;
    }
  }
  if (state === "done")
    return (
      <div
        role="status"
        className="mt-8 rounded-card border border-sage bg-sage/40 p-6 sm:p-8"
      >
        <h2 className="text-2xl leading-tight">Your request is with Zyvorah.</h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate">
          We’ve saved your words and your reference to {title}. Our team will
          contact you using the details you provided.
        </p>
      </div>
    );
  const field =
    "mt-2 h-12 w-full rounded-input border border-edge bg-white px-4 text-base outline-none transition focus:border-charcoal focus:ring-4 focus:ring-charcoal/5";
  const label = "block text-sm font-medium text-charcoal";
  return (
    <form
      onSubmit={submit}
      className="mt-8 overflow-hidden rounded-card border border-edge bg-surface shadow-[0_18px_60px_rgba(15,15,15,0.06)]"
    >
      <div className="p-5 sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-xl leading-tight">Tell us in your own words</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Mention what your space is used for, what you liked here, and
            anything you want us to include or avoid. You don’t need design
            terms or a finished plan.
          </p>
        </div>

        <div className="mt-6 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className={label}>
            Speaking language
            <select
              aria-label="Speaking language"
              className={`${field} cursor-pointer pr-10`}
              value={language}
              disabled={state !== "idle"}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {[
                ["en", "English"],
                ["hi", "हिन्दी"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          {state === "recording" ? (
            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-input bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 sm:w-auto"
              onClick={() => recorder.current?.stop()}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full bg-white"
              />
              Done speaking
            </button>
          ) : (
            <button
              type="button"
              disabled={state !== "idle"}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-input bg-[#176856] px-5 text-sm font-semibold text-white transition hover:bg-[#125446] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              onClick={() => void start()}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" />
              </svg>
              {brief ? "Add more by voice" : "Tap to speak"}
            </button>
          )}
        </div>

        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-input bg-wash px-4 py-3 text-sm leading-6 text-slate"
        >
          {state === "recording"
            ? "Recording… speak naturally. Up to 3 minutes at a time."
            : state === "transcribing"
              ? "Turning your words into text…"
              : "Speak or type in the language you’re comfortable with. Check the text before sending."}
        </p>

        <label className={`${label} mt-6`} htmlFor="concept-brief">
          Tell us about your space
        </label>
        <textarea
          id="concept-brief"
          className={`${field} min-h-48 resize-y py-3 leading-6`}
          rows={7}
          maxLength={12000}
          minLength={2}
          required
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Your words will appear here. You can also type or edit them."
        />
        <p className="mt-3 max-w-3xl text-xs leading-5 text-slate">
          Microphone starts only when you tap. Audio is sent to our
          transcription provider to create this text and is not stored by
          Zyvorah. Nothing is submitted to our team until you send your request.
        </p>
        {recording && state === "idle" && (
          <button
            type="button"
            className="mt-3 text-sm font-medium underline underline-offset-4"
            onClick={() => void transcribe(recording)}
          >
            Retry the last recording
          </button>
        )}
      </div>

      <div className="border-t border-edge p-5 sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-xl leading-tight">Your contact details</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Tell us where to follow up about your brief.
          </p>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className={label}>
            Name
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              className={field}
            />
          </label>
          <label className={label}>
            Phone number
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              maxLength={20}
              className={field}
            />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={200}
              className={field}
            />
          </label>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-input bg-wash p-4 text-sm leading-6">
          <input
            name="exclusive"
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-charcoal"
          />
          <span>I’m interested in an exclusive design for this project.</span>
        </label>

        <div hidden aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-input bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 border-t border-edge bg-wash/45 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <p className="max-w-xl text-sm leading-6 text-slate">
          We’ll use these details to respond to your request. We’ll agree the
          scope and price with you before work begins.
        </p>
        <button
          type="submit"
          disabled={state !== "idle"}
          className="inline-flex h-12 w-full shrink-0 items-center justify-center rounded-input border border-charcoal bg-charcoal px-6 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {state === "sending" ? "Sending…" : "Send your request"}
        </button>
      </div>
    </form>
  );
}
