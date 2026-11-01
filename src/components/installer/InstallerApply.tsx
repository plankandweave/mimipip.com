"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Lang = "en" | "hi";

/** Fields the RPC can reject. Anything else is treated as a server fault. */
const ERR_FIELDS = [
  "name",
  "phone",
  "city",
  "pincode",
  "aadhaar",
  "pan",
  "work_photos",
  "selfie",
  "video",
  "consent",
] as const;
type ErrField = (typeof ERR_FIELDS)[number];

type Copy = {
  eyebrow: string;
  h1: string;
  sub: string;
  reach: string;

  howTitle: string;
  steps: { t: string; d: string }[];

  s1: string;
  fName: string;
  fPhone: string;
  fEmail: string;
  fCity: string;
  fPin: string;
  fYears: string;
  optional: string;
  phoneHint: string;

  s2: string;
  fAadhaar: string;
  fPan: string;
  idNote: string;

  s3: string;
  workHint: string;
  addPhoto: string;
  uploading: string;
  uploadFailed: string;
  retry: string;
  remove: string;
  photoCount: (n: number) => string;

  s4: string;
  selfieHint: string;
  takeSelfie: string;
  capture: string;
  retake: string;
  cancel: string;
  selfieDone: string;
  cameraDenied: string;
  choosePhoto: string;

  s5: string;
  videoIntro: string;
  videoLine: (code: string) => string;
  startRecording: string;
  stopRecording: string;
  recording: (s: number) => string;
  tooShort: string;
  reviewHint: string;
  useVideo: string;
  recordAgain: string;
  videoDone: string;
  noCamera: string;

  consent: string;
  incomplete: string;
  submit: string;
  submitting: string;

  err: Record<ErrField, string>;
  errServer: string;

  okTitle: (ref: string) => string;
  okSub: string;
  dupTitle: (ref: string) => string;
};

