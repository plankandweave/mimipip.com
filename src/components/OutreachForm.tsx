"use client";

import { useState } from "react";
import { CREATOR_PLATFORMS, PLATFORM_LABEL, cleanCreatorHandle, profileUrl, type CreatorPlatform } from "@/lib/creator-platforms";

// The intake form behind /collaborate and /press. Same component, two shapes —
// the `kind` decides which questions appear and what goes into `fields`, which
// the AI screener reads alongside the free-text pitch. Nothing here is sent to
// the applicant: submitting only puts the inquiry in front of Roheena.

type Kind = "influencer" | "press";

const AUDIENCES = ["Mostly India", "India and overseas", "Mostly overseas"];
const FOLLOWERS = ["Under 5k", "5k–25k", "25k–100k", "100k–500k", "500k+"];
const CREATOR_ASKS = [
  "Gifted wallpaper for my own wall",
  "Paid partnership",
  "Affiliate / discount code",
  "Content trade (I shoot, you use it)",
  "Long-term ambassador",
];
const PRESS_NEEDS = [
  "Hi-res product & mural imagery",
  "Founder interview (Roheena)",
  "Brand story & written background",
  "Samples for a shoot",
  "Numbers & business facts",
  "Studio / printing visit",
];
const PRESS_TYPES = ["Magazine", "Newspaper", "Online publication", "Newsletter", "Podcast", "TV / video", "Freelance — pitching this"];

const field =
  "h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal";
const area =
  "w-full rounded-[14px] border border-edge bg-surface px-4 py-3 outline-none focus:border-charcoal";
const label = "text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-mist";

