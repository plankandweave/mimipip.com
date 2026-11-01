"use client";

import { useCanvasJourney } from "./ShoppingJourney";

import { TextOverlayLayer } from "./TextOverlayEditor";
import { drawTextOverlayWarp } from "@/lib/text-overlay-canvas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendTasteSignal } from "@/components/TasteSignal";
import { useAuthGate } from "@/components/AuthGate";
import { quadTransform, quadMapper, type Point } from "@/lib/homography";
import { coverLayout, tileSpan, type CropData, type SeamlessSpec } from "@/lib/visualizer";
import { drawTriangle, loadImage } from "@/lib/warp";
import { straightMids, isCurved, coonsMapper, bezierControl, type EdgeMids } from "@/lib/coons";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";
import { APPLIANCES, type ApplianceKey } from "@/lib/appliances";

const WALL_W = 800; // px width of the untransformed wall surface

// Minimum share of the outlined wall the segmenter's mask must keep before we
// apply it — see maskCoversWall.
const MASK_MIN_COVER = 0.35;

/**
 * Pre-render a seamless design as a wall-sized tiled texture.
 *
 * The warp renderers sample the texture through affine triangles, and a
 * triangle that straddles a tile boundary cannot be sampled with a modulo —
 * it would smear the whole tile across the seam. Tiling ONCE into a
 * wall-sized canvas sidesteps that completely: downstream the result is just
 * a texture that happens to already be the shape of the wall, so every
 * existing mapping, mask and export path works unchanged.
 *
 * Rendered at 2× so the repeat survives being warped into perspective, where
 * the far end of a wall is minified and the near end magnified.
 */
function tiledWallTexture(
  mural: CanvasImageSource,
  muralW: number,
  muralH: number,
  tileW: number,
  tileH: number,
  phaseX: number,
  phaseY: number,
  wallW: number,
  wallH: number,
): HTMLCanvasElement | null {
  if (!(tileW > 0) || !(tileH > 0) || !(muralW > 0) || !(muralH > 0)) return null;
  const S = 2;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(wallW * S));
  c.height = Math.max(1, Math.round(wallH * S));
  const cx = c.getContext("2d");
  if (!cx) return null;
  const pat = cx.createPattern(mural, "repeat");
  if (!pat) return null;
  // Scale one source tile down to the physical repeat, then shift by the
  // customer's phase so they can choose where the motif falls on the wall.
  // Phase moves WHICH part of the repeat starts at the corner; it never
  // changes the repeat's size, which is the studio's decision alone.
  const m = new DOMMatrix()
    .translateSelf(-phaseX * S, -phaseY * S)
    .scaleSelf((tileW * S) / muralW, (tileH * S) / muralH);
  pat.setTransform(m);
  cx.fillStyle = pat;
  cx.fillRect(0, 0, c.width, c.height);
  return c;
}

function capture(e: React.PointerEvent) {
  try {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone — drag still works via element events */
  }
}

export type Corners = [Point, Point, Point, Point]; // tl, tr, br, bl — fractions of the photo

const DEFAULT_CORNERS: Corners = [
  { x: 0.16, y: 0.12 },
  { x: 0.84, y: 0.12 },
  { x: 0.84, y: 0.8 },
  { x: 0.16, y: 0.8 },
];

const SAMPLE_CORNERS: Corners = [
  { x: 0.06, y: 0.07 },
  { x: 0.94, y: 0.07 },
  { x: 0.94, y: 0.72 },
  { x: 0.06, y: 0.72 },
];

