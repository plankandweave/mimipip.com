/** Transport for empty-catalogue tests. Never forwards a request. Not a database emulator. */
export async function offlineDatabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const method = (init?.method || request.method).toUpperCase();
  if (url.origin !== 'https://database.invalid') throw new Error('Offline database transport rejected foreign origin');
  if (url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/') && ['GET','HEAD'].includes(method)) {
    const headers = new Headers(init?.headers || request.headers);
    if (headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
      return Response.json({code:'PGRST116',message:'No rows in empty brand catalogue',details:'The result contains 0 rows'}, {status:406});
    }
    return new Response(method === 'HEAD' ? null : '[]', {status:200,headers:{'Content-Type':'application/json','Content-Range':'*/0'}});
  }
  return Response.json({code:'BRAND_SERVICE_NOT_CONFIGURED',message:'No isolated database operation configured'}, {status:503});
}
