// Publisher registry — one place the pipeline asks for a channel's publisher.

import type { Publisher } from "./types";
import { InstagramPublisher } from "./instagram";
import { YouTubePublisher } from "./youtube";
import { LinkedInPublisher } from "./linkedin";

export * from "./types";

export function publisherFor(channel: "instagram" | "youtube" | "linkedin"): Publisher {
  switch (channel) {
    case "instagram":
      return new InstagramPublisher();
    case "youtube":
      return new YouTubePublisher();
    case "linkedin":
      return new LinkedInPublisher();
  }
}

/** Which channels are live (credentials present) right now. */
export function configuredChannels(): string[] {
  return (["instagram", "youtube", "linkedin"] as const).filter((c) => publisherFor(c).configured);
}