const T: Record<Lang, Copy> = {
  en: {
    eyebrow: "Zyvorah installer network",
    h1: "Register as a Zyvorah Installer",
    sub: "Hang beautiful walls. Transparent per-square-foot payouts, released after the customer confirms a job well done.",
    reach:
      "We currently install in Bengaluru, Mumbai & Pune — but you can apply from any city in India. As Zyvorah reaches your city, verified installers get work first.",

    howTitle: "How it works",
    steps: [
      { t: "Apply", d: "10 minutes, from your phone" },
      { t: "Get verified", d: "We check your ID and work, then call you" },
      { t: "Start earning", d: "Jobs assigned in your city, paid per sq ft" },
    ],

    s1: "1 · About you",
    fName: "Full name",
    fPhone: "Mobile number",
    fEmail: "Email",
    fCity: "City",
    fPin: "Pincode",
    fYears: "Years of experience",
    optional: "optional",
    phoneHint: "10 digits — this is the number we will call you on.",

    s2: "2 · Identity",
    fAadhaar: "Aadhaar number",
    fPan: "PAN",
    idNote: "Kept private and used only to verify you. Never shown publicly.",

    s3: "3 · Your work",
    workHint: "Clear photos of finished walls you have installed.",
    addPhoto: "Add photo",
    uploading: "Uploading…",
    uploadFailed: "Upload failed",
    retry: "Try again",
    remove: "Remove",
    photoCount: (n) => `${n} of 4 photos added`,

    s4: "4 · Live selfie",
    selfieHint: "A clear photo of your face, taken right now.",
    takeSelfie: "Take selfie",
    capture: "Capture",
    retake: "Retake",
    cancel: "Cancel",
    selfieDone: "Selfie added",
    cameraDenied: "We could not open the camera. Choose a photo of yourself instead.",
    choosePhoto: "Choose photo",

    s5: "5 · Live video",
    videoIntro:
      "Record a short live video (5–30 seconds). Look into the camera and read this line aloud:",
    videoLine: (code) => `My name is …, I install wallpaper in …, and my code is ${code}.`,
    startRecording: "Start recording",
    stopRecording: "Stop recording",
    recording: (s) => `Recording · ${s}s of 30`,
    tooShort: "That was too short — please record at least 5 seconds.",
    reviewHint: "Watch it once — your face and the code should be clear.",
    useVideo: "Use this video",
    recordAgain: "Record again",
    videoDone: "Video added",
    noCamera:
      "Video must be recorded live on this device. Please open this page on a phone with a camera.",

    consent:
      "I confirm these details are mine and true, and I allow Zyvorah to use them only to verify me as an installer.",
    incomplete: "Complete the steps above to apply",
    submit: "Submit application",
    submitting: "Submitting…",

    err: {
      name: "Please enter your full name.",
      phone: "Enter a valid 10-digit mobile number.",
      city: "Please enter your city.",
      pincode: "Enter a valid 6-digit pincode.",
      aadhaar: "Enter a valid 12-digit Aadhaar number.",
      pan: "Enter a valid PAN, for example ABCDE1234F.",
      work_photos: "Please add all four photos of your work.",
      selfie: "Please take your live selfie.",
      video: "Please record your live video.",
      consent: "Please tick the confirmation to continue.",
    },
    errServer: "Something went wrong at our end. Please try again in a moment.",

    okTitle: (ref) => `Application received — your reference is ${ref}.`,
    okSub:
      "Keep this reference. We verify every application and call you on the number you gave — usually within a few days.",
    dupTitle: (ref) => `You've already applied — your reference is ${ref}. We're on it.`,
  },

  hi: {
    eyebrow: "ज़ायवोरा इंस्टॉलर नेटवर्क",
    h1: "ज़ायवोरा इंस्टॉलर रजिस्ट्रेशन",
    sub: "सुंदर दीवारें सजाइए। पारदर्शी प्रति-स्क्वायर-फ़ुट भुगतान, ग्राहक की संतुष्टि के बाद जारी।",
    reach:
      "अभी हम बेंगलुरु, मुंबई और पुणे में इंस्टॉल करते हैं — पर आप भारत के किसी भी शहर से आवेदन कर सकते हैं। ज़ायवोरा आपके शहर पहुँचते ही, सत्यापित इंस्टॉलरों को सबसे पहले काम मिलेगा।",

    howTitle: "यह कैसे काम करता है",
    steps: [
      { t: "आवेदन करें", d: "अपने फ़ोन से, बस 10 मिनट" },
      { t: "सत्यापन", d: "हम आपकी पहचान और काम जाँचते हैं, फिर कॉल करते हैं" },
      { t: "कमाई शुरू करें", d: "आपके शहर में काम, हर स्क्वायर फ़ुट का भुगतान" },
    ],

    s1: "1 · आपके बारे में",
    fName: "पूरा नाम",
    fPhone: "मोबाइल नंबर",
    fEmail: "ईमेल",
    fCity: "शहर",
    fPin: "पिनकोड",
    fYears: "अनुभव के वर्ष",
    optional: "वैकल्पिक",
    phoneHint: "10 अंक — हम इसी नंबर पर कॉल करेंगे।",

    s2: "2 · पहचान",
    fAadhaar: "आधार नंबर",
    fPan: "पैन",
    idNote: "गोपनीय रखा जाता है, केवल आपके सत्यापन के लिए। कभी सार्वजनिक नहीं होता।",

    s3: "3 · आपका काम",
    workHint: "आपकी लगाई हुई दीवारों की साफ़ तस्वीरें।",
    addPhoto: "फ़ोटो जोड़ें",
    uploading: "अपलोड हो रहा है…",
    uploadFailed: "अपलोड नहीं हुआ",
    retry: "फिर कोशिश करें",
    remove: "हटाएँ",
    photoCount: (n) => `4 में से ${n} फ़ोटो जुड़ीं`,

    s4: "4 · लाइव सेल्फ़ी",
    selfieHint: "आपके चेहरे की साफ़ तस्वीर, अभी ली गई।",
    takeSelfie: "सेल्फ़ी लें",
    capture: "कैप्चर करें",
    retake: "दोबारा लें",
    cancel: "रद्द करें",
    selfieDone: "सेल्फ़ी जुड़ गई",
    cameraDenied: "कैमरा नहीं खुल सका। इसके बजाय अपनी फ़ोटो चुनें।",
    choosePhoto: "फ़ोटो चुनें",

    s5: "5 · लाइव वीडियो",
    videoIntro:
      "एक छोटा लाइव वीडियो रिकॉर्ड करें (5–30 सेकंड)। कैमरे में देखकर यह पंक्ति ज़ोर से पढ़ें:",
    videoLine: (code) => `मेरा नाम … है, मैं … में वॉलपेपर लगाता/लगाती हूँ, और मेरा कोड ${code} है।`,
    startRecording: "रिकॉर्डिंग शुरू करें",
    stopRecording: "रिकॉर्डिंग रोकें",
    recording: (s) => `रिकॉर्डिंग · 30 में से ${s} सेकंड`,
    tooShort: "वीडियो बहुत छोटा था — कम से कम 5 सेकंड रिकॉर्ड करें।",
    reviewHint: "एक बार देख लें — आपका चेहरा और कोड साफ़ होना चाहिए।",
    useVideo: "यह वीडियो इस्तेमाल करें",
    recordAgain: "दोबारा रिकॉर्ड करें",
    videoDone: "वीडियो जुड़ गया",
    noCamera:
      "वीडियो इसी डिवाइस पर लाइव रिकॉर्ड होना ज़रूरी है। कृपया यह पेज कैमरे वाले फ़ोन पर खोलें।",

    consent:
      "मैं पुष्टि करता/करती हूँ कि ये विवरण मेरे हैं और सही हैं, और ज़ायवोरा को केवल इंस्टॉलर सत्यापन के लिए इनके उपयोग की अनुमति देता/देती हूँ।",
    incomplete: "आवेदन के लिए ऊपर के चरण पूरे करें",
    submit: "आवेदन भेजें",
    submitting: "भेजा जा रहा है…",

    err: {
      name: "कृपया अपना पूरा नाम भरें।",
      phone: "मान्य 10-अंकों का मोबाइल नंबर भरें।",
      city: "कृपया अपना शहर भरें।",
      pincode: "मान्य 6-अंकों का पिनकोड भरें।",
      aadhaar: "मान्य 12-अंकों का आधार नंबर भरें।",
      pan: "मान्य पैन भरें, जैसे ABCDE1234F।",
      work_photos: "कृपया अपने काम की चारों तस्वीरें जोड़ें।",
      selfie: "कृपया अपनी लाइव सेल्फ़ी लें।",
      video: "कृपया अपना लाइव वीडियो रिकॉर्ड करें।",
      consent: "जारी रखने के लिए पुष्टि पर टिक करें।",
    },
    errServer: "हमारी तरफ़ कुछ गड़बड़ हुई। कृपया थोड़ी देर में फिर कोशिश करें।",

    okTitle: (ref) => `आवेदन मिल गया — आपका रेफ़रेंस ${ref} है।`,
    okSub:
      "यह रेफ़रेंस संभाल कर रखें। हम हर आवेदन की जाँच करते हैं और आपके दिए नंबर पर कॉल करते हैं — आम तौर पर कुछ ही दिनों में।",
    dupTitle: (ref) => `आपका आवेदन पहले से है — रेफ़रेंस ${ref}। हम इस पर काम कर रहे हैं।`,
  },
};

