/** Native gift-card entry point. Legacy Supabase issuance is deliberately unreachable.
 * Artwork previews can ship independently; selling stored value requires the native
 * redemption ledger, commercial policy and delivery outbox to be verified together.
 */
export async function handleGiftCard(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'};
  if (path === '/api/gift-card/readiness' && ['GET','HEAD'].includes(request.method)) {
    return Response.json({open:false,currencies:['INR'],message:'Choose a design and preview your gift. Online gift-card purchases are not available yet.'}, {headers});
  }
  // No provider calls, balance changes, codes or emails are possible in preview mode.
  return Response.json({error:'Gift-card purchases and activation are not available yet.',status:'unavailable'}, {status:503,headers});
}
