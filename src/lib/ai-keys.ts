import { serviceAvailable, requireService } from "../brand/services";
// One Anthropic key per workflow (founder, 10 October 2026).
//
// On 9 October the site's one shared key was refused, and with it every AI
// step on the website at once. A leak had been draining the account for weeks
// and could not be traced: the Console shows usage per KEY, and every workflow
// spent the same one, so a drain looked exactly like the shop working. "Create
// individual keys for workflow so I can isolate the drains."
//
// So every AI call on the website names its workflow here, and spends that
// workflow's key. Each key is created in the Console under the `console` name
// below and set as a secret on the zyvorah-store Worker under `env`, by the
// founder directly — a key never travels through a chat or a commit.
//
// Until a workflow's key is set it spends the shared ANTHROPIC_API_KEY, so a
// split never stops a workflow. Once every key exists, usage still landing on
// the shared key is a workflow with no key of its own — a finding, not noise.
// Instagram already has its own keys and never reads these
// (marketing/providers/copy.ts, INSTAGRAM_KEYS).
//
// A new AI call adds itself to a workflow here; it never reads
// ANTHROPIC_API_KEY directly. ai-keys.test.ts sweeps src/ for that.

// Every model call is reported to the group's meter in the OS: loading this
// module puts the observer in place (see ai-meter.ts).
import "./ai-meter";

export const AI_WORKFLOWS = {
  outreach: {
    env: "ANTHROPIC_KEY_OUTREACH",
    console: "zyvorah-outreach",
    what: "Outreach drafts and the outreach inbox classifier",
  },
  quotations: {
    env: "ANTHROPIC_KEY_QUOTATIONS",
    console: "zyvorah-quotations",
    what: "The ZYV/Q quotation desk",
  },
  vijaySales: {
    env: "ANTHROPIC_KEY_VIJAY_SALES",
    // Also read under the spelling on the founder's key sheet of 10 October
    // (ANTHROPIC_KEY_VIJAYSALES), and under the first split's name
    // (ANTHROPIC_KEY_STORES), so a key set under either keeps working.
    legacyEnvs: ["ANTHROPIC_KEY_VIJAYSALES", "ANTHROPIC_KEY_STORES"],
    console: "zyvorah-vijay-sales",
    what: "Vijay Sales measured stores: drawing intake, wall allocation and composition, revisions, design geometry and focal points, the floor review, wall studies — and the media container's band composer",
  },
  proposals: {
    env: "ANTHROPIC_KEY_PROPOSALS",
    console: "zyvorah-proposals",
    what: "The B2B Proposal Studio, plus partner work that is neither Vijay Sales nor HomeLane: portfolio walkthrough drafts and PIN-code lookups for stores and orders",
  },
  homelane: {
    env: "ANTHROPIC_KEY_HOMELANE",
    console: "zyvorah-homelane",
    what: "Any AI call made for a signed-in HomeLane account (today: the PIN-code lookup when a HomeLane admin adds a store without one)",
  },
  crm: {
    env: "ANTHROPIC_KEY_CRM",
    console: "zyvorah-crm",
    what: "CRM dictation and task actions",
  },
  founder: {
    env: "ANTHROPIC_KEY_FOUNDER",
    console: "zyvorah-founder-desk",
    what: "Weekly intelligence report, approved-decision executor, order thank-you emails",
  },
  shoppers: {
    env: "ANTHROPIC_KEY_SHOPPERS",
    console: "zyvorah-shoppers",
    what: "Anything a member of the public can trigger: concierge chat, voice agent and follow-up calls, search by photo, the curator, trade-partner proof review",
  },
  catalogue: {
    env: "ANTHROPIC_KEY_CATALOGUE",
    console: "zyvorah-catalogue",
    what: "Catalogue tagging, the design Studio, the weekly newsletter",
  },
  marketing: {
    env: "ANTHROPIC_KEY_MARKETING",
    console: "zyvorah-marketing",
    what: "Ad plans, LinkedIn and YouTube copy, customer email drafts (not Instagram)",
  },
  prism: {
    env: "ANTHROPIC_KEY_PRISM",
    // The founder keeps ONE Console key for the whole campus pipeline
    // ("Partner Campus Workflow", 12 October 2026); each campus workflow
    // reads it when it has no key of its own.
    legacyEnvs: ["ANTHROPIC_KEY_CAMPUS"],
    console: "zyvorah-prism",
    what: "Prism, the campus design engine: the campus story and a concept per wall, revisions with the founder, and finding the wall plane on campus photographs",
  },
  lumen: {
    env: "ANTHROPIC_KEY_LUMEN",
    // The founder keeps ONE Console key for the whole campus pipeline
    // ("Partner Campus Workflow", 12 October 2026); each campus workflow
    // reads it when it has no key of its own.
    legacyEnvs: ["ANTHROPIC_KEY_CAMPUS"],
    console: "zyvorah-lumen",
    what: "Lumen, the campus presentation film: the narration script in the founder's register, one scene per wall",
  },
  timbre: {
    env: "ANTHROPIC_KEY_TIMBRE",
    // The founder keeps ONE Console key for the whole campus pipeline
    // ("Partner Campus Workflow", 12 October 2026); each campus workflow
    // reads it when it has no key of its own.
    legacyEnvs: ["ANTHROPIC_KEY_CAMPUS"],
    console: "zyvorah-timbre",
    what: "Timbre, the house voice: writing a spoken line in Hindi, Tamil, Kannada or another campus language before it is spoken",
  },
  sonar: {
    env: "ANTHROPIC_KEY_SONAR",
    // The founder keeps ONE Console key for the whole campus pipeline
    // ("Partner Campus Workflow", 12 October 2026); each campus workflow
    // reads it when it has no key of its own.
    legacyEnvs: ["ANTHROPIC_KEY_CAMPUS"],
    console: "zyvorah-sonar",
    what: "Sonar, the talking wall: writing what a wall says to the person who scans its QR, from Prism's concept",
  },
} as const;

