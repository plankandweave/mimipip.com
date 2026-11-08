import { sampleDesigns } from '@/brand/commerce/samples';
export async function GET(req:Request){
  const q=(new URL(req.url).searchParams.get('q')??'').trim().toLowerCase().slice(0,120);
  return Response.json({results:sampleDesigns.filter(p=>!q||p.title.toLowerCase().includes(q)).slice(0,q?6:24).map(p=>({...p,flatImage:p.image}))});
}