const BUCKET = "installer-apps";
const PHONE_RE = /^[6-9][0-9]{9}$/;
const AADHAAR_RE = /^[2-9][0-9]{11}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PIN_RE = /^[1-9][0-9]{5}$/;
const MIN_SECONDS = 5;
const MAX_SECONDS = 30;

/** MediaRecorder containers in descending preference; mp4 is the iOS Safari path. */
const REC_MIMES = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

const FIELD =
  "h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal";

/**
 * Re-encode any picked/captured image to a modest JPEG. Always re-encodes (rather
 * than passing small files through) so the contentType we declare to storage is
 * truthful even when the source is PNG/HEIC, and so a 12MB phone photo never
 * reaches the 25MB per-file bucket cap.
 */
async function toJpeg(source: Blob, maxEdge: number, quality = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode"));
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.width * scale));
    cv.height = Math.max(1, Math.round(img.height * scale));
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      cv.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("encode");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Direct-to-bucket upload. The bucket is a strict write-once drop-box: the anon
 * key may only INSERT under `apps/` — it cannot overwrite, read, list or delete
 * (granting the SELECT that an upsert needs would make applicants' selfies and
 * liveness videos downloadable by anyone). So every attempt gets its OWN path
 * via `attemptPath()` and nothing is ever overwritten; a retake just leaves an
 * unused orphan and the submitted row records the final paths.
 */
async function putObject(path: string, body: Blob, contentType: string): Promise<void> {
  const { error } = await supabaseBrowser.storage
    .from(BUCKET)
    .upload(path, body, { contentType });
  if (error) throw error;
}

