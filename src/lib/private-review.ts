export const REVIEW_LIMIT = 40 * 1024 * 1024;
export const REVIEW_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
export function reviewPath(company: string, digest: string, asset: string) {
  if (!/^[0-9a-f-]{36}$/.test(company) || !/^[0-9a-f]{64}$/.test(digest) || (!['deck.html', 'film.mp4', 'booklet.pdf', 'complete.json'].includes(asset) && !/^ltm-[0-9a-f]{64}\.html$/.test(asset))) throw new Error('Invalid review path');
  return `staff-reviews/${company}/${digest}/${asset}`;
}
