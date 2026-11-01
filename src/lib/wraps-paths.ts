/**
 * Where the appliance-wraps range lives, in one place: its own hostname, and
 * the paths it owns on any host (the same Worker serves them on the apex too).
 *
 * Read by the edge gate (noindex for the unlaunched range, src/edge/gate.ts)
 * and by the phone's browse rail (hidden on wraps pages, MobileBrowseRail), so
 * the two cannot disagree about what counts as a wraps page. Import-free, so a
 * client component can use it without pulling in edge code.
 */
export const WRAPS_HOST = "wraps.mimi-pip.invalid";

const WRAPS_PATH_RE = /^\/(?:wraps|fridge-wraps|ac-wraps|washing-machine-wraps|dishwasher-wraps|dryer-wraps)(?:\/|$)/;

/** True for the range's own pages: /wraps, /fridge-wraps, … and below. */
export function isWrapsPath(pathname: string): boolean {
  return WRAPS_PATH_RE.test(pathname);
}
