"use client";

/**
 * WallMeasure — measure a wall with the phone camera, no LiDAR required.
 *
 * Uses the browser-native WebXR "immersive-ar" session with hit-testing: the
 * phone's own visual-inertial tracking gives TRUE metric scale (metres), so
 * two taps on the wall's corners yield a real-world distance. This replaces the
 * heavyweight GPU SLAM route (LingBot-Map / SLAM3R) with something that runs
 * on-device, needs zero inference infra, and drops straight into the two fields
 * the configurator already has (width + height, stored in mm).
 *
 * Platform reality: WebXR AR ships on Android Chrome/Edge. iOS Safari does NOT
 * expose WebXR, and desktops have no AR — so we detect support up-front and,
 * where it's missing, fall back honestly to manual entry + the how-to-measure
 * guide rather than pretending to measure.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal local typings so we don't depend on @types/webxr being installed.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Vec3 = { x: number; y: number; z: number };
type Step = "width" | "height" | "review";

const dist = (a: Vec3, b: Vec3) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

/**
 * Where the camera's forward ray meets the vertical plane that passes through
 * `base` and faces the camera. Lets us place the TOP-of-wall point from the
 * camera pose alone when the wall itself returns no hit-test result — the base
 * is a real floor/wall-foot hit, and the wall is treated as vertical (its
 * normal the horizontal direction from the base toward the camera). Returns
 * null if the ray is parallel to the wall or points away from it.
 */
function rayVerticalPlaneHit(base: Vec3, camera: Vec3, forward: Vec3): Vec3 | null {
  // Horizontal normal from base → camera (wall assumed vertical, user facing it).
  let nx = camera.x - base.x;
  let nz = camera.z - base.z;
  const nl = Math.hypot(nx, nz);
  if (nl < 1e-4) return null;
  nx /= nl;
  nz /= nl;
  const denom = forward.x * nx + forward.z * nz; // dot(forward, n), n.y = 0
  if (Math.abs(denom) < 1e-4) return null; // ray parallel to the wall
  const t = ((base.x - camera.x) * nx + (base.z - camera.z) * nz) / denom;
  if (t <= 0) return null; // wall is behind the aim direction
  return { x: camera.x + forward.x * t, y: camera.y + forward.y * t, z: camera.z + forward.z * t };
}

