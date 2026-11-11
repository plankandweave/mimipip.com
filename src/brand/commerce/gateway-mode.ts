/**
 * Whether the Razorpay key behind STORE_PAY takes real money.
 *
 * A test key's payments read as `captured` exactly like real ones, but no money
 * moves. So nothing of value — a paid order sent to the OS for printing, a
 * spendable gift card, a gift email — may come of a payment unless the key is
 * live. Only the key's PUBLIC id is read (Razorpay hands it to every buyer's
 * browser), and only its mode ever leaves this file; never the id itself.
 *
 * Fail closed: anything that is not plainly a live key id is not live.
 */
export type GatewayMode = 'live' | 'test' | 'unknown';

export function gatewayModeOf(keyId: unknown): GatewayMode {
  if (typeof keyId !== 'string') return 'unknown';
  if (/^rzp_live_[A-Za-z0-9]+$/.test(keyId)) return 'live';
  if (/^rzp_test_[A-Za-z0-9]+$/.test(keyId)) return 'test';
  return 'unknown';
}

export async function gatewayMode(pay: { keyId(): unknown } | undefined | null): Promise<GatewayMode> {
  if (!pay) return 'unknown';
  try { return gatewayModeOf(await pay.keyId()); } catch { return 'unknown'; }
}

export const NOT_LIVE = 'gateway_not_live';
