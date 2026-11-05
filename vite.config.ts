import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
import path from 'node:path';
import {publishedSitemapXml} from './src/brand/review/published-sitemap';
export default defineConfig({
 define:{'process.env.MIMIPIP_LOCAL_REVIEW':JSON.stringify('1'),'process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW':JSON.stringify('1')},
 plugins:[{
   name:'mimipip-published-sitemap',
   generateBundle() {
     if (this.environment.name === 'client') this.emitFile({type:'asset',fileName:'sitemap.xml',source:publishedSitemapXml});
   }
 },vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config:{name:'mimipip-com',main:'./worker/index.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,routes:[{pattern:'mimipip.com',custom_domain:true},{pattern:'www.mimipip.com',custom_domain:true}],triggers:{crons:['*/5 * * * *']},vars:{OS_BASE_URL:'https://os.magnitudegroup.in'},d1_databases:[{binding:'DB',database_name:'mimipip-orders',database_id:'a7adc803-e604-46ee-a846-62dc21daf7a5',migrations_dir:'drizzle'}]}})],
 resolve:{alias:{'@':path.resolve(import.meta.dirname,'src'),'sharp':path.resolve(import.meta.dirname,'empty-stub.js'),'@xenova/transformers':path.resolve(import.meta.dirname,'empty-stub.js'),'onnxruntime-node':path.resolve(import.meta.dirname,'empty-stub.js')}}
});
