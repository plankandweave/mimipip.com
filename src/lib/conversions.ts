// One call per business moment, fanned out to every measurement platform.
//
// Three ad platforms drive traffic to the store — Google Ads, Meta and
// ChatGPT — and each wants to hear about the same handful of moments. A call
// site must not have to know about all of them: it reports the moment once,
// here, and this file decides who is told. GA4 is always told, because it is
// the one place where the three platforms can be compared on equal footing.
//
// Purchase already fans out from `sendPurchase` in src/lib/ga.ts (GA4 + Google
// Ads) with `metaPurchase` beside it at the two checkout call sites; the two
// non-commerce goals live here.
//
// Meta's `Lead` and `CompleteRegistration` are wired below, at the same call
// sites and under the same rules.

import { gaGenerateLead, gaSignUp, type LeadType, type SignUpMethod } from "@/lib/ga";
import { adsConversion, adsSetUserData, type AdsUserData } from "@/lib/google-ads";
import { metaCompleteRegistration, metaLead, metaUserData } from "@/lib/meta-pixel";

/** A contact / enquiry / sample-request form was accepted by /api/forms. */
export function conversionLead(input: { leadType: LeadType; topic?: string; user: AdsUserData }): void {
  gaGenerateLead({ leadType: input.leadType, topic: input.topic });
  adsSetUserData(input.user);
  adsConversion("enquiry");
  metaUserData(input.user);
  metaLead({ topic: input.topic ?? input.leadType });
}

/** A completed account door, or a newsletter address accepted. */
export function conversionSignUp(input: { method: SignUpMethod; user: AdsUserData }): void {
  gaSignUp(input.method);
  adsSetUserData(input.user);
  adsConversion("signUp");
  metaUserData(input.user);
  metaCompleteRegistration(input.method);
}
