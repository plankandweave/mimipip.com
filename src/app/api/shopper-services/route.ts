import { shopperServiceFetch } from '@/lib/shopper-service';
export async function GET() {
  try {
    const response = await shopperServiceFetch('/ready', {method:'GET'});
    if (!response.ok) throw new Error('Unavailable');
    const value = await response.json() as {ai?:boolean;media?:boolean};
    return Response.json({ai:value.ai===true,media:value.media===true},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({ai:false,media:false},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
