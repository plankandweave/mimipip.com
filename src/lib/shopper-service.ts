import "./ai-meter";
/** Existing Magnitude service credentials remain in the Zyvorah Worker. */
export async function shopperServiceFetch(path: string, init: RequestInit): Promise<Response> {
  const { env } = await import(/* @vite-ignore */ 'cloudflare:workers') as {
    env: { SHOPPER_TOOLS?: { fetch(request: Request): Promise<Response> } };
  };
  if (!env.SHOPPER_TOOLS) throw new Error('Shopper service binding is unavailable');
  return env.SHOPPER_TOOLS.fetch(new Request(`https://mimipip-tools.internal${path}`, init));
}

/** Anthropic SDK transport, only for the existing shopper workflow. */
export const shopperAiFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== 'https://api.anthropic.com' || url.pathname !== '/v1/messages' || request.method !== 'POST') {
    throw new Error('Unsupported shopper AI operation');
  }
  return shopperServiceFetch('/anthropic/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: await request.arrayBuffer(), signal: request.signal,
  });
};