export function WallMeasure({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  /** measured wall size, both in millimetres (canonical unit in the configurator) */
  onResult: (widthMm: number, heightMm: number) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null); // null = still checking
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("width");
  const [reticle, setReticle] = useState(false); // is a surface currently detected under the crosshair
  const [needAim, setNeedAim] = useState(false); // tapped, but no surface was under the crosshair
  const [cornersPlaced, setCornersPlaced] = useState(0); // corners placed in the CURRENT step (0 or 1)
  const [widthMm, setWidthMm] = useState<number | null>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);

  // Live measurement scratch state, kept in refs so the render loop never
  // re-subscribes. `points` holds the current step's placed corners.
  const points = useRef<Vec3[]>([]);
  const lastHit = useRef<Vec3 | null>(null);
  // Live camera pose (world space), refreshed every frame — used to synthesise
  // the top-of-wall point for HEIGHT, since blank vertical walls rarely return a
  // hit-test result even though the floor does.
  const viewerPos = useRef<Vec3 | null>(null);
  const viewerFwd = useRef<Vec3 | null>(null);
  const stepRef = useRef<Step>("width");
  const sessionRef = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Guards against a single tap committing twice — a DOM tap on the overlay and
  // the WebXR `select` event can both fire for the same touch.
  const lastCommitTs = useRef(0);
  // When the last usable hit was seen. Surface tracking on a blank wall flickers,
  // so a tap within a short grace window still commits the last good point
  // instead of missing because the reticle blinked off that exact frame.
  const lastHitTs = useRef(0);
  const HIT_GRACE_MS = 400;

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Feature-detect WebXR AR whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const xr = (navigator as any).xr;
    if (!xr?.isSessionSupported) {
      setSupported(false);
      return;
    }
    xr.isSessionSupported("immersive-ar")
      .then((ok: boolean) => !cancelled && setSupported(ok))
      .catch(() => !cancelled && setSupported(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const endSession = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const s = sessionRef.current;
    sessionRef.current = null;
    setRunning(false);
    if (s) s.end?.().catch(() => {});
  }, []);

  // Tear down the AR session if the sheet is closed while running.
  useEffect(() => {
    if (!open) endSession();
    return endSession;
  }, [open, endSession]);

  const commitPoint = useCallback(() => {
    // Debounce: a DOM tap and the XR `select` can both arrive for one touch.
    const now = Date.now();
    if (now - lastCommitTs.current < 350) return;

    const hit = lastHit.current;
    // Accept the last good hit if it's fresh enough — tolerates the reticle
    // flickering off the exact frame the user taps.
    if (!hit || now - lastHitTs.current > HIT_GRACE_MS) {
      // Nothing usable under the crosshair — say so instead of silently doing
      // nothing (this is what "tapping does nothing" looks like).
      setNeedAim(true);
      return;
    }
    lastCommitTs.current = now;
    setNeedAim(false);
    points.current = [...points.current, hit];
    setCornersPlaced(points.current.length);

    if (points.current.length >= 2) {
      const [a, b] = points.current;
      // Width: straight-line (horizontal) distance between two floor points.
      // Height: the vertical rise between the wall foot and the synthesised top,
      // so a slightly off-axis aim doesn't inflate it with horizontal drift.
      const mm =
        stepRef.current === "height"
          ? Math.round(Math.abs(b.y - a.y) * 1000)
          : Math.round(dist(a, b) * 1000);
      points.current = [];
      setCornersPlaced(0);
      if (stepRef.current === "width") {
        setWidthMm(mm);
        setStep("height");
      } else if (stepRef.current === "height") {
        setHeightMm(mm);
        setStep("review");
      }
    }
  }, []);

  const startSession = useCallback(async () => {
    setError(null);
    setWidthMm(null);
    setHeightMm(null);
    setStep("width");
    setNeedAim(false);
    setCornersPlaced(0);
    stepRef.current = "width";
    points.current = [];
    lastHit.current = null;
    lastCommitTs.current = 0;
    lastHitTs.current = 0;
    viewerPos.current = null;
    viewerFwd.current = null;

    const overlay = document.getElementById("wall-measure-overlay") ?? undefined;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: true }) as any;
      if (!gl) throw new Error("WebGL unavailable");
      await gl.makeXRCompatible?.();

      const session: any = await (navigator as any).xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "plane-detection"],
        domOverlay: overlay ? { root: overlay } : undefined,
      });
      sessionRef.current = session;
      setRunning(true);

      session.updateRenderState({
        baseLayer: new (window as any).XRWebGLLayer(session, gl),
      });

      const localSpace = await session.requestReferenceSpace("local");
      const viewerSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      const onSelect = () => commitPoint();
      session.addEventListener("select", onSelect);
      const onEnd = () => {
        setRunning(false);
        sessionRef.current = null;
      };
      session.addEventListener("end", onEnd);

      cleanupRef.current = () => {
        session.removeEventListener("select", onSelect);
        session.removeEventListener("end", onEnd);
        hitTestSource?.cancel?.();
      };

      const onFrame = (_t: number, frame: any) => {
        const s = frame.session;
        if (!sessionRef.current) return;
        s.requestAnimationFrame(onFrame);

        const glLayer = s.renderState.baseLayer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
        gl.viewport(0, 0, glLayer.framebufferWidth, glLayer.framebufferHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Track the live camera pose (needed to synthesise the wall-top point).
        const vp = frame.getViewerPose(localSpace);
        if (vp) {
          const m = vp.transform.matrix; // column-major 4x4
          viewerPos.current = { x: m[12], y: m[13], z: m[14] };
          const fx = -m[8], fy = -m[9], fz = -m[10]; // camera looks down -Z
          const fl = Math.hypot(fx, fy, fz) || 1;
          viewerFwd.current = { x: fx / fl, y: fy / fl, z: fz / fl };
        }

        // Effective hit under the crosshair. WIDTH and the FOOT of the height use
        // the real hit-test (the floor/wall-foot registers fine). For the TOP of
        // the height there's usually no wall hit, so cast the camera ray onto the
        // vertical plane through the already-placed foot point.
        let eff: Vec3 | null = null;
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length > 0) {
          const pose = hits[0].getPose(localSpace);
          if (pose) {
            const p = pose.transform.position;
            eff = { x: p.x, y: p.y, z: p.z };
          }
        }
        if (!eff && stepRef.current === "height" && points.current.length === 1 && viewerPos.current && viewerFwd.current) {
          eff = rayVerticalPlaneHit(points.current[0], viewerPos.current, viewerFwd.current);
        }

        if (eff) {
          lastHit.current = eff;
          lastHitTs.current = Date.now(); // same clock commitPoint compares against
          setReticle((prev) => (prev ? prev : true));
          setNeedAim((prev) => (prev ? false : prev));
          return;
        }
        // Keep the last good hit for the grace window; just drop the live reticle.
        setReticle((prev) => (prev ? false : prev));
      };
      session.requestAnimationFrame(onFrame);
    } catch (e: any) {
      setError(e?.message || "Could not start the camera measurement.");
      endSession();
    }
  }, [commitPoint, endSession]);

  const restart = useCallback(() => {
    setWidthMm(null);
    setHeightMm(null);
    setStep("width");
    setNeedAim(false);
    setCornersPlaced(0);
    stepRef.current = "width";
    points.current = [];
    lastHit.current = null;
    lastCommitTs.current = 0;
    lastHitTs.current = 0;
  }, []);

  const confirm = useCallback(() => {
    if (widthMm && heightMm) {
      // Remember the measured wall for the rest of the visit so product pages
      // can pre-fill their size fields (read in ProductConfigurator).
      try {
        sessionStorage.setItem(
          "zyv:measured-wall",
          JSON.stringify({ wMm: widthMm, hMm: heightMm, at: Date.now() }),
        );
      } catch {}
      onResult(widthMm, heightMm);
    }
    endSession();
    onClose();
  }, [widthMm, heightMm, onResult, endSession, onClose]);

  if (!open) return null;

  const fmt = (mm: number | null) =>
    mm == null ? "—" : `${(mm / 304.8).toFixed(2)} ft (${Math.round(mm)} mm)`;

  const stepLabel =
    step === "width"
      ? "Measure the WIDTH"
      : step === "height"
        ? "Measure the HEIGHT"
        : "Review";
  const widthHint =
    cornersPlaced === 0
      ? "Stand close to one side of the wall. When the ring turns green, tap — then walk to the other side."
      : "Now walk to the other side, wait for green, and tap. Keep the camera steady as you move.";
  // Height can't rely on the wall itself tracking, so measure from the floor up:
  // tap where the wall meets the floor, then tilt up to the top and tap.
  const heightHint =
    cornersPlaced === 0
      ? "Aim at the bottom of the wall, where it meets the floor. When the ring turns green, tap."
      : "Now tilt up to the top of the wall and tap — the ring stays green as you tilt, no need for it to lock onto the wall.";
  const stepHint =
    step === "review"
      ? "Looks right? We'll drop these into your wall size."
      : needAim
        ? "No surface yet — aim at the floor near the wall, or near an edge, skirting or socket, until the ring turns green."
        : step === "width"
          ? widthHint
          : heightHint;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      {/* --- The AR overlay (dom-overlay root). Only visible while a session runs. --- */}
      <div
        id="wall-measure-overlay"
        className="pointer-events-none fixed inset-0 z-[130]"
        style={{ display: running ? "block" : "none" }}
      >
        {/* Full-area tap surface: placing a point is driven by a DOM tap here
            (reading the live hit under the centre crosshair), NOT the WebXR
            `select` event — with dom-overlay active a tap on the overlay is
            consumed as a DOM event and `select` often never fires, which is why
            tapping appeared to do nothing. It sits BELOW the HUD (z-10) so the
            buttons still receive their own taps. Disabled on the review step. */}
        {step !== "review" && (
          <button
            type="button"
            onClick={commitPoint}
            aria-label="Place point at the crosshair"
            className="pointer-events-auto absolute inset-0 h-full w-full cursor-crosshair bg-transparent"
          />
        )}

        {/* HUD — pass-through wrapper (pointer-events-none) so a tap on the
            crosshair area falls through to the tap surface; the card and the
            control bar re-enable pointer events just for themselves. */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
          <div className="pointer-events-auto m-3 rounded-2xl bg-black/55 px-4 py-3 text-center text-white backdrop-blur">
            <p className="text-sm font-semibold tracking-wide">{stepLabel}</p>
            <p className="mt-0.5 text-xs opacity-90">{stepHint}</p>
            <div className="mt-1 flex justify-center gap-4 text-[11px] opacity-90">
              <span>W: {fmt(widthMm)}</span>
              <span>H: {fmt(heightMm)}</span>
            </div>
          </div>

          {/* Centre crosshair — the hit ray is cast through screen centre */}
          <div className="flex flex-1 items-center justify-center">
            <div
              className="relative h-16 w-16 rounded-full border-2 transition-colors"
              style={{ borderColor: reticle ? "#5ff08a" : "rgba(255,255,255,.55)" }}
            >
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: reticle ? "#5ff08a" : "rgba(255,255,255,.55)" }} />
            </div>
          </div>

          <div className="pointer-events-auto m-3 flex items-center justify-center gap-3">
            {step === "review" ? (
              <>
                <button onClick={restart} className="rounded-full bg-white/15 px-5 py-3 text-sm font-medium text-white backdrop-blur">
                  Redo
                </button>
                <button onClick={confirm} className="rounded-full bg-[#5ff08a] px-6 py-3 text-sm font-semibold text-black">
                  Use these
                </button>
              </>
            ) : (
              <button
                onClick={commitPoint}
                className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition-colors"
                style={{ opacity: reticle ? 1 : 0.55 }}
              >
                {cornersPlaced === 0 ? "Set corner 1" : "Set corner 2"}
              </button>
            )}
            <button onClick={endSession} className="rounded-full bg-white/15 px-5 py-3 text-sm font-medium text-white backdrop-blur">
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* --- The launch / fallback card (shown before/without an AR session) --- */}
      {!running && (
        <div className="w-full max-w-sm rounded-[22px] bg-white p-6 text-center shadow-2xl">
          <button
            onClick={() => {
              endSession();
              onClose();
            }}
            aria-label="Close"
            className="ml-auto block text-mist hover:text-charcoal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>

          <h3 className="mt-1 text-lg font-semibold text-charcoal">Measure with your phone</h3>

          {supported === null && <p className="mt-3 text-sm text-slate">Checking your device…</p>}

          {supported === true && (
            <>
              <p className="mt-2 text-sm text-slate">
                Measure one edge at a time: stand close to a corner until the ring turns
                green, tap, then walk to the next corner and tap. Your phone tracks the
                distance as you move — no app, no LiDAR needed.
              </p>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button onClick={startSession} className="btn btn-primary mt-5 w-full">
                Start camera measure
              </button>
              <p className="mt-3 text-xs text-mist">
                Move your phone slowly for a moment first so it can lock on. Plain walls
                track best when you aim near an edge, skirting, frame or socket.
              </p>
            </>
          )}

          {supported === false && (
            <>
              <p className="mt-2 text-sm text-slate">
                Camera measuring isn&apos;t available on this device — entering your
                wall size only takes a second.
              </p>
              <a
                href="/how-to-measure"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary mt-5 inline-block w-full"
              >
                How to measure
              </a>
              <button
                onClick={() => {
                  endSession();
                  onClose();
                }}
                className="btn btn-ghost mt-2 w-full text-sm"
              >
                Enter it manually
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