/** A unique object path per upload attempt — retakes never collide. */
function attemptPath(folder: string, base: string, ext: string): string {
  return `${folder}/${base}-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

function fourDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(1000 + (buf[0] % 9000));
}

function pickRecMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of REC_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Scroll target for a server-rejected field — plain ids, so no render-time refs. */
function anchorId(field: ErrField): string {
  return `ia-sec-${field}`;
}

type Slot = {
  status: "empty" | "uploading" | "done" | "error";
  path?: string;
  preview?: string;
};
const EMPTY_SLOTS: Slot[] = [
  { status: "empty" },
  { status: "empty" },
  { status: "empty" },
  { status: "empty" },
];

type Result = { reference: string; duplicate: boolean };
type ApplyResponse = { ok?: boolean; reference?: string; duplicate?: boolean; error?: string };

export function InstallerApply() {
  const [lang, setLang] = useState<Lang>("hi");
  const t = T[lang];

  // One folder per application session, minted lazily so the server render stays
  // deterministic.
  const sessionRef = useRef<string | null>(null);
  const folder = useCallback(() => {
    sessionRef.current ??= crypto.randomUUID();
    return `apps/${sessionRef.current}`;
  }, []);

  // Every preview URL we mint is tracked, so a half-finished application that
  // gets abandoned still releases its blobs.
  const objectUrls = useRef<Set<string>>(new Set());
  const trackUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  };
  const releaseUrl = (url?: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  };

  // ---- text fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [years, setYears] = useState("");
  const [aadhaar, setAadhaar] = useState(""); // display form: XXXX XXXX XXXX
  const [pan, setPan] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const aadhaarDigits = aadhaar.replace(/\D/g, "");

  // ---- work photos
  const [slots, setSlots] = useState<Slot[]>(EMPTY_SLOTS);

  // ---- selfie
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);
  const [selfieCam, setSelfieCam] = useState(false);
  const [selfieFallback, setSelfieFallback] = useState(false);
  const selfieStreamRef = useRef<MediaStream | null>(null);
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);

  // ---- liveness video
  const [code, setCode] = useState("");
  const [videoSupported, setVideoSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; mime: string } | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [challengeUsed, setChallengeUsed] = useState<string | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secondsRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- submission
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<ErrField | null>(null);
  const [serverError, setServerError] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const challengeLine = code ? t.videoLine(code) : "";

  // Challenge code + capability probe are client-only: producing them here
  // rather than in a useState initializer keeps the server render and the first
  // client render identical.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(fourDigitCode());
    setVideoSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        pickRecMime() !== null,
    );
  }, []);

  // Release every camera, timer and preview URL if the applicant navigates away
  // mid-recording.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      stopStream(selfieStreamRef.current);
      stopStream(recStreamRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (selfieCam && selfieVideoRef.current && selfieStreamRef.current) {
      selfieVideoRef.current.srcObject = selfieStreamRef.current;
      void selfieVideoRef.current.play().catch(() => {});
    }
  }, [selfieCam]);

  useEffect(() => {
    if (recording && recVideoRef.current && recStreamRef.current) {
      recVideoRef.current.srcObject = recStreamRef.current;
      void recVideoRef.current.play().catch(() => {});
    }
  }, [recording]);

  // ---------------------------------------------------------------- work photos

  // Object URLs are released in the event handler, never inside a state updater
  // (updaters must stay pure — React may re-run them).
  const setSlot = (index: number, slot: Slot) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = slot;
      return next;
    });
  };

  const uploadSlot = async (index: number, file: File) => {
    const stale = slots[index].preview;
    setSlot(index, { status: "uploading" });
    try {
      const jpeg = await toJpeg(file, 1600, 0.8);
      const path = attemptPath(folder(), `work-${index + 1}`, "jpg");
      await putObject(path, jpeg, "image/jpeg");
      releaseUrl(stale);
      setSlot(index, { status: "done", path, preview: trackUrl(jpeg) });
    } catch {
      // A failed decode or upload leaves the tile in an explicit retry state.
      setSlot(index, { status: "error" });
    }
  };

  const clearSlot = (index: number) => {
    const stale = slots[index].preview;
    setSlot(index, { status: "empty" });
    releaseUrl(stale);
  };

  // -------------------------------------------------------------------- selfie

  const closeSelfieCam = useCallback(() => {
    stopStream(selfieStreamRef.current);
    selfieStreamRef.current = null;
    setSelfieCam(false);
  }, []);

  const openSelfieCam = async () => {
    setSelfieError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      selfieStreamRef.current = stream;
      setSelfieCam(true);
    } catch {
      // Denied or unsupported — fall back to the file picker.
      setSelfieFallback(true);
      setSelfieError(t.cameraDenied);
    }
  };

  const storeSelfie = async (blob: Blob) => {
    const stale = selfiePreview;
    setSelfieBusy(true);
    setSelfieError(null);
    try {
      const jpeg = await toJpeg(blob, 1200, 0.8);
      const path = attemptPath(folder(), "selfie", "jpg");
      await putObject(path, jpeg, "image/jpeg");
      releaseUrl(stale);
      setSelfiePreview(trackUrl(jpeg));
      setSelfiePath(path);
    } catch {
      setSelfiePath(null);
      setSelfieError(t.uploadFailed);
    } finally {
      setSelfieBusy(false);
    }
  };

  const captureSelfie = async () => {
    const video = selfieVideoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(video.videoWidth * scale);
    cv.height = Math.round(video.videoHeight * scale);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    closeSelfieCam();
    const blob = await new Promise<Blob | null>((resolve) =>
      cv.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (blob) await storeSelfie(blob);
    else setSelfieError(t.uploadFailed);
  };

  // --------------------------------------------------------------------- video

  const teardownRecorder = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    stopStream(recStreamRef.current);
    recStreamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else teardownRecorder();
  }, [teardownRecorder]);

  const startRecording = async () => {
    setVideoError(null);
    releaseUrl(clip?.url);
    setClip(null);
    const mime = pickRecMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      setVideoSupported(false);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
    } catch {
      // Denied or in use. The device is capable, so keep the record button
      // available — a refused prompt must not permanently close the section.
      setVideoError(t.noCamera);
      return;
    }
    recStreamRef.current = stream;
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);
    // Freeze the exact line shown at record time — toggling language afterwards
    // must not change what we claim the applicant read out.
    setChallengeUsed(challengeLine);

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      stopStream(stream);
      recStreamRef.current = null;
      setVideoSupported(false);
      return;
    }

    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const elapsed = secondsRef.current;
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      teardownRecorder();
      if (elapsed < MIN_SECONDS || blob.size === 0) {
        setVideoError(t.tooShort);
        return;
      }
      setClip({ blob, url: trackUrl(blob), mime });
    };
    rec.start(1000);
    setRecording(true);
    tickRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) stopRecording();
    }, 1000);
  };

  const uploadClip = async () => {
    if (!clip) return;
    setVideoBusy(true);
    setVideoError(null);
    try {
      const mp4 = clip.mime.startsWith("video/mp4");
      const path = attemptPath(folder(), "video", mp4 ? "mp4" : "webm");
      await putObject(path, clip.blob, mp4 ? "video/mp4" : "video/webm");
      setVideoPath(path);
    } catch {
      setVideoPath(null);
      setVideoError(t.uploadFailed);
    } finally {
      setVideoBusy(false);
    }
  };

  /** Re-recording invalidates whatever we had already uploaded. */
  const recordAgain = () => {
    setVideoPath(null);
    void startRecording();
  };

  // ---------------------------------------------------------------- submission

  const photos = slots.filter((s) => s.status === "done" && s.path).map((s) => s.path as string);
  const ready =
    name.trim().length >= 2 &&
    PHONE_RE.test(phone) &&
    city.trim().length >= 2 &&
    AADHAAR_RE.test(aadhaarDigits) &&
    PAN_RE.test(pan) &&
    (pincode === "" || PIN_RE.test(pincode)) &&
    photos.length === 4 &&
    !!selfiePath &&
    !!videoPath &&
    consent;

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setFieldError(null);
    setServerError(false);
    try {
      const res = await fetch("/api/installer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          email: email.trim() || null,
          city: city.trim(),
          pincode: pincode || null,
          yearsExperience: years === "" ? null : Number(years),
          aadhaar: aadhaarDigits,
          pan,
          workPhotos: photos,
          selfiePath,
          videoPath,
          videoChallenge: challengeUsed ?? challengeLine,
          lang,
          consent,
          website,
        }),
      });
      const json: ApplyResponse = await res.json().catch(() => ({ error: "server" }));
      if (json.error) {
        const field = ERR_FIELDS.find((f) => f === json.error);
        if (field) {
          setFieldError(field);
          document
            .getElementById(anchorId(field))
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          setServerError(true);
        }
        return;
      }
      if (json.ok && json.reference) {
        setResult({ reference: json.reference, duplicate: json.duplicate === true });
      } else {
        setServerError(true);
      }
    } catch {
      setServerError(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------ fragments

  const errorFor = (field: ErrField) =>
    fieldError === field ? (
      <p className="mt-1.5 text-xs font-medium text-charcoal">{t.err[field]}</p>
    ) : null;

  const LangToggle = (
    <div className="inline-flex items-center rounded-full border border-edge bg-surface p-1">
      {(["en", "hi"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            lang === l ? "bg-charcoal text-surface" : "text-slate hover:text-charcoal"
          }`}
        >
          {l === "en" ? "English" : "हिंदी"}
        </button>
      ))}
    </div>
  );

  return (
    <div lang={lang} className="pb-16">
      <section className="container-x pt-8">
        <div className="mx-auto max-w-2xl">{LangToggle}</div>
      </section>

      {/* hero */}
      <section className="container-x mt-5">
        <div className="mx-auto max-w-2xl rounded-[32px] bg-wash px-6 py-10 sm:px-10 sm:py-12">
          <p className="caps text-slate">{t.eyebrow}</p>
          <h1 className="mt-3 text-[clamp(1.9rem,4.4vw,3rem)] leading-[1.08]">{t.h1}</h1>
          <p className="mt-5 text-[1.02rem] leading-relaxed text-slate">{t.sub}</p>
          <p className="mt-4 text-sm leading-relaxed text-mist">{t.reach}</p>
        </div>
      </section>

      {/* how it works */}
      <section className="container-x mt-12">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-xl font-bold text-charcoal">{t.howTitle}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {t.steps.map((s, i) => (
              <div key={s.t} className="rounded-[18px] border border-edge bg-surface p-5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-charcoal font-display text-xs font-bold text-surface">
                  {i + 1}
                </span>
                <p className="mt-3 font-display text-base font-bold text-charcoal">{s.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* form / success */}
      <section className="container-x mt-12">
        <div className="mx-auto max-w-2xl">
          {result ? (
            <div className="rounded-[32px] bg-sage/25 px-6 py-12 text-center sm:px-10">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-charcoal text-surface">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="m5 12.5 4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h2 className="mt-6 font-display text-2xl font-bold leading-snug text-charcoal">
                {result.duplicate ? t.dupTitle(result.reference) : t.okTitle(result.reference)}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[0.98rem] leading-relaxed text-slate">
                {t.okSub}
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-10"
            >
              {/* 1 · about you */}
              <div>
                <p className="caps mb-4 text-slate">{t.s1}</p>
                <div className="space-y-4">
                  <div id={anchorId("name")}>
                    <label className="mb-1.5 block text-xs font-medium text-mist" htmlFor="ia-name">
                      {t.fName}
                    </label>
                    <input
                      id="ia-name"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 80))}
                      autoComplete="name"
                      className={FIELD}
                    />
                    {errorFor("name")}
                  </div>

                  <div id={anchorId("phone")}>
                    <label
                      className="mb-1.5 block text-xs font-medium text-mist"
                      htmlFor="ia-phone"
                    >
                      {t.fPhone}
                    </label>
                    <input
                      id="ia-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      className={FIELD}
                    />
                    <p className="mt-1.5 text-xs text-mist">{t.phoneHint}</p>
                    {errorFor("phone")}
                  </div>

                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-mist"
                      htmlFor="ia-email"
                    >
                      {t.fEmail} <span className="text-mist/70">({t.optional})</span>
                    </label>
                    <input
                      id="ia-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                      autoComplete="email"
                      className={FIELD}
                    />
                  </div>

                  <div id={anchorId("city")}>
                    <label className="mb-1.5 block text-xs font-medium text-mist" htmlFor="ia-city">
                      {t.fCity}
                    </label>
                    <input
                      id="ia-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value.slice(0, 60))}
                      autoComplete="address-level2"
                      className={FIELD}
                    />
                    {errorFor("city")}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div id={anchorId("pincode")}>
                      <label
                        className="mb-1.5 block text-xs font-medium text-mist"
                        htmlFor="ia-pin"
                      >
                        {t.fPin} <span className="text-mist/70">({t.optional})</span>
                      </label>
                      <input
                        id="ia-pin"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        className={FIELD}
                      />
                      {errorFor("pincode")}
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-xs font-medium text-mist"
                        htmlFor="ia-years"
                      >
                        {t.fYears} <span className="text-mist/70">({t.optional})</span>
                      </label>
                      <input
                        id="ia-years"
                        value={years}
                        onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        inputMode="numeric"
                        className={FIELD}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2 · identity */}
              <div>
                <p className="caps mb-4 text-slate">{t.s2}</p>
                <div className="space-y-4">
                  <div id={anchorId("aadhaar")}>
                    <label
                      className="mb-1.5 block text-xs font-medium text-mist"
                      htmlFor="ia-aadhaar"
                    >
                      {t.fAadhaar}
                    </label>
                    <input
                      id="ia-aadhaar"
                      value={aadhaar}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                        setAadhaar(digits.replace(/(.{4})(?=.)/g, "$1 "));
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="XXXX XXXX XXXX"
                      className={`${FIELD} tracking-[0.14em]`}
                    />
                    {errorFor("aadhaar")}
                  </div>

                  <div id={anchorId("pan")}>
                    <label className="mb-1.5 block text-xs font-medium text-mist" htmlFor="ia-pan">
                      {t.fPan}
                    </label>
                    <input
                      id="ia-pan"
                      value={pan}
                      onChange={(e) =>
                        setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))
                      }
                      autoComplete="off"
                      placeholder="ABCDE1234F"
                      className={`${FIELD} tracking-[0.14em]`}
                    />
                    {errorFor("pan")}
                  </div>

                  <p className="text-xs leading-relaxed text-mist">{t.idNote}</p>
                </div>
              </div>

              {/* 3 · work photos */}
              <div id={anchorId("work_photos")}>
                <p className="caps mb-2 text-slate">{t.s3}</p>
                <p className="mb-4 text-xs text-mist">{t.workHint}</p>
                <div className="grid grid-cols-2 gap-3">
                  {slots.map((slot, i) => (
                    <div key={i} className="relative aspect-square">
                      {slot.status === "done" && slot.preview ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={slot.preview}
                            alt=""
                            className="h-full w-full rounded-[14px] object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => clearSlot(i)}
                            aria-label={t.remove}
                            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-charcoal text-surface"
                          >
                            ✕
                          </button>
                        </>
                      ) : slot.status === "uploading" ? (
                        <div className="grid h-full w-full place-items-center rounded-[14px] border border-edge bg-wash text-xs text-slate">
                          {t.uploading}
                        </div>
                      ) : (
                        <label className="grid h-full w-full cursor-pointer place-items-center rounded-[14px] border-2 border-dashed border-edge bg-surface px-3 text-center transition-colors hover:border-slate">
                          <span>
                            <span className="block font-display text-2xl text-mist" aria-hidden>
                              +
                            </span>
                            <span className="mt-1 block text-xs font-medium text-slate">
                              {slot.status === "error" ? t.retry : t.addPhoto}
                            </span>
                            {slot.status === "error" && (
                              <span className="mt-0.5 block text-[0.7rem] text-mist">
                                {t.uploadFailed}
                              </span>
                            )}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void uploadSlot(i, file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-mist">{t.photoCount(photos.length)}</p>
                {errorFor("work_photos")}
              </div>

              {/* 4 · live selfie */}
              <div id={anchorId("selfie")}>
                <p className="caps mb-2 text-slate">{t.s4}</p>
                <p className="mb-4 text-xs text-mist">{t.selfieHint}</p>

                {selfieCam ? (
                  <div className="overflow-hidden rounded-[22px] border border-edge bg-charcoal">
                    <video
                      ref={selfieVideoRef}
                      muted
                      playsInline
                      className="aspect-[3/4] w-full object-cover sm:aspect-video"
                    />
                    <div className="flex gap-2 bg-surface p-3">
                      <button
                        type="button"
                        onClick={() => void captureSelfie()}
                        className="btn h-11 flex-1 text-xs"
                      >
                        {t.capture}
                      </button>
                      <button
                        type="button"
                        onClick={closeSelfieCam}
                        className="btn btn-ghost h-11 text-xs"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : selfiePreview && selfiePath ? (
                  <div className="flex items-center gap-4 rounded-[22px] border border-edge bg-surface p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selfiePreview}
                      alt=""
                      className="h-20 w-20 rounded-[14px] object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{t.selfieDone}</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (selfieFallback) setSelfiePath(null);
                          else void openSelfieCam();
                        }}
                        className="mt-1 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                      >
                        {t.retake}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!selfieFallback && (
                      <button
                        type="button"
                        onClick={() => void openSelfieCam()}
                        disabled={selfieBusy}
                        className="btn btn-ghost h-12 w-full text-xs"
                      >
                        {selfieBusy ? t.uploading : t.takeSelfie}
                      </button>
                    )}
                    {selfieFallback && (
                      <label className="btn btn-ghost h-12 w-full cursor-pointer text-xs">
                        {selfieBusy ? t.uploading : t.choosePhoto}
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void storeSelfie(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {selfieError && (
                  <p className="mt-2 rounded-[12px] bg-blush/50 px-4 py-2.5 text-xs text-charcoal">
                    {selfieError}
                  </p>
                )}
                {errorFor("selfie")}
              </div>

              {/* 5 · liveness video */}
              <div id={anchorId("video")}>
                <p className="caps mb-4 text-slate">{t.s5}</p>

                <div className="rounded-[18px] border border-edge bg-surface p-5">
                  <p className="text-sm leading-relaxed text-slate">{t.videoIntro}</p>
                  <p className="mt-3 font-display text-base font-bold leading-relaxed text-charcoal">
                    {challengeLine || "…"}
                  </p>
                </div>

                {videoSupported === false ? (
                  <p className="mt-3 rounded-[12px] bg-blush/50 px-4 py-3 text-xs leading-relaxed text-charcoal">
                    {t.noCamera}
                  </p>
                ) : recording ? (
                  <div className="mt-3 overflow-hidden rounded-[22px] border border-edge bg-charcoal">
                    <video
                      ref={recVideoRef}
                      muted
                      playsInline
                      className="aspect-[3/4] w-full object-cover sm:aspect-video"
                    />
                    <div className="flex items-center gap-3 bg-surface p-3">
                      <span className="text-xs font-semibold tabular-nums text-charcoal">
                        {t.recording(seconds)}
                      </span>
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="btn h-11 flex-1 text-xs"
                      >
                        {t.stopRecording}
                      </button>
                    </div>
                  </div>
                ) : clip && !videoPath ? (
                  <div className="mt-3 overflow-hidden rounded-[22px] border border-edge bg-surface">
                    <video
                      src={clip.url}
                      controls
                      playsInline
                      className="w-full bg-charcoal"
                    />
                    <div className="p-3">
                      <p className="mb-3 text-xs text-mist">{t.reviewHint}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void uploadClip()}
                          disabled={videoBusy}
                          className="btn h-11 flex-1 text-xs"
                        >
                          {videoBusy ? t.uploading : t.useVideo}
                        </button>
                        <button
                          type="button"
                          onClick={recordAgain}
                          disabled={videoBusy}
                          className="btn btn-ghost h-11 text-xs"
                        >
                          {t.recordAgain}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : videoPath ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-sage/50 px-4 py-3.5">
                    <span className="text-sm font-semibold text-charcoal">{t.videoDone}</span>
                    <button
                      type="button"
                      onClick={recordAgain}
                      className="text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                    >
                      {t.recordAgain}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    className="btn btn-ghost mt-3 h-12 w-full text-xs"
                  >
                    {t.startRecording}
                  </button>
                )}

                {videoError && (
                  <p className="mt-2 rounded-[12px] bg-blush/50 px-4 py-2.5 text-xs text-charcoal">
                    {videoError}
                  </p>
                )}
                {errorFor("video")}
              </div>

              {/* consent */}
              <div id={anchorId("consent")}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${
                    consent ? "border-charcoal bg-surface" : "border-edge bg-surface hover:border-slate"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 ${
                      consent ? "border-charcoal bg-charcoal text-surface" : "border-slate"
                    }`}
                    aria-hidden
                  >
                    {consent && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path
                          d="m4 8 2.5 2.5L12 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="sr-only"
                    />
                    <span className="font-medium leading-relaxed text-charcoal">{t.consent}</span>
                  </span>
                </label>
                {errorFor("consent")}
              </div>

              {/* bot trap — never shown, never focusable */}
              <input
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
              />

              <div>
                <button type="submit" className="btn h-12 w-full" disabled={!ready || submitting}>
                  {submitting ? t.submitting : ready ? t.submit : t.incomplete}
                </button>
                {serverError && (
                  <p className="mt-3 rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">
                    {t.errServer}
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