export type AiWorkflow = keyof typeof AI_WORKFLOWS;

export const SHARED_ANTHROPIC_KEY = "ANTHROPIC_API_KEY";

const clean = (v: string | undefined) => v?.trim() || undefined;

/** The setting a workflow's key is read from: its own when set, otherwise the shared one. */
function keySetting(workflow: AiWorkflow, env: Record<string, string | undefined>): { name: string; key: string } | undefined {
  const w: { env: string; legacyEnvs?: readonly string[] } = AI_WORKFLOWS[workflow];
  for (const name of [w.env, ...(w.legacyEnvs ?? []), SHARED_ANTHROPIC_KEY]) {
    const key = clean(env[name]);
    if (key) return { name, key };
  }
  return undefined;
}

/** The key a workflow spends: its own when set, otherwise the shared one. */
export function anthropicKeyFor(workflow: AiWorkflow, env: Record<string, string | undefined> = process.env): string | undefined {
  if (workflow === "shoppers" && env === process.env && process.env.MIMIPIP_SHOPPER_SERVICES === "1") return "private-service-binding";
  if (env === process.env && !serviceAvailable("ai")) requireService("ai");
  return keySetting(workflow, env)?.key;
}

/**
 * Which setting a workflow's key came from, for an error message (12 October
 * 2026: "All the keys are given. There is no reason for this to fail." — the
 * refusal could not say whether the workflow's own key was refused or the
 * revoked shared one it fell back to). Names the setting and the key's last
 * four characters, which the Console also shows; never the key.
 */
export function anthropicKeySource(workflow: AiWorkflow, env: Record<string, string | undefined> = process.env): string {
  const own = AI_WORKFLOWS[workflow].env;
  const s = keySetting(workflow, env);
  if (!s) return `no key: neither ${own} nor ${SHARED_ANTHROPIC_KEY} is set`;
  const tail = `key ending …${s.key.slice(-4)}`;
  if (s.name === SHARED_ANTHROPIC_KEY) return `spent the shared ${SHARED_ANTHROPIC_KEY} (${tail}) because ${own} is not set on this Worker`;
  return `spent ${s.name} (${tail})`;
}

/**
 * The workflow for an AI call made on behalf of a signed-in partner account
 * (founder, 10 October 2026: "Keep Vijay Sales as a separate key and HomeLane
 * as a separate key"). Partner routes pass the session's account slug here
 * rather than naming a workflow, so a partner's spend lands on that partner's
 * key whichever screen it came from.
 */
export function partnerWorkflow(accountSlug: string | null | undefined): AiWorkflow {
  if (accountSlug === "homelane") return "homelane";
  if (accountSlug === "vijay-sales") return "vijaySales";
  return "proposals";
}
