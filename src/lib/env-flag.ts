/**
 * An environment variable that means yes or no.
 *
 * `process.env.X === "true"` looks exact, and is a trap. These values are set
 * with `wrangler secret put`, which reads the value from stdin — and the
 * obvious `echo true | wrangler secret put X` sends "true\n". A trailing
 * newline, a stray space, or "True" then compares false: the feature stays
 * off, the dashboard reports it as never set, and the two states are
 * indistinguishable from outside. Someone sets the switch, nothing changes,
 * and there is nothing to see.
 *
 * So the parse is forgiving about shape and strict about meaning: trim, lower,
 * and accept the words a person actually types for "on".
 */
export function envFlag(value: string | undefined | null): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}
