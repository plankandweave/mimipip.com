// ─── Trace: walking a campus with a phone ───────────────────────────────────
//
// Pure rules shared by the public recorder page, its API and the Vault's
// review of a walk. No server-only machinery here, so the phone can import it.
//
// WHY PIECES. The partner-portal walkthrough records one space in one go and
// caps itself at three minutes, because a phone buffers the whole recording in
// memory and uploads it in one PUT. A campus is not one space: the walk from
// the entrance to B1 block is an hour, and an hour is not one file. So a Trace
// walk is recorded in PIECES of a few minutes, each uploaded while the next is
// being recorded. A dropped signal, a dead battery or a killed browser loses
// at most the piece in hand, never the walk.

/** One piece. Three minutes at phone quality is ~35 MB, inside every limit the
 *  store already enforces for a walkthrough recording. */
export const PIECE_SECONDS = 180;
/** A long campus walk. Sixty pieces is three hours, which is more than anyone
 *  narrates in one go and still a bounded amount of storage per link. */
export const MAX_PIECES = 60;
export const MAX_WALK_SECONDS = PIECE_SECONDS * MAX_PIECES;
/** Taps per walk. A campus walk marks more walls than a shop does. */
export const MAX_MARKS = 120;

export const MAX_PIECE_VIDEO_BYTES = 96 * 1024 * 1024;
export const MAX_PIECE_AUDIO_BYTES = 12 * 1024 * 1024;
export const MAX_STILL_BYTES = 6 * 1024 * 1024;

/** 14 days, like a measurement link: a campus is walked over several visits. */
export const DEFAULT_LINK_DAYS = 14;
export const MAX_LINK_DAYS = 60;

/** Shape of a bearer token (base64url of 32 bytes, 43 chars). Checked before
 *  any lookup so a hostile path segment never becomes a query. */
export const looksLikeTraceToken = (raw: string) => /^[A-Za-z0-9_-]{40,64}$/.test(raw);

export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** Which piece a moment of the walk fell in (1-based), and how far into it. */
export function pieceAt(walkSeconds: number, pieceSeconds = PIECE_SECONDS): { seq: number; atSeconds: number } {
  const s = Math.max(0, walkSeconds);
  const seq = Math.floor(s / pieceSeconds) + 1;
  return { seq, atSeconds: s - (seq - 1) * pieceSeconds };
}

export type PieceSummary = { seq: number; seconds: number | null; hasVideo: boolean; hasAudio: boolean; transcribed: boolean };

/** "14 min · 5 pieces · 7 walls marked" — the one line a walk is listed by. */
export function describeWalk(input: { pieces: PieceSummary[]; marks: number }): string {
  const seconds = input.pieces.reduce((n, p) => n + (p.seconds ?? 0), 0);
  const minutes = Math.round(seconds / 60);
  const parts = [
    seconds < 60 ? `${seconds} sec` : `${minutes} min`,
    `${input.pieces.length} ${input.pieces.length === 1 ? "piece" : "pieces"}`,
    `${input.marks} ${input.marks === 1 ? "wall" : "walls"} marked`,
  ];
  return parts.join(" · ");
}

/** How much of a walk has its words. Transcription fails soft, so the Vault
 *  says plainly which pieces still have no transcript rather than hiding it. */
export function transcriptCoverage(pieces: PieceSummary[]): { done: number; total: number; complete: boolean } {
  const withAudio = pieces.filter((p) => p.hasAudio);
  const done = withAudio.filter((p) => p.transcribed).length;
  return { done, total: withAudio.length, complete: withAudio.length > 0 && done === withAudio.length };
}

export type TraceLinkState = "ok" | "expired" | "revoked" | "unknown";

/** The screen a holder of a closed link sees. It leaks nothing: whoever reads
 *  it already holds the token. */
export function closedLinkMessage(state: TraceLinkState): string | null {
  switch (state) {
    case "ok": return null;
    case "expired": return "This walk link has expired. Ask Zyvorah for a fresh one and the walk can continue.";
    case "revoked": return "This walk link is no longer active. Ask Zyvorah for a fresh one.";
    default: return "This link is not active.";
  }
}

/** The whole walk's transcript, piece by piece, in the order it was spoken.
 *  A piece without words says so in its place so the gap is visible. */
export function joinTranscripts(pieces: { seq: number; transcript: string | null }[]): string {
  return [...pieces]
    .sort((a, b) => a.seq - b.seq)
    .map((p) => `[piece ${p.seq}]\n${(p.transcript ?? "").trim() || "(no words transcribed yet)"}`)
    .join("\n\n");
}
