import {NextResponse} from 'next/server';
import {z} from 'zod';
import {supabaseAdmin} from '@/lib/supabase-admin';
const contact=z.object({type:z.literal('contact'),name:z.string().trim().max(100).optional(),email:z.string().trim().email().max(254),message:z.string().trim().min(2).max(5000),topic:z.string().trim().max(160).optional()});
/** Mimi Pip enquiries remain in its isolated store and are read by the OS desk. */
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
 const parsed=contact.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Enter a valid email and your project details.'},{status:400});
 const db=supabaseAdmin();if(!db)return NextResponse.json({error:'Please retry shortly.'},{status:503});
 const {type,...data}=parsed.data;
 const {error}=await db.from('contact_messages').insert(data);
 return NextResponse.json(error?{error:'Your enquiry was not saved. Please retry.'}:{ok:true},{status:error?503:200,headers:{'Cache-Control':'no-store'}});
}
