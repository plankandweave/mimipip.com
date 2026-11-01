/** Populate only after original quota-project mapping and the exact upload are approved.
 * Public client ID is identity metadata, never a client secret. Null fails closed.
 * Keep the same id for every retry; changing it is a separate upload approval.
 */
export type YouTubeReviewPlan = {
  id: string;
  caseId: string;
  cloudProjectId: string;
  oauthClientId: string;
  sha256: string;
  title: string;
  description: string;
  selfDeclaredMadeForKids: boolean;
};
export function youtubeReviewPlan(): YouTubeReviewPlan | null { return null; }
