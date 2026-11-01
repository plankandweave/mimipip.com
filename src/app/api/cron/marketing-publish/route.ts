import { NextResponse } from 'next/server';
import { withCronRun } from '@/lib/cron-run';
import { publishApproved } from '@/lib/marketing/pipeline';
import { cadenceShortfall, type CadenceLedgerRow } from '@/lib/marketing/cadence';
import { hasServiceRole, serviceClient } from '@/lib/marketing/db';
import { nextDay } from '@/lib/marketing/plan';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
// Uses the existing signed publisher only; never composes, spends or sends outreach.
//
// THE DAY'S LAST TICK (20:30 IST) SAYS WHETHER THE DAY WENT OUT. For six days
// in October 2026 nothing posted and this job reported ok, because "ok" meant
// "I ran", not "today has its posts". It now answers 503 when today ended
// short of a grid post and four Stories, naming what is missing, so the day
// is red in cron health and the next morning's brief.
export const GET=withCronRun('marketing-publish',async(req:Request)=>{
  const secret=process.env.CRON_SECRET;
  if(!secret || req.headers.get('authorization')!==`Bearer ${secret}`) return NextResponse.json({error:'unauthorized'},{status:401});
  // Every approved post for TODAY, timed or not (was timed only, from the days
  // marketing ran hourly). marketing now publishes at 11:30 and 17:30 IST, so
  // a cadence post approved after 17:30 had no tick left on its own day.
  const published=await publishApproved(new Date(),{todayOnly:true});
  const missing=await todayMissing();
  return NextResponse.json({ok:!missing.length,...(missing.length?{error:`today is short: ${missing.join(', ')}`}:{}),published,missing},{status:missing.length?503:200});
});

/** What today still lacks on Instagram, counting only what has actually gone out. */
async function todayMissing():Promise<string[]>{
  if(!hasServiceRole())return [];
  const today=new Date(Date.now()+5.5*3600_000).toISOString().slice(0,10);
  const {data,error}=await serviceClient().from('marketing_posts').select('slot_key,status,format,channel,product_handle')
    .gte('slot_key',`${today}#`).lt('slot_key',`${nextDay(today)}#`).eq('status','published');
  if(error)throw new Error(`publish ledger read: ${error.message}`);
  return cadenceShortfall(today,(data??[]) as CadenceLedgerRow[]);
}
