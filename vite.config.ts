import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
import {sites} from './scripts/vite/sites-vite-plugin';
import path from 'node:path';
export default defineConfig({
 define:{'process.env.MIMIPIP_LOCAL_REVIEW':JSON.stringify('1'),'process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW':JSON.stringify('1')},
 plugins:[vinext(),sites({mockAuth:false}),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config:{name:'mimipip',main:'./worker/index.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'mimipip-orders',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'drizzle'}]}})],
 resolve:{alias:{'@':path.resolve(import.meta.dirname,'src'),'sharp':path.resolve(import.meta.dirname,'empty-stub.js'),'@xenova/transformers':path.resolve(import.meta.dirname,'empty-stub.js'),'onnxruntime-node':path.resolve(import.meta.dirname,'empty-stub.js')}}
});
