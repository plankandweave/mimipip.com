"use client";

import { useLayoutEffect, useRef, useState, type ElementType } from "react";

type FitTextProps = {
  children: string;
  as?: ElementType;
  className?: string;
  minRem?: number;
  maxRem?: number;
};

type Fit = { fontSize: number; wrap: boolean };

// Scales the font size so the text spans the full width of its container on
// one line, then shrinks with the viewport instead of wrapping — down to a
// readable floor. Below that floor (a long title on a narrow phone) it falls
// back to wrapping at the floor size instead of overflowing the container.
export default function FitText({
  children,
  as: Tag = "h1",
  className,
  minRem = 1.75,
  maxRem = 7,
}: FitTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const measure = () => {
      const containerWidth = container.clientWidth;
      if (!containerWidth) return;

      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const probeRem = 4;
      text.style.whiteSpace = "nowrap";
      text.style.fontSize = `${probeRem}rem`;
      const probeWidth = text.scrollWidth;
      if (!probeWidth) return;

      const fitRem = (containerWidth / probeWidth) * probeRem;
      const wrap = fitRem < minRem;
      const clampedRem = wrap ? minRem : Math.min(maxRem, fitRem);

      text.style.whiteSpace = wrap ? "normal" : "nowrap";
      text.style.fontSize = `${clampedRem}rem`;
      setFit({ fontSize: clampedRem * rootSize, wrap });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [children, minRem, maxRem]);

  return (
    <div ref={containerRef} className="w-full">
      <Tag
        ref={textRef as never}
        className={className}
        style={{
          whiteSpace: fit?.wrap ? "normal" : "nowrap",
          display: fit?.wrap ? "block" : "inline-block",
          fontSize: fit ? `${fit.fontSize}px` : undefined,
        }}
      >
        {children}
      </Tag>
    </div>
  );
}