export function OutreachForm({
  kind,
  onUnlocked,
}: {
  kind: Kind;
  /** Press-kit gate only: fired instead of the usual "thanks" card when the
   *  server's synchronous AI check clears this submission on the spot. When
   *  omitted (e.g. on /collaborate), or when the check doesn't clear it, the
   *  form falls back to its normal "we'll be in touch" behaviour below. */
  onUnlocked?: (reference: string) => void;
}) {
  const creator = kind === "influencer";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<CreatorPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [outlet, setOutlet] = useState("");
  const [city, setCity] = useState("");
  const [followers, setFollowers] = useState("");
  const [audience, setAudience] = useState("");
  const [outletType, setOutletType] = useState("");
  const [deadline, setDeadline] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [linksText, setLinksText] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  const options = creator ? CREATOR_ASKS : PRESS_NEEDS;
  const toggle = (v: string) =>
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    setError("");

    if (name.trim().length < 2) return setError("Please tell us your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Please enter a valid email address.");
    const cleanHandle = creator ? cleanCreatorHandle(platform, handle) : null;
    if (creator && !cleanHandle)
      return setError(`Please enter your ${PLATFORM_LABEL[platform]} handle, e.g. @yourname.`);
    if (!creator && outlet.trim().length < 2) return setError("Please tell us the publication you write for.");
    if (message.trim().length < 20)
      return setError(creator
        ? "Tell us a little more — a couple of lines about what you'd make."
        : "Tell us a little more about the story you're working on.");

    const links = linksText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`))
      .slice(0, 6);
    // A non-Instagram profile is checked as a link, as Instagram's is by handle.
    if (cleanHandle && platform !== "instagram") links.unshift(profileUrl(platform, cleanHandle));

    const fields: Record<string, string | string[]> = { city };
    if (creator) {
      fields.platform = platform;
      fields.followers = followers;
      fields.audience = audience;
      fields.looking_for = picked;
    } else {
      fields.outlet_type = outletType;
      fields.deadline = deadline;
      fields.needs = picked;
    }

    setState("busy");
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          email: email.trim(),
          handle: cleanHandle,
          outlet: creator ? null : outlet.trim(),
          links,
          fields,
          message: message.trim(),
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("idle");
        setError(
          data.error === "duplicate"
            ? "We already have a note from you that we're still reading — we'll come back to it."
            : "Something went wrong at our end. Please try again, or email hello@zyvorah.com.",
        );
        return;
      }
      if (kind === "press" && data.unlocked && onUnlocked) {
        onUnlocked(data.reference ?? "");
        return;
      }
      setReference(data.reference ?? "");
      setState("done");
    } catch {
      setState("idle");
      setError("Something went wrong at our end. Please try again, or email hello@zyvorah.com.");
    }
  };

  if (state === "done") {
    return (
      <div className="mt-8 rounded-[20px] bg-sage/50 px-6 py-6 text-sm leading-relaxed text-charcoal">
        <p className="font-semibold">Thank you — it&apos;s with us. ✦</p>
        <p className="mt-2">
          {creator
            ? "We read every note ourselves. Roheena sees it personally, and you'll hear back either way — usually within a few working days."
            : "Roheena sees press notes personally and replies herself. If you're on a deadline, do say so in a reply to this thread and we'll move faster."}
        </p>
        {reference && <p className="mt-3 text-xs text-slate">Your reference: <strong>{reference}</strong></p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {/* honeypot — never visible to a person */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={website} onChange={(e) => setWebsite(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      {creator ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid grid-cols-[8.5rem_1fr] gap-3">
            <select className={field} aria-label="Main platform" value={platform} onChange={(e) => setPlatform(e.target.value as CreatorPlatform)}>
              {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
            </select>
            <input className={field} placeholder={`${PLATFORM_LABEL[platform]} handle (@yourname)`} value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <select className={field} value={followers} onChange={(e) => setFollowers(e.target.value)}>
            <option value="">Audience size</option>
            {FOLLOWERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={field} placeholder="Publication or outlet" value={outlet} onChange={(e) => setOutlet(e.target.value)} />
          <select className={field} value={outletType} onChange={(e) => setOutletType(e.target.value)}>
            <option value="">Type of outlet</option>
            {PRESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} placeholder={creator ? "City (e.g. Pune, Jaipur)" : "City"} value={city} onChange={(e) => setCity(e.target.value)} />
        {creator ? (
          <input className={field} placeholder="Other links — other platforms, portfolio" value={linksText} onChange={(e) => setLinksText(e.target.value)} />
        ) : (
          <input className={field} placeholder="Your deadline (optional)" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        )}
      </div>

      {creator && (
        <select className={field} aria-label="Where your audience is" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="">Where is your audience?</option>
          {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      {!creator && (
        <input className={field} placeholder="Links to two or three recent pieces you've written" value={linksText} onChange={(e) => setLinksText(e.target.value)} />
      )}

      <div>
        <p className={label}>{creator ? "What you're hoping for" : "What you need from us"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((o) => {
            const on = picked.includes(o);
            return (
              <button
                key={o} type="button" onClick={() => toggle(o)} aria-pressed={on}
                className={`rounded-full border px-4 py-2 text-[0.8rem] transition-colors ${
                  on ? "border-charcoal bg-charcoal text-surface" : "border-edge bg-surface text-slate hover:border-charcoal"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={label}>{creator ? "What you'd make with us" : "The story you're working on"}</p>
        <textarea
          className={`${area} mt-3`}
          rows={6}
          placeholder={creator
            ? "The wall you have in mind, the designs you're drawn to, how you'd shoot it, and what you'd like from us in return (in rupees if you're in India). The more specific, the better — we say yes to ideas, not to follower counts."
            : "Your angle, the section or issue it's for, roughly when it runs, and what you'd need from us. If you're pitching rather than commissioned, say so — we're glad to help either way."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-charcoal/80">{error}</p>}

      <button type="submit" disabled={state === "busy"} className="btn h-12 px-7 text-[0.82rem]">
        {state === "busy" ? "Sending…" : creator ? "Send your idea" : "Send your request"}
      </button>
      <p className="text-xs text-mist">
        Your note goes straight to Roheena. We check the details automatically to save everyone time,
        but every reply is hers — nothing automated is ever sent to you.
      </p>
    </form>
  );
}
