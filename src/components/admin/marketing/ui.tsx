"use client";

import type { CSSProperties, ReactNode } from "react";

// Small pieces the desk is built from. Inline styles, like the rest of the
// staff pages — no design system to load, nothing to theme.

export const INK = "#0F0F0F";
export const MIST = "#6b6b6b";
export const LINE = "#e8e6e1";
export const PAPER = "#faf9f6";
export const CYAN = "#48b3d7";

export function Pill({ label, colour, bg, style }: { label: string; colour: string; bg: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        color: colour,
        background: bg,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  kind = "ghost",
  disabled,
  small,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger" | "dark";
  disabled?: boolean;
  small?: boolean;
  title?: string;
}) {
  const base: CSSProperties = {
    padding: small ? "5px 11px" : "7px 15px",
    borderRadius: 999,
    fontSize: small ? 12 : 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    border: "1px solid #d0d7de",
    background: "#fff",
    color: INK,
    opacity: disabled ? 0.55 : 1,
    fontFamily: "inherit",
  };
  const kinds: Record<string, CSSProperties> = {
    primary: { background: "#0969da", color: "#fff", border: "1px solid #0969da" },
    dark: { background: INK, color: "#fff", border: `1px solid ${INK}` },
    danger: { color: "#cf222e" },
    ghost: {},
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...kinds[kind] }}>
      {children}
    </button>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, background: "#fff", ...style }}>{children}</div>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: MIST, marginBottom: 6 }}>{children}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, color: MIST, margin: "8px 0" }}>{children}</p>;
}
