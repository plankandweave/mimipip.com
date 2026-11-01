"use client";
import { useState } from "react";
import { storyProductUrl } from "@/lib/marketing/story-link";
import { isRetiredStoryFrame } from "@/lib/marketing/story-frame";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";

export function StoryLink({ slot }: { slot: DeskSlot }) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const url = storyProductUrl(typeof slot.art?.story_design_handle === "string" ? slot.art.story_design_handle : slot.handle ?? slot.post?.product_handle);
  return <div style={{ padding: 12, border: "1px solid #d8b76b", borderRadius: 8, background: "#fff8e7", color: "#382b16", fontSize: 13, lineHeight: 1.5 }}>
    <strong>Wallpaper destination</strong>
    {slot.post && isRetiredStoryFrame(slot.post) && <p style={{ margin: "6px 0" }}><strong>Old Story artwork: redraw or replace it and review the new pixels before publication.</strong></p>}
    <p style={{ margin: "6px 0" }}>The exact design link is retained for reference. A native Link sticker is optional and never holds automatic Story publishing.</p>
    {url ? <><a href={url} target="_blank" rel="noreferrer" style={{ color: "inherit", overflowWrap: "anywhere" }}>{url}</a>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopiedUrl(url); }} style={{ display: "block", marginTop: 8 }}>{copiedUrl === url ? "Link copied" : "Copy wallpaper link"}</button></>
      : <p>Identify the exact wallpaper before publishing. No product destination is recorded.</p>}
    <p style={{ margin: "8px 0 0" }}>For an optional manual sticker, use “Shop this wallpaper” and check that it opens this design.</p>
    <p style={{ margin: "8px 0 0" }}>When publishing manually, you may add a transparent native Link sticker aligned above the reply controls. Automatic Stories publish without one.</p>
  </div>;
}
