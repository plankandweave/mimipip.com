"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  canContinueTour,
  nextTourPage,
  tourCardPosition,
  tourSteps,
  tourStorageKey,
  type TourIdentity,
  type TourPage,
} from "@/lib/partner-tour";
type Rect = { left: number; top: number; width: number; height: number };
export default function PortalTour({
  slug,
  identity,
  page,
}: {
  slug: string;
  identity: TourIdentity;
  page: TourPage;
}) {
  const [mode, setMode] = useState<"closed" | "welcome" | "tour">("closed");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [cardHeight, setCardHeight] = useState(290);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const key = tourStorageKey(slug, identity);
  const steps = tourSteps(page, identity),
    step = steps[index];
  const remember = useCallback(() => {
    try {
      localStorage.setItem(key, "seen");
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [key]);
  const close = useCallback(() => {
    remember();
    setMode("closed");
  }, [remember]);
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(`${key}:continue`);
      sessionStorage.removeItem(`${key}:continue`);
      if (canContinueTour(pending, page, Date.now())) {
        setMode("tour");
        return;
      }
      if (!localStorage.getItem(key)) setMode("welcome");
    } catch {
      /* The permanent trigger works when browser storage is unavailable. */
    }
  }, [key, page]);
  const start = () => {
    remember();
    setIndex(0);
    setMode("tour");
  };
  const next = () => {
    if (index < steps.length - 1) {
      setIndex(index + 1);
      return;
    }
    const nextPage = nextTourPage(page, identity);
    if (!nextPage) {
      close();
      return;
    }
    try {
      sessionStorage.setItem(
        `${key}:continue`,
        JSON.stringify({ page: nextPage, at: Date.now() }),
      );
    } catch {}
    remember();
    location.assign(`/partners/${slug}/${nextPage}`);
  };
  useEffect(() => {
    if (mode === "closed") return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      const previous = previousFocus.current;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else trigger.current?.focus();
    };
  }, [mode]);
  useEffect(() => {
    if (mode !== "tour") return;
    let frame = 0;
    const target = () =>
      document.querySelector<HTMLElement>(step.target) ||
      (step.fallback
        ? document.querySelector<HTMLElement>(step.fallback)
        : null);
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = target()?.getBoundingClientRect();
        setRect(
          bounds
            ? {
                left: bounds.left - 6,
                top: bounds.top - 6,
                width: bounds.width + 12,
                height: bounds.height + 12,
              }
            : null,
        );
        setViewport({ width: window.innerWidth, height: window.innerHeight });
        setCardHeight(dialog.current?.offsetHeight ?? 290);
      });
    };
    target()?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = new MutationObserver(measure);
    // Only observe portal content, never the overlay's own positioning changes.
    const content =
      document.querySelector("main") ||
      document.querySelector('[data-portal-tour="roster"]')?.parentElement;
    if (content) observer.observe(content, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer.disconnect();
    };
  }, [mode, index, step.target, step.fallback]);
  function keyboard(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    if (mode === "tour" && e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
    if (mode === "tour" && e.key === "ArrowLeft") {
      e.preventDefault();
      setIndex(Math.max(0, index - 1));
    }
    if (e.key === "Tab") {
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      );
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  const position = tourCardPosition(rect, viewport, cardHeight);
  const nextPage = nextTourPage(page, identity);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={start}
        className="underline underline-offset-4"
      >
        Take a tour
      </button>
      {mode !== "closed" && (
        <div className="fixed inset-0 z-[1000]" onKeyDown={keyboard}>
          {mode === "welcome" ? (
            <div className="absolute inset-0 bg-black/55" />
          ) : (
            <svg
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              preserveAspectRatio="none"
            >
              <path
                fill="rgba(0,0,0,.58)"
                fillRule="evenodd"
                d={`M0 0H${viewport.width}V${viewport.height}H0Z${rect ? ` M${rect.left} ${rect.top}v${rect.height}h${rect.width}v-${rect.height}Z` : ""}`}
              />
              {rect && (
                <rect
                  className="portal-tour-highlight"
                  x={rect.left}
                  y={rect.top}
                  width={rect.width}
                  height={rect.height}
                  rx="6"
                  fill="none"
                  stroke="#f3d696"
                  strokeWidth="3"
                />
              )}
              {rect && (
                <path
                  className="portal-tour-highlight"
                  d={`M${position.left + position.width / 2} ${position.top < rect.top ? position.top + cardHeight : position.top} L${Math.max(8, Math.min(viewport.width - 8, rect.left + rect.width / 2))} ${position.top < rect.top ? rect.top : rect.top + rect.height}`}
                  stroke="#f3d696"
                  strokeWidth="2"
                  markerEnd="url(#portal-tour-arrow)"
                />
              )}
              <defs>
                <marker
                  id="portal-tour-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path
                    d="M0 0L6 3L0 6"
                    fill="none"
                    stroke="#f3d696"
                    strokeWidth="1.5"
                  />
                </marker>
              </defs>
            </svg>
          )}
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-tour-title"
            aria-describedby="portal-tour-body"
            className="fixed rounded-xl border border-stone-200 bg-white p-5 text-stone-800 shadow-2xl"
            style={
              mode === "welcome"
                ? {
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                    width: "min(420px,calc(100vw - 24px))",
                  }
                : {
                    ...position,
                    maxHeight: "calc(100dvh - 24px)",
                    overflowY: "auto",
                  }
            }
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-widest text-stone-500">
                {mode === "welcome"
                  ? "Welcome to HomeLane's portal"
                  : `Step ${index + 1} of ${steps.length}`}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close tour"
                className="rounded p-2 text-sm"
              >
                ✕
              </button>
            </div>
            <h2
              id="portal-tour-title"
              className="mt-2 text-xl font-medium"
              aria-live="polite"
            >
              {mode === "welcome"
                ? "A quick guide to your workspace"
                : step.title}
            </h2>
            <p id="portal-tour-body" className="mt-3 text-sm leading-relaxed">
              {mode === "welcome"
                ? "See the controls available to your role, from customer projects to the PO handoff. The tour only explains; it won't save options, add colleagues or release orders. You can reopen it with Take a tour."
                : step.body}
            </p>
            <div className="mt-5 flex items-center justify-between gap-3">
              {mode === "welcome" ? (
                <>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded border px-4 py-2 text-sm"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={start}
                    className="rounded bg-stone-800 px-4 py-2 text-sm text-white"
                  >
                    Start tour
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => setIndex(index - 1)}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="rounded bg-stone-800 px-4 py-2 text-sm text-white"
                  >
                    {index < steps.length - 1
                      ? "Next"
                      : nextPage === "team"
                        ? "Continue to Team"
                        : nextPage === "documents"
                          ? "Continue to Documents"
                          : "Finish"}
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-xs text-stone-500">
              Escape closes · Arrow keys move between steps
            </p>
          </div>
        </div>
      )}
    </>
  );
}