export function RoomVisualizer({
  open,
  onClose,
  imageUrl,
  imageAlt,
  wallWidthCm,
  wallHeightCm,
  wallLabel,
  textOverlayUrl = "",
  companionUrl = "",
  initial,
  textureUrl,
  onApply,
  initialPhoto,
  initialCorners,
  initialMids,
  onRoomCapture,
  productHandle,
  seamless = null,
  surface = "wall",
}: {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt: string;
  wallWidthCm: number;
  wallHeightCm: number;
  wallLabel: string;
  textOverlayUrl?: string;
  companionUrl?: string;
  initial: CropData | null;
  textureUrl?: string | null;
  onApply: (crop: CropData, composite?: string) => void;
  /** Reuse a room photo + wall corners already aligned earlier (e.g. the
   *  standalone "See It in My Room" flow) instead of starting from upload. */
  initialPhoto?: string | null;
  initialCorners?: Corners | null;
  /** Reuse curve handles from an earlier "curved surface" alignment (column /
   *  wrapped corner). Absent/flat is the common case — see room-session.ts. */
  initialMids?: EdgeMids | null;
  /** Fires whenever the customer confirms their photo+corners, so a parent
   *  page can persist them for browsing multiple designs against the same room.
   *  `mids` is only passed while curved mode is on (undefined = flat). */
  onRoomCapture?: (photo: string, corners: Corners, mids?: EdgeMids) => void;
  /** When set, placing this design on a real room photo records a "visualize"
   *  taste signal — the strongest pre-purchase interest we can observe. */
  productHandle?: string;
  /** Set for designs the studio marked as a seamless tile: the artwork repeats
   *  at this fixed physical size instead of one copy being fitted to the wall.
   *  Absent = every mural's original behaviour. */
  seamless?: SeamlessSpec | null;
  /** Any appliance key swaps the placement copy for that appliance's own
   *  wrapped face and skips the furniture pass (wall segmentation): the
   *  segmenter looks for a WALL, and on a photo of an appliance it either
   *  misses the appliance or masks the design off it. The appliance-wrap
   *  visualisers pass this. Absent/"wall" = the wall visualiser, unchanged. */
  surface?: "wall" | ApplianceKey;
}) {
  const appliance = surface === "wall" ? null : surface;
  const isAppliance = appliance !== null;
  const applianceCfg = appliance ? APPLIANCES[appliance] : null;
  // `possessive` is the appliance as the customer would say it ("your
  // fridge"); `facePhrase` names the face the wrap goes on. Never the bare
  // surfaceNoun alone — a top-loader's is "body".
  const artwork = useCanvasJourney();
  const possessive = applianceCfg ? applianceCfg.possessiveNoun : artwork ? "your room" : "your wall";
  const facePhrase = applianceCfg ? `${applianceCfg.possessiveNoun}’s ${applianceCfg.surfaceNoun}` : artwork ? "the area where the artwork will hang" : "your wall";
  const { gate, authModal, signedIn } = useAuthGate();
  const [letteringImage, setLetteringImage] = useState<HTMLImageElement | null>(null);
  const [companionImage, setCompanionImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let dead = false;
    setCompanionImage(null);
    if (companionUrl) loadImage(companionUrl, false).then(im => { if (!dead) setCompanionImage(im); }).catch(() => {});
    return () => { dead = true; };
  }, [companionUrl]);
  useEffect(() => {
    let dead = false;
    if (textOverlayUrl) loadImage(textOverlayUrl, false).then(im => { if (!dead) setLetteringImage(im); }).catch(() => {});
    return () => { dead = true; };
  }, [textOverlayUrl]);
  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null); // object URL, data URI, or "sample"
  const [corners, setCorners] = useState<Corners>(initialCorners ?? DEFAULT_CORNERS);
  // "Curved surface" — wraps the mural around a column/arch instead of a flat
  // wall. curvedMids are the 4 draggable curve handles (top/right/bottom/left
  // edge, same fractional space as corners); while curved mode is off the
  // handles the rest of the component sees (`mids`, below) are just derived
  // from the corners' straight midpoints, so they track corner drags for
  // free and a stale drag from a previous curved session never leaks in.
  const [curved, setCurved] = useState<boolean>(() =>
    initialMids ? isCurved(initialCorners ?? DEFAULT_CORNERS, initialMids) : false,
  );
  const [curvedMids, setCurvedMids] = useState<EdgeMids>(
    () => initialMids ?? straightMids(initialCorners ?? DEFAULT_CORNERS),
  );
  // A room that arrives AFTER mount — the product page reads the saved room
  // from localStorage in an effect, and this component is already mounted
  // (closed) by then — is adopted as long as no photo has been picked here.
  // Only an empty photo is filled: "Change photo" sets it null on purpose and
  // a re-run with the same saved room must not undo that, which is why the
  // effect keys on the room, never on `photo`.
  const photoRef = useRef(photo);
  useEffect(() => { photoRef.current = photo; }, [photo]);
  useEffect(() => {
    if (!initialPhoto || photoRef.current) return;
    setPhoto(initialPhoto);
    if (initialCorners) setCorners(initialCorners);
    if (initialMids) {
      setCurvedMids(initialMids);
      setCurved(isCurved(initialCorners ?? DEFAULT_CORNERS, initialMids));
    } else {
      setCurved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhoto]);
  const [zoom, setZoom] = useState(initial?.zoom ?? 1);
  const [offsetX, setOffsetX] = useState(initial?.offsetX ?? 0.5);
  const [offsetY, setOffsetY] = useState(initial?.offsetY ?? 0.5);
  const [blend, setBlend] = useState(true);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  // See DesignVisualizer: a cached image is decoded before React attaches
  // onLoad, so the event never fires and the aspect stays null. Harmless for a
  // normal design (object-cover fallback), fatal for a seamless one — the
  // repeat would silently not happen. Measure from the DOM instead of trusting
  // the event.
  const flatImgRef = useRef<HTMLImageElement | null>(null);
  const measuredFor = useRef<string | null>(null);
  const [srcDims, setSrcDims] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Auto-detected wall-only mask (alpha=opaque on wall, transparent on
  // furniture/TV/etc in front of it) for the uploaded photo — keeps the mural
  // from painting over anything that isn't actually the wall.
  const [wallMaskImg, setWallMaskImg] = useState<HTMLImageElement | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [localMaskUrl, setLocalMaskUrl] = useState<string | null>(null);
  // The segmenter only labels bare "wall". A surface that already carries a
  // mural, panelling or a big artwork comes back as "painting"/"curtain", so
  // the mask is near-empty over exactly the wall the customer outlined — and
  // masking with it erases the design instead of trimming furniture out of it.
  // MASK_MIN_COVER is the share of the outlined quad the mask must keep for us
  // to believe it; below that we trust the customer's corners and mask nothing.
  const [maskCoversWall, setMaskCoversWall] = useState(true);

  // Live camera ("AR") mode: photo === "live" streams the rear camera as a
  // background the customer lines the mural up against, then captures a frame.
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Gyroscope "pseudo-AR": as the phone pans/tilts, nudge the mural the
  // opposite way so it feels pinned to the wall. Not true world-tracking
  // (drifts, no scale lock) — a free, motion-reactive step up from a static
  // overlay. Degrades silently to the static overlay if unavailable/denied.
  const [motionOn, setMotionOn] = useState(false);
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0 });
  const gyroBase = useRef<{ beta: number; gamma: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const dragCorner = useRef<number | null>(null);
  const dragMid = useRef<number | null>(null);
  const panLast = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Curved-mode live preview: CSS matrix3d can't express a Coons patch, so
  // curved mode swaps the transformed div for a canvas mesh-warped every
  // frame. muralImgRef holds the loaded design image for drawImage(); loaded
  // independently of the flat <img>'s onLoad so curved mode has it even if
  // that div never mounts (e.g. resuming a session that starts curved).
  const muralImgRef = useRef<HTMLImageElement | null>(null);
  const curvedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const curvedFrame = useRef<number | null>(null);

  // A design placed on the customer's real room photo (not the illustrated
  // sample) is the strongest browse-stage interest signal we have — record it
  // once per visualiser session.
  const vizSignalSent = useRef(false);
  useEffect(() => {
    if (!open) {
      vizSignalSent.current = false;
      return;
    }
    if (!vizSignalSent.current && productHandle && photo && photo !== "sample") {
      vizSignalSent.current = true;
      sendTasteSignal(productHandle, "visualize");
    }
  }, [open, photo, productHandle]);

  // measure the photo wrapper so corner fractions become pixels
  useEffect(() => {
    if (!open || !photo) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, photo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);


  // Load the mural once per design so curved mode's canvas has a raster to
  // draw regardless of whether the flat <img> (below) has mounted/loaded —
  // it doesn't, e.g., when a resumed session starts already curved.
  useEffect(() => {
    let cancelled = false;
    loadImage(imageUrl)
      .then((img) => {
        if (cancelled) return;
        muralImgRef.current = img;
        setImgAspect(img.naturalWidth / img.naturalHeight);
        setSrcDims({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch(() => {
        /* the flat <img> below still resolves the aspect for flat mode */
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // px shifted per degree of phone tilt, and the clamp so the mural never
  // flies off the wall — kept gentle so it reads as "anchored", not jumpy.
  const GYRO_PX_PER_DEG = 5;
  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    if (!gyroBase.current) gyroBase.current = { beta: e.beta, gamma: e.gamma };
    const clamp = 90;
    const dx = Math.max(-clamp, Math.min(clamp, -(e.gamma - gyroBase.current.gamma) * GYRO_PX_PER_DEG));
    const dy = Math.max(-clamp, Math.min(clamp, (e.beta - gyroBase.current.beta) * GYRO_PX_PER_DEG));
    setGyroOffset({ x: dx, y: dy });
  }, []);

  const stopMotion = useCallback(() => {
    window.removeEventListener("deviceorientation", onOrientation);
    gyroBase.current = null;
    setMotionOn(false);
    setGyroOffset({ x: 0, y: 0 });
  }, [onOrientation]);

  const enableMotion = useCallback(async () => {
    try {
      type DOE = { requestPermission?: () => Promise<"granted" | "denied"> };
      const doe = DeviceOrientationEvent as unknown as DOE;
      if (typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") return;
      }
      gyroBase.current = null;
      window.addEventListener("deviceorientation", onOrientation);
      setMotionOn(true);
    } catch {
      /* no gyro / denied — silently stay on the static overlay */
    }
  }, [onOrientation]);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      stopStream();
      stopMotion();
    },
    [stopStream, stopMotion],
  );

  // Stop the camera + motion whenever we leave live mode or the modal closes.
  useEffect(() => {
    if (!open || photo !== "live") {
      stopStream();
      stopMotion();
    }
  }, [open, photo, stopStream, stopMotion]);

  // Attach the stream once the <video> for live mode has mounted.
  useEffect(() => {
    if (photo === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [photo]);

  const startLiveCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera isn't available on this device — try uploading a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setWallMaskImg(null);
      setCorners(DEFAULT_CORNERS);
      setCurved(false);
      setPhoto("live");
      // Same user gesture (tile tap) — request motion so pseudo-AR can start.
      enableMotion();
    } catch {
      setCameraError("We couldn't open your camera — please allow camera access, or upload a photo instead.");
    }
  };

  // Freeze the current live frame into a still, then hand off to the normal
  // photo flow (segmentation + occlusion) while keeping the corners the
  // customer already lined up on their wall.
  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopStream();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "live-capture.jpg", { type: "image/jpeg" });
        pickFile(file, true); // keep corners the customer aligned
      },
      "image/jpeg",
      0.92,
    );
  };

  // The room photo as picked, kept for the furniture pass below. It never
  // leaves the browser unless that pass runs.
  const roomFile = useRef<File | null>(null);
  // Which file has already been sent for segmentation, so the gate's replay
  // and the signed-in effect below can both ask without it running twice.
  const segmentedFile = useRef<File | null>(null);

  /**
   * Seeing a design on your own wall is FREE and ungated.
   *
   * The gate used to sit here (30 Jul 2026, e7bb9f6f: "gate wall-preview
   * features on verified email") because picking a photo also uploaded it and
   * ran wall segmentation on our servers. But the homepage promises this "in
   * seconds, at no charge", and an anonymous visitor met an email form and
   * consent boxes instead (30 Sep 2026 walkthrough).
   *
   * So the two halves are split. Mapping the design onto the photo is pure
   * browser work — an object URL, four corners, a CSS/canvas warp — and runs
   * for everyone. The server half (runSegmentation: hide the design behind
   * the furniture) runs at once for a verified customer and sits behind the
   * gate for everyone else, offered by the quiet prompt under the photo.
   * /api/segment-room enforces requireGatedUser() itself, so the security fix
   * does not depend on this component behaving.
   */
  const pickFile = (f: File | undefined, keepCorners = false) => {
    if (!f || !f.type.startsWith("image/")) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(f);
    roomFile.current = f;
    segmentedFile.current = null;
    setPhoto(objectUrl.current);
    if (!keepCorners) {
      setCorners(DEFAULT_CORNERS);
      setCurved(false);
    }
    setWallMaskImg(null);
    if (signedIn) occlude();
  };

  /** Run the furniture pass for the current photo, once. Verified only. */
  const occlude = () => {
    // An appliance face is not a wall — see the `surface` prop.
    if (isAppliance) return;
    const f = roomFile.current;
    if (!f || segmentedFile.current === f) return;
    segmentedFile.current = f;
    void runSegmentation(f);
  };

  // A visitor who verifies (via the prompt, or anywhere else on the page) gets
  // the furniture pass for the photo already on screen, without re-picking it.
  // Also covers a photo picked while the session check was still loading.
  useEffect(() => {
    if (open && signedIn && photo?.startsWith("blob:")) occlude();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn, photo]);

  // Saved partner photos need the same furniture mask as a newly chosen file.
  useEffect(() => {
    if (!open || !signedIn || isAppliance || !photo || photo === "sample" || photo.startsWith("blob:") || roomFile.current) return;
    let cancelled = false;
    fetch(photo).then(r => { if (!r.ok) throw new Error("Photo unavailable"); return r.blob(); }).then(blob => {
      if (cancelled) return;
      const file = new File([blob], "saved-room.jpg", {type: blob.type || "image/jpeg"});
      roomFile.current = file;
      segmentedFile.current = file;
      void runSegmentation(file);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn, isAppliance, photo]);

  // Real room photos only — the illustrated sample room has no real furniture
  // to detect, so it keeps today's no-occlusion behaviour.
  const runSegmentation = async (f: File) => {
    setSegmenting(true);
    try {
      const body = new FormData();
      body.append("image", f);
      const res = await fetch("/api/segment-room", { method: "POST", body });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      setWallMaskImg(img);
    } catch (e) {
      console.warn("wall segmentation failed:", e);
    } finally {
      setSegmenting(false);
    }
  };

  const wallH = WALL_W * (wallHeightCm / Math.max(wallWidthCm, 1));
  const px = useMemo<Corners>(
    () =>
      corners.map((c) => ({ x: c.x * box.w, y: c.y * box.h })) as Corners,
    [corners, box],
  );
  // Flat mode: the curve handles are just the corners' straight midpoints, so
  // they track corner drags for free with no syncing effect needed. Curved
  // mode swaps in the customer's own dragged handles.
  const flatMids = useMemo(() => straightMids(corners), [corners]);
  const mids = curved ? curvedMids : flatMids;
  const pxMids = useMemo<EdgeMids>(
    () => mids.map((m) => ({ x: m.x * box.w, y: m.y * box.h })) as EdgeMids,
    [mids, box],
  );
  const matrix = useMemo(
    () => (box.w > 0 ? quadTransform(WALL_W, wallH, px[0], px[1], px[2], px[3]) : null),
    [box.w, wallH, px],
  );
  const boxMap = useMemo(
    () => (box.w > 0 ? quadMapper(WALL_W, wallH, px[0], px[1], px[2], px[3]) : null),
    [box.w, wallH, px],
  );

  const layout = imgAspect ? coverLayout(WALL_W, wallH, imgAspect, zoom) : null;
  useEffect(() => {
    if (measuredFor.current === imageUrl) return;
    const el = flatImgRef.current;
    if (!el?.complete || !el.naturalWidth || !el.naturalHeight) return;
    measuredFor.current = imageUrl;
    setImgAspect(el.naturalWidth / el.naturalHeight);
    setSrcDims({ w: el.naturalWidth, h: el.naturalHeight });
  });

  // One tile's footprint on the untransformed wall surface, in the same px the
  // rest of this component works in. Null for every non-seamless design, which
  // is what keeps all the original code paths byte-for-byte unchanged.
  const tilePx = useMemo(
    () =>
      seamless?.repeatWidthCm && imgAspect
        ? tileSpan(WALL_W, wallWidthCm, imgAspect, seamless.repeatWidthCm)
        : null,
    [seamless?.repeatWidthCm, imgAspect, wallWidthCm],
  );

  // Re-warp the wall mask into the mural div's own untransformed local box
  // (WALL_W × wallH) whenever the wall quad changes, so it can be applied as
  // a CSS mask *before* the div's matrix3d transform — the mask and the
  // transform then compose correctly, keeping furniture pixels excluded no
  // matter how the quad is dragged. Flat mode only: curved mode's handles are
  // a customer-placed boundary more precise than the classifier's guess, and
  // the "wall" class the model looks for often doesn't even match a column's
  // surface — see drawCurvedPreview()/renderComposite() below.
  useEffect(() => {
    if (!wallMaskImg || !boxMap || box.w === 0 || curved) {
      setLocalMaskUrl(null);
      return;
    }
    const boxCanvas = document.createElement("canvas");
    boxCanvas.width = box.w;
    boxCanvas.height = box.h;
    const bctx = boxCanvas.getContext("2d");
    if (!bctx) return;
    bctx.drawImage(wallMaskImg, 0, 0, box.w, box.h);

    const local = document.createElement("canvas");
    local.width = WALL_W;
    local.height = wallH;
    const lctx = local.getContext("2d");
    if (!lctx) return;
    const N = 20;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = (i / N) * WALL_W;
        const u1 = ((i + 1) / N) * WALL_W;
        const v0 = (j / N) * wallH;
        const v1 = ((j + 1) / N) * wallH;
        const s00 = boxMap(u0, v0), s10 = boxMap(u1, v0), s11 = boxMap(u1, v1), s01 = boxMap(u0, v1);
        const d00 = { x: u0, y: v0 }, d10 = { x: u1, y: v0 }, d11 = { x: u1, y: v1 }, d01 = { x: u0, y: v1 };
        drawTriangle(lctx, boxCanvas, s00, s10, s11, d00, d10, d11);
        drawTriangle(lctx, boxCanvas, s00, s11, s01, d00, d11, d01);
      }
    }
    // Sample the warped mask over the quad itself: if it would hide most of
    // the placement, the classifier has misread this surface — drop the mask
    // rather than the design.
    let covered = 1;
    try {
      const { data } = lctx.getImageData(0, 0, local.width, local.height);
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 127) opaque++;
      covered = opaque / (data.length / 4);
    } catch {
      /* tainted canvas (never happens for our own PNG) — keep the mask */
    }
    if (covered < MASK_MIN_COVER) {
      setMaskCoversWall(false);
      setLocalMaskUrl(null);
      return;
    }
    setMaskCoversWall(true);
    setLocalMaskUrl(local.toDataURL("image/png"));
  }, [wallMaskImg, boxMap, box.w, box.h, wallH, curved]);

  const moveCorner = useCallback((i: number, e: PointerEvent | React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width));
    const y = Math.min(0.99, Math.max(0.01, (e.clientY - r.top) / r.height));
    setCorners((cs) => cs.map((c, j) => (j === i ? { x, y } : c)) as Corners);
  }, []);

  const moveMid = useCallback((i: number, e: PointerEvent | React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width));
    const y = Math.min(0.99, Math.max(0.01, (e.clientY - r.top) / r.height));
    setCurvedMids((ms) => ms.map((m, j) => (j === i ? { x, y } : m)) as EdgeMids);
  }, []);

  // Dashed wall-outline path: straight polygon in flat mode, the same
  // quadratic-bézier edges the mesh warp uses (through the curve handles)
  // once curved.
  const curvedOutlinePath = useMemo(() => {
    if (!curved || box.w === 0) return "";
    const [tl, tr, br, bl] = px;
    const [topMid, rightMid, bottomMid, leftMid] = pxMids;
    const topC = bezierControl(tl, tr, topMid);
    const rightC = bezierControl(tr, br, rightMid);
    const bottomC = bezierControl(bl, br, bottomMid);
    const leftC = bezierControl(tl, bl, leftMid);
    return [
      `M ${tl.x},${tl.y}`,
      `Q ${topC.x},${topC.y} ${tr.x},${tr.y}`,
      `Q ${rightC.x},${rightC.y} ${br.x},${br.y}`,
      `Q ${bottomC.x},${bottomC.y} ${bl.x},${bl.y}`,
      `Q ${leftC.x},${leftC.y} ${tl.x},${tl.y}`,
      "Z",
    ].join(" ");
  }, [curved, px, pxMids, box.w]);

  const quadWidthPx = ((px[1].x - px[0].x) + (px[2].x - px[3].x)) / 2 || 1;

  const onPan = (e: React.PointerEvent) => {
    if (!panLast.current || !layout) return;
    const scale = quadWidthPx / WALL_W;
    const dx = (e.clientX - panLast.current.x) / scale;
    const dy = (e.clientY - panLast.current.y) / scale;
    panLast.current = { x: e.clientX, y: e.clientY };
    const spanX = layout.imgW - WALL_W;
    const spanY = layout.imgH - wallH;
    if (spanX > 1) setOffsetX((v) => Math.min(1, Math.max(0, v - dx / spanX)));
    if (spanY > 1) setOffsetY((v) => Math.min(1, Math.max(0, v - dy / spanY)));
  };

  // Curved mode's live preview: a Coons patch isn't a homography, so CSS
  // matrix3d can't draw it — mesh-warp the mural onto a canvas the same way
  // renderComposite() rasterises the export, at box (on-screen) scale instead
  // of the export's PW×PH. Texture sampling (coverLayout + pan/zoom/flip)
  // mirrors renderComposite()'s tex() exactly, so the preview matches the save.
  const drawCurvedPreview = useCallback(() => {
    const canvas = curvedCanvasRef.current;
    const mural = muralImgRef.current;
    if (!canvas || !mural || box.w === 0 || box.h === 0 || !imgAspect) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    canvas.style.width = `${box.w}px`;
    canvas.style.height = `${box.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const map = coonsMapper(WALL_W, wallH, px, pxMids);
    // Seamless: tile once into a wall-sized texture, then sample it as if it
    // were an artwork already cut to this exact wall. Flip is not applied —
    // mirroring a tile breaks the seam it was drawn to butt against.
    const tiled = tilePx
      ? tiledWallTexture(mural, mural.naturalWidth, mural.naturalHeight,
          tilePx.tileW, tilePx.tileH, offsetX * tilePx.tileW, offsetY * tilePx.tileH, WALL_W, wallH)
      : null;
    const source: CanvasImageSource = tiled ?? mural;
    const disp = tiled ? { imgW: WALL_W, imgH: wallH } : coverLayout(WALL_W, wallH, imgAspect, zoom);
    const offLeft = tiled ? 0 : offsetX * (disp.imgW - WALL_W);
    const offTop = tiled ? 0 : offsetY * (disp.imgH - wallH);
    const texW = tiled ? tiled.width : mural.naturalWidth;
    const texH = tiled ? tiled.height : mural.naturalHeight;
    const fH = tiled ? false : (initial?.flipH ?? false);
    const fV = tiled ? false : (initial?.flipV ?? false);
    const tex = (u: number, v: number) => {
      const x = ((u + offLeft) / disp.imgW) * texW;
      const y = ((v + offTop) / disp.imgH) * texH;
      return { x: fH ? texW - x : x, y: fV ? texH - y : y };
    };

    // No wall-mask clip here: curved mode's handles are a customer-placed
    // boundary, already more precise than the "wall"-class guess the
    // segmentation model would apply — and that guess is frequently wrong on
    // a column/arch in the first place, since the model's "wall" class often
    // doesn't cover the surface being wrapped at all (see the mask-computing
    // effect above and renderComposite() below, both skipped while curved).
    ctx.scale(dpr, dpr);
    const N = 24;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = (i / N) * WALL_W;
        const u1 = ((i + 1) / N) * WALL_W;
        const v0 = (j / N) * wallH;
        const v1 = ((j + 1) / N) * wallH;
        const s00 = tex(u0, v0), s10 = tex(u1, v0), s11 = tex(u1, v1), s01 = tex(u0, v1);
        const d00 = map(u0, v0), d10 = map(u1, v0), d11 = map(u1, v1), d01 = map(u0, v1);
        drawTriangle(ctx, source, s00, s10, s11, d00, d10, d11);
        drawTriangle(ctx, source, s00, s11, s01, d00, d11, d01);
      }
    }
    if (initial?.textOverlay && letteringImage) drawTextOverlayWarp(ctx, letteringImage, initial.textOverlay, WALL_W, wallH, map);
    if (initial?.textOverlay?.companion && companionImage) drawTextOverlayWarp(ctx, companionImage, initial.textOverlay.companion, WALL_W, wallH, map);
  }, [box.w, box.h, imgAspect, px, pxMids, wallH, zoom, offsetX, offsetY, initial?.flipH, initial?.flipV, tilePx, initial, letteringImage, companionImage]);

  // rAF-throttle redraws — every dependency of drawCurvedPreview above
  // (corners/mids/zoom/pan/flip/mask/mural-load) can change several times per
  // pointer-move tick while dragging a handle or panning.
  useEffect(() => {
    if (!curved) return;
    if (curvedFrame.current != null) cancelAnimationFrame(curvedFrame.current);
    curvedFrame.current = requestAnimationFrame(() => {
      curvedFrame.current = null;
      drawCurvedPreview();
    });
    return () => {
      if (curvedFrame.current != null) cancelAnimationFrame(curvedFrame.current);
    };
  }, [curved, drawCurvedPreview]);

  // Rasterise the on-screen preview (room photo + mural warped into the wall
  // quad) to a JPEG data URL for the order-copy PDF. The mural is loaded
  // cross-origin (crossOrigin="anonymous") via Supabase's CORS-enabled image
  // CDN so toDataURL() works without tainting the canvas.
  const renderComposite = async (): Promise<string | undefined> => {
    try {
      if (!photo) return undefined;

      // background: uploaded photo (same-origin blob) or the sample SVG.
      // Derive dimensions from the background itself so this doesn't depend on
      // the modal's measured box / image-load state (robust to timing).
      let bg: HTMLImageElement | null = null;
      if (photo === "sample") {
        const svg = wrapRef.current?.querySelector("svg");
        if (svg) {
          const xml = new XMLSerializer().serializeToString(svg);
          bg = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml));
        }
      } else {
        bg = await loadImage(photo);
      }
      if (!bg) return undefined;

      const PW = 1200;
      const bgAspect = bg.naturalWidth / bg.naturalHeight || box.w / Math.max(box.h, 1) || 1.6;
      const PH = Math.round(PW / bgAspect);
      const canvas = document.createElement("canvas");
      canvas.width = PW;
      canvas.height = PH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(bg, 0, 0, PW, PH);

      // Loaded cross-origin with crossOrigin="anonymous": a /media URL is
      // fetched as its pre-generated rendition (the R2 route sends
      // Access-Control-Allow-Origin: *), which keeps the canvas untainted.
      const mapped = toMediaUrl(imageUrl);
      // Any other Supabase Storage object loads as itself: the render/image
      // transform endpoint is a paid feature this project lacks and answers
      // 403 FeatureNotEnabled (see supabaseImageLoader.ts), while public
      // objects send Access-Control-Allow-Origin: * and keep the canvas clean.
      const proxied = isMediaUrl(mapped) ? mediaRendition(mapped, 1920) : imageUrl;
      const mural = await loadImage(proxied, proxied.startsWith("http"));
      const aspect = mural.naturalWidth / mural.naturalHeight;
      // Same substitution as the live canvas preview, so the saved composite
      // shows the repeat the customer aligned rather than one scaled copy.
      const tiled = tilePx
        ? tiledWallTexture(mural, mural.naturalWidth, mural.naturalHeight,
            tilePx.tileW, tilePx.tileH, offsetX * tilePx.tileW, offsetY * tilePx.tileH, WALL_W, wallH)
        : null;
      const source: CanvasImageSource = tiled ?? mural;
      const disp = tiled ? { imgW: WALL_W, imgH: wallH } : coverLayout(WALL_W, wallH, aspect, zoom);

      const cpx = corners.map((c) => ({ x: c.x * PW, y: c.y * PH })) as Corners;
      // Curved mode: same Coons patch as the live canvas preview, so the
      // exported composite matches what the customer aligned on screen.
      const cmids = mids.map((m) => ({ x: m.x * PW, y: m.y * PH })) as EdgeMids;
      const map = curved
        ? coonsMapper(WALL_W, wallH, cpx, cmids)
        : quadMapper(WALL_W, wallH, cpx[0], cpx[1], cpx[2], cpx[3]);
      if (!map) return canvas.toDataURL("image/jpeg", 0.85);

      const dispW = disp.imgW;
      const dispH = disp.imgH;
      const offLeft = tiled ? 0 : offsetX * (dispW - WALL_W);
      const offTop = tiled ? 0 : offsetY * (dispH - wallH);
      const texW = tiled ? tiled.width : mural.naturalWidth;
      const texH = tiled ? tiled.height : mural.naturalHeight;
      // Mirror the sampled texture when the design is flipped, so the exported
      // composite matches the inline visualiser and the printed file. Never for
      // a seamless tile — a mirrored tile no longer meets its own edge.
      const fH = tiled ? false : (initial?.flipH ?? false);
      const fV = tiled ? false : (initial?.flipV ?? false);
      const tex = (u: number, v: number) => {
        const x = ((u + offLeft) / dispW) * texW;
        const y = ((v + offTop) / dispH) * texH;
        return { x: fH ? texW - x : x, y: fV ? texH - y : y };
      };

      // Warp the mural onto its own layer first, so it can be clipped to the
      // wall-only mask (if any) before compositing over the room photo —
      // that's what keeps furniture in front of the wall from being painted
      // over in the exported/saved image, matching the live preview.
      const muralCanvas = document.createElement("canvas");
      muralCanvas.width = PW;
      muralCanvas.height = PH;
      const mctx = muralCanvas.getContext("2d");
      if (!mctx) return canvas.toDataURL("image/jpeg", 0.85);

      const N = 24;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const u0 = (i / N) * WALL_W;
          const u1 = ((i + 1) / N) * WALL_W;
          const v0 = (j / N) * wallH;
          const v1 = ((j + 1) / N) * wallH;
          const s00 = tex(u0, v0), s10 = tex(u1, v0), s11 = tex(u1, v1), s01 = tex(u0, v1);
          const d00 = map(u0, v0), d10 = map(u1, v0), d11 = map(u1, v1), d01 = map(u0, v1);
          drawTriangle(mctx, source, s00, s10, s11, d00, d10, d11);
          drawTriangle(mctx, source, s00, s11, s01, d00, d11, d01);
        }
      }

      if (initial?.textOverlay) {
        if (!textOverlayUrl) throw new Error("Lettering preview is not ready");
        const lettering = await loadImage(textOverlayUrl, false);
        drawTextOverlayWarp(mctx, lettering, initial.textOverlay, WALL_W, wallH, map);
        if (initial.textOverlay.companion) {
          if (!companionUrl) throw new Error("Quote preview is not ready");
          drawTextOverlayWarp(mctx, await loadImage(companionUrl, false), initial.textOverlay.companion, WALL_W, wallH, map);
        }
      }

      // Skip the mask in curved mode — see the note above drawCurvedPreview().
      if (wallMaskImg && !curved && maskCoversWall) {
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(wallMaskImg, 0, 0, PW, PH);
        mctx.globalCompositeOperation = "source-over";
      }

      ctx.globalCompositeOperation = blend ? "multiply" : "source-over";
      ctx.drawImage(muralCanvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (e) {
      console.warn("room composite render failed:", e);
      return undefined;
    }
  };

  if (!open) return null;

  const save = async () => {
    const composite = await renderComposite();
    if (photo && photo !== "live") onRoomCapture?.(photo, corners, curved ? mids : undefined);
    onApply(
      {
        imageUrl,
        wallWidthCm,
        wallHeightCm,
        offsetX,
        offsetY,
        zoom,
        // The room preview doesn't (yet) render a flip, but the customer may
        // have set one in the inline visualiser — carry it through so saving a
        // room placement never silently un-flips the design. A seamless tile
        // is never flipped: mirroring breaks the seam, so drop any stale flag
        // rather than let it reach the print master.
        flipH: seamless ? false : initial?.flipH,
        flipV: seamless ? false : initial?.flipV,
        imageAspect: imgAspect ?? undefined,
        sourceW: srcDims?.w,
        sourceH: srcDims?.h,
        // Carried into crop_data so the print pipeline builds a repeated
        // master rather than stretching one copy.
        seamless: seamless ?? null,
      },
      composite,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-cloud shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between gap-4 border-b border-edge px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">{applianceCfg ? applianceCfg.visualizerLabel : artwork ? "Preview your artwork in your room" : "See it on your wall"}</h2>
            <p className="text-xs text-slate">
              {wallLabel} · {artwork ? "placement preview" : "sized to your wall as previewed"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full text-slate transition-colors hover:bg-wash hover:text-charcoal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!photo ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  onClick={startLiveCamera}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-charcoal bg-surface text-center transition-colors hover:bg-wash"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-charcoal text-surface">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /><path d="M9 2h6" /></svg>
                  </span>
                  <span className="font-display text-base font-bold">Live camera</span>
                  <span className="max-w-[26ch] text-xs text-slate">
                    Point at {possessive} and see it live, then capture.
                  </span>
                </button>
                <button
                  onClick={() => cameraFileRef.current?.click()}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-edge bg-surface text-center transition-colors hover:border-charcoal"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-blush/60">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
                  </span>
                  <span className="font-display text-base font-bold">Take a photo</span>
                  <span className="max-w-[26ch] text-xs text-slate">
                    Snap a still with your phone camera.
                  </span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-edge bg-surface text-center transition-colors hover:border-charcoal"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-lavender/60">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 16V5m0 0-4 4m4-4 4 4" /><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>
                  </span>
                  <span className="font-display text-base font-bold">Upload a photo</span>
                  <span className="max-w-[26ch] text-xs text-slate">
                    {isAppliance ? `Stand back, keep ${facePhrase} square in frame.` : artwork ? "Include the space where you want to hang the artwork." : "Stand back, keep the wall square in frame."}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setPhoto("sample");
                    setCorners(SAMPLE_CORNERS);
                    setCurved(false);
                  }}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] bg-sage/40 text-center transition-colors hover:bg-sage/60"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-surface/80">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9 20v-5.5h6V20" /></svg>
                  </span>
                  <span className="font-display text-base font-bold">Try a sample room</span>
                  <span className="max-w-[26ch] text-xs text-slate">
                    No photo handy? Preview it in our living room.
                  </span>
                </button>
              </div>
              {cameraError && (
                <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-center text-sm text-charcoal">
                  {cameraError}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-center text-xs text-slate">
                {photo === "live" ? (
                  <>
                    Point your camera at {isAppliance || artwork ? facePhrase : "the wall"}, line the <span className="font-semibold text-charcoal">round handles</span> up
                    with its corners, then <span className="font-semibold text-charcoal">Capture</span> when it looks right.
                  </>
                ) : (
                  <>
                    Drag the <span className="font-semibold text-charcoal">round handles</span> to the corners of {facePhrase},
                    then <span className="font-semibold text-charcoal">drag the design</span> to position it.
                  </>
                )}
              </p>
              {photo === "live" && motionOn && (
                <button
                  onClick={() => {
                    gyroBase.current = null;
                    setGyroOffset({ x: 0, y: 0 });
                  }}
                  className="rounded-full bg-charcoal/80 px-3 py-1 text-[0.68rem] font-semibold text-surface"
                >
                  ✦ Motion on · tap to recenter
                </button>
              )}
              {segmenting && (
                <p className="text-center text-xs text-mist">Detecting furniture, so the design stays off it…</p>
              )}
              {/* The one server step, offered rather than demanded. Only for a
                  photo picked here (a blob: object URL) — the sample room has
                  no furniture to detect, and a live feed is captured first. */}
              {!signedIn && !isAppliance && photo?.startsWith("blob:") && (
                <button
                  type="button"
                  onClick={() => gate("hide the design behind your furniture and save this room", occlude)}
                  className="text-center text-xs text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Verify your email to hide the design behind your furniture and save this room
                </button>
              )}

              <div
                ref={wrapRef}
                className={`relative select-none overflow-hidden rounded-[18px] ${
                  photo === "live" ? "w-full shrink-0 bg-charcoal" : "inline-block max-w-full"
                }`}
                style={photo === "live" ? { height: "min(52vh, 70vw)", maxWidth: 560 } : undefined}
              >
                {photo === "sample" ? (
                  <SampleRoom />
                ) : photo === "live" ? (
                  // Definite-sized wrap (above) drives layout; the live feed
                  // just fills it (object-contain = WYSIWYG with the captured
                  // still, so the framing the customer sees is what we snap).
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-contain"
                  />
                ) : (
                  // object-URL photo; next/image can't optimise blobs
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Your room" className="block max-h-[52vh] w-auto max-w-full" draggable={false} />
                )}

                {/* mural mapped onto the wall — flat mode only; curved mode
                    (below) can't be expressed as a matrix3d, so it swaps in
                    a mesh-warped canvas instead. */}
                {!curved && matrix && (
                  <div
                    className="absolute left-0 top-0 cursor-move overflow-hidden"
                    style={{
                      width: WALL_W,
                      height: wallH,
                      transformOrigin: "0 0",
                      // Gyro pseudo-AR: prepend a screen-space translate so the
                      // mural drifts opposite to phone motion (feels pinned).
                      transform:
                        photo === "live" && motionOn
                          ? `translate(${gyroOffset.x}px, ${gyroOffset.y}px) ${matrix}`
                          : matrix,
                      transition: photo === "live" && motionOn ? "transform 0.06s linear" : undefined,
                      mixBlendMode: blend ? "multiply" : "normal",
                      touchAction: "none",
                      ...(localMaskUrl
                        ? {
                            WebkitMaskImage: `url(${localMaskUrl})`,
                            maskImage: `url(${localMaskUrl})`,
                            WebkitMaskSize: "100% 100%",
                            maskSize: "100% 100%",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                          }
                        : {}),
                    } as React.CSSProperties}
                    onPointerDown={(e) => {
                      panLast.current = { x: e.clientX, y: e.clientY };
                      capture(e);
                    }}
                    onPointerMove={onPan}
                    onPointerUp={() => (panLast.current = null)}
                  >
                    {/* Seamless designs repeat with CSS rather than being sized
                        to the wall — background-repeat IS the tiling, so the
                        flat preview needs no canvas. The hidden <img> still
                        loads so the artwork's true pixel size is measured for
                        the repeat maths and the print resolution. */}
                    {tilePx ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          ref={flatImgRef}
                          src={imageUrl}
                          alt=""
                          aria-hidden
                          className="pointer-events-none absolute h-px w-px opacity-0"
                          onLoad={(e) => {
                            const w = e.currentTarget.naturalWidth;
                            const h = e.currentTarget.naturalHeight;
                            setImgAspect(w / h);
                            setSrcDims({ w, h });
                          }}
                        />
                        <div
                          role="img"
                          aria-label={imageAlt}
                          className="absolute inset-0"
                          style={{
                            backgroundImage: `url(${imageUrl})`,
                            backgroundRepeat: "repeat",
                            backgroundSize: `${tilePx.tileW}px ${tilePx.tileH}px`,
                            // Pan shifts WHICH part of the repeat meets the
                            // corner. It never resizes the motif.
                            backgroundPosition: `${-offsetX * tilePx.tileW}px ${-offsetY * tilePx.tileH}px`,
                          }}
                        />
                      </>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        ref={flatImgRef}
                        src={imageUrl}
                        alt={imageAlt}
                        draggable={false}
                        onLoad={(e) => {
                          const w = e.currentTarget.naturalWidth;
                          const h = e.currentTarget.naturalHeight;
                          setImgAspect(w / h);
                          setSrcDims({ w, h });
                        }}
                        className="absolute max-w-none"
                        style={
                          layout
                            ? {
                                width: layout.imgW,
                                height: layout.imgH,
                                left: -offsetX * (layout.imgW - WALL_W),
                                top: -offsetY * (layout.imgH - wallH),
                                transform: `scaleX(${initial?.flipH ? -1 : 1}) scaleY(${initial?.flipV ? -1 : 1})`,
                              }
                            : { width: "100%", height: "100%", objectFit: "cover", transform: `scaleX(${initial?.flipH ? -1 : 1}) scaleY(${initial?.flipV ? -1 : 1})` }
                        }
                      />
                    )}
                    {/* material finish grain, mapped in the same perspective as
                        the mural (textured finishes only). */}
                    {initial?.textOverlay && textOverlayUrl && <TextOverlayLayer overlay={initial.textOverlay} url={textOverlayUrl} wallWidthCm={wallWidthCm} wallHeightCm={wallHeightCm} />}
                    {initial?.textOverlay?.companion && companionUrl && <TextOverlayLayer overlay={initial.textOverlay.companion} url={companionUrl} wallWidthCm={wallWidthCm} wallHeightCm={wallHeightCm} />}
                    {textureUrl && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage: `url(${textureUrl})`,
                          backgroundSize: "140px 140px",
                          backgroundRepeat: "repeat",
                          mixBlendMode: "soft-light",
                          opacity: 0.5,
                        }}
                      />
                    )}
                  </div>
                )}

                {/* curved mode: mesh-warped canvas standing in for the div
                    above (same pan-drag, same blend mode via CSS). */}
                {curved && box.w > 0 && (
                  <canvas
                    ref={curvedCanvasRef}
                    className="absolute left-0 top-0 cursor-move"
                    style={{
                      mixBlendMode: blend ? "multiply" : "normal",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => {
                      panLast.current = { x: e.clientX, y: e.clientY };
                      capture(e);
                    }}
                    onPointerMove={onPan}
                    onPointerUp={() => (panLast.current = null)}
                  />
                )}

                {/* quad outline — the curved edges once curved mode is on */}
                {box.w > 0 && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    {curved ? (
                      <path
                        d={curvedOutlinePath}
                        fill="none"
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="1.5"
                        strokeDasharray="6 5"
                      />
                    ) : (
                      <polygon
                        points={px.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="1.5"
                        strokeDasharray="6 5"
                      />
                    )}
                  </svg>
                )}

                {/* curve handles (top/right/bottom/left) — curved mode only */}
                {curved &&
                  box.w > 0 &&
                  pxMids.map((p, i) => (
                    <button
                      key={`mid-${i}`}
                      aria-label={`Curve handle ${["top", "right", "bottom", "left"][i]}`}
                      className="absolute z-10 h-5 w-5 rotate-45 -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-charcoal bg-surface shadow-md active:cursor-grabbing"
                      style={{ left: p.x, top: p.y, touchAction: "none" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragMid.current = i;
                        capture(e);
                      }}
                      onPointerMove={(e) => {
                        if (dragMid.current === i) moveMid(i, e);
                      }}
                      onPointerUp={() => (dragMid.current = null)}
                    />
                  ))}

                {/* corner handles */}
                {box.w > 0 &&
                  px.map((p, i) => (
                    <button
                      key={i}
                      aria-label={`${applianceCfg ? applianceCfg.label : "Wall"} corner ${i + 1}`}
                      className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-charcoal bg-surface shadow-md active:cursor-grabbing"
                      style={{ left: p.x, top: p.y, touchAction: "none" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragCorner.current = i;
                        capture(e);
                      }}
                      onPointerMove={(e) => {
                        if (dragCorner.current === i) moveCorner(i, e);
                      }}
                      onPointerUp={() => (dragCorner.current = null)}
                    />
                  ))}
              </div>

              {/* controls */}
              <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-3">
                {/* crop mini-map */}
                {layout && (
                  <div
                    className="relative h-14 overflow-hidden rounded-[8px] bg-wash"
                    style={{ aspectRatio: `${imgAspect}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="" className="h-full w-full object-cover opacity-60" />
                    <span
                      className="absolute rounded-[3px] border-2 border-charcoal"
                      style={{
                        left: `${offsetX * (1 - WALL_W / layout.imgW) * 100}%`,
                        top: `${offsetY * (1 - wallH / layout.imgH) * 100}%`,
                        width: `${(WALL_W / layout.imgW) * 100}%`,
                        height: `${(wallH / layout.imgH) * 100}%`,
                      }}
                    />
                  </div>
                )}
                {/* A seamless design's scale is the studio's decision, fixed at
                    the size the pattern was drawn for — so there is no zoom to
                    offer. Dragging still works and shifts the repeat's phase. */}
                {tilePx ? (
                  <span className="text-xs font-medium text-slate">
                    Repeats every {Math.round(seamless!.repeatWidthCm)} cm · drag to shift the pattern
                  </span>
                ) : (
                  <label className="flex items-center gap-3 text-xs font-medium text-slate">
                    Zoom
                    <input
                      type="range"
                      min={1}
                      max={2.5}
                      step={0.01}
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-32 accent-charcoal"
                    />
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate">
                  <input
                    type="checkbox"
                    checked={blend}
                    onChange={(e) => setBlend(e.target.checked)}
                    className="h-4 w-4 accent-charcoal"
                  />
                  {isAppliance || artwork ? "Blend with the room's lighting" : "Blend with wall lighting"}
                </label>
                {!artwork && photo !== "live" && photo !== "sample" && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate">
                    <input
                      type="checkbox"
                      checked={curved}
                      onChange={(e) => setCurved(e.target.checked)}
                      className="h-4 w-4 accent-charcoal"
                    />
                    {isAppliance ? `Curved surface (${facePhrase} probably bows slightly)` : "Curved surface (column / arch)"}
                  </label>
                )}
                <button
                  onClick={() => {
                    stopStream();
                    setPhoto(null);
                    setWallMaskImg(null);
                  }}
                  className="text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  {photo === "live" ? "Use a different option" : "Change photo"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 border-t border-edge px-6 py-4">
          <button onClick={onClose} className="btn btn-ghost h-11 px-6 text-[0.78rem]">
            Cancel
          </button>
          {photo === "live" ? (
            <button onClick={captureLiveFrame} className="btn h-11 px-6 text-[0.78rem]">
              Capture this view
            </button>
          ) : (
            <button onClick={save} disabled={!photo} className="btn h-11 px-6 text-[0.78rem]">
              {/* NOT "Save placement" — this only locks the framing for the page
                  behind it. Saving to the customer's account is a separate,
                  explicit "Save to my board" step on each surface. */}
              Use this placement
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {authModal}
      </div>
    </div>
  );
}

/** Flat illustrated living room in the brand pastels, for photo-less previews. */
function SampleRoom() {
  return (
    <svg viewBox="0 0 1600 1000" width={1600} height={1000} className="block h-auto max-h-[52vh] w-auto max-w-full">
      {/* wall + floor */}
      <rect width="1600" height="1000" fill="#EFEAE3" />
      <rect y="780" width="1600" height="220" fill="#DDD2C4" />
      <rect y="768" width="1600" height="14" fill="#F5F1EA" />
      {/* window light */}
      <rect x="1180" y="60" width="340" height="620" rx="10" fill="#F7F3EC" opacity="0.85" />
      <rect x="1340" y="60" width="10" height="620" fill="#EFEAE3" />
      <rect x="1180" y="360" width="340" height="10" fill="#EFEAE3" />
      {/* sofa */}
      <rect x="330" y="600" width="640" height="90" rx="34" fill="#C9D8C6" />
      <rect x="360" y="520" width="260" height="120" rx="26" fill="#D4E0D1" />
      <rect x="630" y="520" width="260" height="120" rx="26" fill="#D4E0D1" />
      <rect x="300" y="560" width="70" height="140" rx="24" fill="#BFD0BC" />
      <rect x="930" y="560" width="70" height="140" rx="24" fill="#BFD0BC" />
      <rect x="345" y="690" width="24" height="70" rx="8" fill="#8A8378" />
      <rect x="925" y="690" width="24" height="70" rx="8" fill="#8A8378" />
      {/* cushions */}
      <rect x="420" y="545" width="110" height="85" rx="20" fill="#EFD9DD" />
      <rect x="740" y="545" width="110" height="85" rx="20" fill="#DCD5E8" />
      {/* plant */}
      <ellipse cx="1120" cy="640" rx="46" ry="60" fill="#A9C4A4" />
      <ellipse cx="1090" cy="600" rx="34" ry="52" fill="#B7CFB2" />
      <ellipse cx="1150" cy="596" rx="30" ry="48" fill="#9DBB98" />
      <path d="M1096 738h48l10-70h-68z" fill="#D9C8B4" />
      {/* rug */}
      <ellipse cx="660" cy="850" rx="360" ry="64" fill="#E7DFD2" />
    </svg>
  );
}
