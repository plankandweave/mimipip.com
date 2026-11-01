"use client";

import { useRef, useState } from "react";

/** Read an image File, downscale to a sane max edge, return a JPEG data URI. */
async function fileToDataUri(file: File, maxEdge = 1600): Promise<string> {
  const raw = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = raw;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    if (scale >= 1) return raw;
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

/* Light line illustrations hinting what to photograph. */
function WallHint() {
  return (
    <svg viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-16 w-auto text-mist">
      <rect x="10" y="8" width="100" height="66" rx="2" />
      <rect x="34" y="24" width="52" height="34" rx="1.5" />
      <path d="M10 74h100" strokeWidth="2" />
      <path d="M24 74v6M96 74v6" opacity="0.5" />
    </svg>
  );
}
function RoomHint() {
  return (
    <svg viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-16 w-auto text-mist">
      <path d="M12 12v58h96V12" />
      <path d="M12 70 2 82M108 70l10 12" opacity="0.6" />
      <path d="M2 82h116" strokeWidth="2" />
      <rect x="70" y="24" width="26" height="26" rx="1.5" />
      <path d="M83 24v26M70 37h26" opacity="0.6" />
      <path d="M24 70V50h20v20" />
    </svg>
  );
}

function Drop({
  hint,
  label,
  sub,
  value,
  onPick,
}: {
  hint: "wall" | "room";
  label: string;
  sub: string;
  value?: string;
  onPick: (uri: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = async (f?: File | null) => {
    if (f && f.type.startsWith("image/")) onPick(await fileToDataUri(f));
  };
  return (
    <div
      className={`card relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-[24px] border transition ${
        over ? "border-charcoal" : "border-edge"
      }`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      role="button"
      tabIndex={0}
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          {hint === "wall" ? <WallHint /> : <RoomHint />}
          <span className="text-[0.95rem] font-semibold text-charcoal">{label}</span>
          <span className="max-w-[26ch] text-[0.8rem] leading-snug text-slate">{sub}</span>
        </div>
      )}
      {value && (
        <span className="absolute bottom-3 right-3 rounded-full bg-charcoal/60 px-3 py-1.5 text-[0.7rem] font-medium text-white backdrop-blur">
          Change
        </span>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
    </div>
  );
}

export function PhotoUpload({
  room,
  wide,
  onRoom,
  onWide,
  onSubmit,
}: {
  room?: string;
  wide?: string;
  onRoom: (uri: string) => void;
  onWide: (uri: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <span className="caps text-slate">Show us your room</span>
      <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)]">Take a photo, and we can begin.</h1>
      <p className="mt-3 max-w-[56ch] text-slate">
        One clear picture of the wall you have in mind is all we need — add a wider shot too, if you like, and we can
        read the whole room: its light, its colours, how it lives.
      </p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Drop hint="wall" label="The wall" sub="A photo of the space or wall for the wallpaper" value={room} onPick={onRoom} />
        <Drop hint="room" label="The wider room" sub="A step-back shot (optional, but it helps)" value={wide} onPick={onWide} />
      </div>
      <div className="mt-7">
        <button className="btn" disabled={!room && !wide} onClick={onSubmit}>
          {room || wide ? "See what the curator thinks" : "Add a photo of your room"}
        </button>
      </div>
    </div>
  );
}
