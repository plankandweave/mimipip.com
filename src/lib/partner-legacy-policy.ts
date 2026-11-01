import { partnerCapabilities } from "./partner-capabilities";

/** Legacy surveys and token approval are operationally visible. An unknown
 * account is never evidence that its private purchasing gate is disabled. */
export function legacyPartnerWorkflowAllowed(
  account:
    | {
        slug?: string;
        capabilities?: Parameters<
          typeof partnerCapabilities
        >[0]["capabilities"];
      }
    | null
    | undefined,
): boolean {
  return !!account && !partnerCapabilities(account).poRequiredRelease;
}
