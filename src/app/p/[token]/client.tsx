"use client";

import { useState } from "react";

// The deck plus the two things the "Outcreate" page could not do: say something
// back, and ask for a call — both of which land on the CRM deal's timeline
// instead of arriving as an unattributed mailto.

export function PresentationClient({
  token, title, format, videoUrl, leadVideoUrl, recipientName,
}: {
  token: string;
  title: string;
  format: "html" | "pdf" | "video";
  /** Signed, short-lived, and only ever set for a video. */
  videoUrl?: string | null;
  leadVideoUrl?: string | null;
  recipientName: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF8]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E0E0] px-5 py-3">
        <div>
          <p className="text-[0.95rem] font-semibold text-[#2D2D2D]">{title}</p>
          <p className="text-xs text-[#6B6B6B]">
            {recipientName ? `Prepared for ${recipientName}` : "Prepared for you"} · Zyvorah
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-[3px] bg-[#2D2D2D] px-4 py-2 text-xs font-semibold text-white"
        >
          {open ? "Close" : "Comment or ask for a call"}
        </button>
      </header>

      {leadVideoUrl && format === "html" && <Film url={leadVideoUrl} title={title} />}
      <div className="flex flex-1 flex-col lg:flex-row">
        {format === "video" ? (
          <Film url={videoUrl ?? null} title={title} />
        ) : (
          /* The deck runs in an opaque origin — see frame/route.ts. The sandbox
             attribute here is belt-and-braces; the response header is what
             actually holds, because it also covers a direct hit on the URL. */
          <iframe
            src={`/p/${token}/frame`}
            title={title}
            sandbox="allow-scripts allow-popups"
            className={`min-h-[70vh] flex-1 border-0 ${format === "pdf" ? "bg-[#525659]" : ""}`}
          />
        )}
        {open && <ResponsePanel token={token} onDone={() => setOpen(false)} />}
      </div>
    </div>
  );
}

// No download button and no picture-in-picture: the point of sending a concept
// film this way rather than as a mail attachment is that it stays a link we can
// revoke. Neither is a hard lock — a determined viewer can still capture what
// their screen shows — but nothing here hands out a copy.
function Film({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return (
      <div className="flex min-h-[70vh] flex-1 items-center justify-center bg-[#1C1C1C] px-6">
        <p className="max-w-sm text-center text-sm text-white/80">
          This film couldn&rsquo;t be loaded. Refresh the page — and if it still
          won&rsquo;t play, contact Zyvorah through the response panel.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center bg-[#1C1C1C]">
      <video
        src={url}
        title={title}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        className="max-h-[85vh] w-full"
      />
    </div>
  );
}

function ResponsePanel({ token, onDone }: { token: string; onDone: () => void }) {
  const [kind, setKind] = useState<"comment" | "call">("comment");
  const [anchor, setAnchor] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const send = async () => {
    setState("sending");
    const res = await fetch(`/api/p/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, anchor, body }),
    });
    setState(res.ok ? "sent" : "error");
    if (res.ok) { setBody(""); setAnchor(""); }
  };

  return (
    <aside className="w-full shrink-0 border-t border-[#E0E0E0] bg-white p-5 lg:w-[340px] lg:border-l lg:border-t-0">
      {state === "sent" ? (
        <div>
          <p className="text-sm font-semibold text-[#2D2D2D]">
            {kind === "call" ? "We'll be in touch to fix a time." : "Thank you — that's with us."}
          </p>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            It went straight to the person who sent you this.
          </p>
          <button
            onClick={() => { setState("idle"); onDone(); }}
            className="mt-4 text-xs underline"
          >
            Back to the proposal
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 rounded-[4px] bg-[#F3EEE7] p-1">
            {(["comment", "call"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 rounded-[3px] px-2 py-1.5 text-xs ${
                  kind === k ? "bg-white font-semibold" : "text-[#6B6B6B]"}`}
              >
                {k === "comment" ? "Comment" : "Ask for a call"}
              </button>
            ))}
          </div>

          {kind === "comment" && (
            <input
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              placeholder="Which part? e.g. the Bangalore floor"
              className="mt-3 w-full rounded-[3px] border border-[#E0E0E0] px-3 py-2 text-xs outline-none focus:border-[#8C7B6B]"
            />
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder={
              kind === "call"
                ? "When suits you, and anything you'd like covered on the call?"
                : "What did you think?"
            }
            className="mt-2 w-full rounded-[3px] border border-[#E0E0E0] p-3 text-sm outline-none focus:border-[#8C7B6B]"
          />

          <button
            onClick={send}
            disabled={state === "sending" || body.trim().length < 2}
            className="mt-2 w-full rounded-[3px] bg-[#2D2D2D] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {state === "sending" ? "Sending…" : kind === "call" ? "Request a call" : "Send comment"}
          </button>
          {state === "error" && (
            <p className="mt-2 text-xs text-[#6B5D4F]">That didn&apos;t send. Try once more.</p>
          )}
        </>
      )}
    </aside>
  );
}
