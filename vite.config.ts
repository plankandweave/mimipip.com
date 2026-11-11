import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
import path from 'node:path';
// The shop's public backend address and its publishable key. Both are sent to every browser by
// design (they are in the page's own scripts), so they live here and the build no longer depends
// on an untracked .env.local on one person's machine. Server secrets stay in Cloudflare, never here.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://qrtznwnhuzkpynjetygg.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_YQNscT0qZnWXCMqTUZPEAQ_i18oiwjV';
export default defineConfig({
 define:{'process.env.MIMIPIP_LOCAL_REVIEW':JSON.stringify('1'),'process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW':JSON.stringify('1')},
 // The sitemap is served by the Worker (worker/index.ts), from the list of what is on sale: no static copy to fall out of date.
 plugins:[vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config:{name:'mimipip-com',main:'./worker/index.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,
  // Run the Worker next to the database it reads, not next to the visitor. Every page makes several
  // Supabase calls; from a far edge each one pays a long round trip, and the home page took 4.5 to 10
  // seconds to start (daily site checks, 10 Nov 2026). The Zyvorah store has run this since it measured
  // 1.6 to 3.8 s pages from an EU edge. Free; changes where the code runs, never what it shows.
  placement:{mode:'smart'},routes:[{pattern:'mimipip.com',custom_domain:true},{pattern:'www.mimipip.com',custom_domain:true}],triggers:{crons:['*/5 * * * *']},vars:{MIMIPIP_SHOPPER_SERVICES:'1',MIMIPIP_CHECKOUT_ENABLED:'1',MIMIPIP_SAMPLE_CHECKOUT_ENABLED:'1',MIMIPIP_LETTERING_CHECKOUT_ENABLED:'1',MIMIPIP_BUSINESS_INVOICE_ENABLED:'1'},services:[{binding:'SHOPPER_TOOLS',service:'zyvorah-store',entrypoint:'MimipipTools'},{binding:'STORE_PAY',service:'zyvorah-store',entrypoint:'MimipipPay'}],d1_databases:[{binding:'DB',database_name:'mimipip-orders',database_id:'a7adc803-e604-46ee-a846-62dc21daf7a5',migrations_dir:'drizzle'}]}})],
 resolve:{alias:{'@':path.resolve(import.meta.dirname,'src'),'sharp':path.resolve(import.meta.dirname,'empty-stub.js'),'@xenova/transformers':path.resolve(import.meta.dirname,'empty-stub.js'),'onnxruntime-node':path.resolve(import.meta.dirname,'empty-stub.js')}}
});
