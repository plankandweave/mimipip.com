# Zyvorah marketing engine

Composes and publishes social content (Instagram; LinkedIn — written by Astra,
see "LinkedIn" in `docs/marketing-desk.md` — posting by hand until connected)
from a **plan in the database** (`marketing_plans` / `marketing_plan_slots`,
see `plan.ts` and `docs/marketing-desk.md`), falling back to a catalogue
rotation on days no plan covers. Every post passes a mechanical brand-safety
gate, and **nothing publishes without the founder's approval on
`/admin/marketing`** — the desk that shows the plan as an Instagram grid, a
calendar, the Stories and the ads.

## The loop

`select → caption (safety-gated) → compose media → upload → ledger(queued) →
publish if channel configured → measure → re-plan`

Runs headless from `GET /api/cron/marketing` (daily, `CRON_SECRET`-gated). Each
tick backfills metrics for matured posts (so the engine learns), then generates
and (if credentials exist) publishes the next post. Idempotent per `slot_key` —
a retry never double-posts.

## Files

| Area | File |
|---|---|
| The plan: strategies + intended posts, import | `plan.ts` |
| Word plate (WORD beat, launch triptych) + mats | `media/plate.ts`, `media/mats.ts` |
| Voice + banned terms + pillars | `voice.ts` |
| Brand-safety gate (the autonomy seatbelt) | `safety.ts` |
| Product/pillar selection + ledger dedupe | `select.ts` |
| IG caption generation (regenerate-on-fail) | `caption.ts` |
| LinkedIn + YouTube copy (LinkedIn fallback + note rewrites) | `channels.ts` |
| LinkedIn rules: cadence, runway, wording gate, feed fold | `linkedin-desk.ts` |
| Astra's weekly LinkedIn run (brief → write → check → import) | `../../../scripts/linkedin-agent.ts` |
| Still/carousel/story compositing (Sharp) | `media/image.ts` |
| Reel compositing (ffmpeg camera moves) | `media/reel.ts` |
| Synthesized-lifestyle provider (waits on model) | `providers/image-gen.ts` |
| Publishers (IG / YT / LinkedIn) | `publish/*.ts` |
| Orchestrator | `pipeline.ts` |
| Learn + re-plan | `insights.ts` |
| Cron entry | `../../app/api/cron/marketing/route.ts` |
| Admin dashboard | `../../app/admin/marketing/page.tsx` |
| Ledger table + admin RPC | `../../../supabase/migrations/0014_marketing_engine.sql` |

Local preview of what it would post (no publishing):
`npx tsx --env-file=.env.local --env-file=.env.development.local scripts/generate-week.ts 7`

## Hard rules (enforced in code, not just prompts)

1. **No trade secrets.** No printer/machine/ink/supplier names, no pipeline
   internals, no tool names. See `BANNED_TERMS` in `voice.ts`; the gate hard-blocks
   any hit. Lead with the named mural design and its room. Do not use sizing or production as a creative selling line.
2. **No wrong prices.** Any ₹ figure must match the live catalogue from-price; the
   gate blocks hallucinated/stale/unverifiable prices.

## Environment variables

Already present (used for reads + captions): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.

**Required for the engine to persist media + posts (set on Vercel):**
- `SUPABASE_SERVICE_ROLE_KEY` — writes the ledger + uploads composed media to the
  `marketing-media` bucket. Without it the pipeline dry-runs (generates + safety-
  checks but persists nothing).

**Required to actually publish (set each when its account/app exists):**
- Instagram: `IG_BUSINESS_ACCOUNT_ID`, `IG_ACCESS_TOKEN` (long-lived Page token
  with `instagram_content_publish`), optional `IG_GRAPH_VERSION`.
- YouTube: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` — Worker secrets on
  `zyvorah-store`, written by `node scripts/youtube-connect.mjs` (one Google sign-in
  as the @zyvorahwallpapers channel). Every Reel that publishes on Instagram queues
  a YouTube Short twin (`<slot>~yt`, format `short`) that inherits its approval and
  publishes on the next tick. Shorts upload PRIVATE until Google's YouTube API
  audit passes; the first upload that comes back public records it in
  `admin_config.youtube_public_ok` and `releasePrivateShorts()` turns the earlier
  ones public once.
- LinkedIn: `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN`, optional `LINKEDIN_API_VERSION`.

**Optional — synthesized-lifestyle lane** (a generated room seeded with our real
pattern): `MARKETING_IMAGE_PROVIDER` + that provider's API key. Until set, the
engine uses owned scene renders (which is plenty). Implement a provider in
`providers/image-gen.ts` and register it.

Each channel independently: absent credentials → posts stay `queued` in the
ledger, published automatically once the credentials land. No code change needed.
